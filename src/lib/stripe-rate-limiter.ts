import Stripe from "stripe";

/**
 * Shared client-side Stripe rate limiter (token bucket) + the HTTP-client shim that
 * applies it to every request the Stripe singleton makes.
 *
 * --- Why this exists ----------------------------------------------------------
 * On 24 Aug 2026 ~900 memberships renewed inside one minute. The webhook fan-out blew
 * past Stripe's published limits and eleven members were charged without ever being
 * granted their entries. Stripe publishes two separate caps
 * (docs.stripe.com/rate-limits):
 *
 *   - Global API rate limit ......... 100 req/sec live mode, 25 req/sec sandbox
 *   - Individual API endpoints ....... 25 req/sec  (per endpoint)
 *
 * The SDK does NOT reliably protect us. `RequestSender._shouldRetry`
 * (node_modules/stripe/cjs/RequestSender.js:138) has **no branch on status 429**: it retries
 * connection errors, 409 and >=500. It DOES honour a `stripe-should-retry: true` response
 * header, which Stripe may send on a rate-limit response -- so a 429 is retried only if
 * Stripe volunteers that header, which is not something we control or can rely on. Treat
 * `maxNetworkRetries: 2` as no cover for 429.
 *
 * --- KNOWN LIMITATION: THIS LIMITER IS PER-LAMBDA-INSTANCE, NOT GLOBAL ---------
 * State lives in module scope, so each warm serverless instance keeps its own pair of
 * buckets. Vercel ran ~56 concurrent invocations during the 24 Aug burst, so the
 * *aggregate* ceiling this imposes is (per-instance rate x live instances):
 *
 *     80 req/sec x 56 instances = 4,480 req/sec -- far above Stripe's 100/sec account cap.
 *
 * So this is a **safety valve, not a global governor**. What it actually buys:
 *
 *   1. It meters the fan-out of a single invocation on the queue-DRAIN path. That cron
 *      drains SWEEP_BATCH_SIZE = 20 events *concurrently* via Promise.allSettled
 *      (src/app/api/cron/process-stripe-webhook-queue/route.ts:7,84) and a renewal costs
 *      ~7 Stripe calls, so one instance can fire ~140 requests essentially at once.
 *      This meters that spike into an 80/sec (20/sec per endpoint) stream.
 *   2. It guarantees no *single* instance can exhaust the account's budget on its own.
 *   3. It is the knob to turn down (env only, no code change) if 429s reappear.
 *
 * ** What it does NOT do, stated plainly: it will essentially never engage on the path
 * that caused the 24 Aug incident. ** The inbound receiver (/api/stripe/webhook) handles
 * ONE event per invocation via after(), so ~900 events spread over ~56 instances is ~2
 * calls/sec per instance -- two orders of magnitude under an 80/sec bucket. The honest
 * framing: this reduces the DEPTH of a 429 storm's retry backlog by metering the drain;
 * it does not prevent the storm. Account-level compliance rests on the call-count
 * reduction (10 -> 7 calls per renewal), not on this limiter.
 *
 * It also only covers calls made through THIS singleton. Three ops scripts build their
 * own `new Stripe(...)` and are unmetered -- see docs/billing-stripe/architecture.md.
 * They run via tsx by hand, never inside a lambda, so they do not multiply.
 *
 * A truly global limiter needs shared state (Redis / Mongo counter). That was
 * deliberately out of scope: it adds a network round-trip and a new failure mode to the
 * hot path of every payment in the app. If per-instance metering proves insufficient,
 * that is the follow-up -- see docs/billing-stripe/architecture.md.
 *
 * --- Why the shim sits at the HTTP layer, not around the singleton -------------
 * `src/lib/stripe.ts` exports ONE `stripe` singleton and ~83 server modules use it. A
 * Proxy over that object would have to stay transparent through: three-deep namespaces
 * (`stripe.testHelpers.testClocks.retrieve`), per-call options objects
 * (`{ idempotencyKey }` as a 2nd/3rd arg), the synchronous
 * `stripe.webhooks.constructEvent`, and -- the killer -- `ApiListPromise`, the
 * promise-plus-async-iterator returned by `.list()` / `.search()` that three call sites on
 * this singleton drive with `for await` (`cron/reconcile-blocked-transactions`,
 * `scripts/backfill-blocked-transactions`, `scripts/investigate-blocked-transactions`).
 * An `async` proxy method returns a plain Promise and silently breaks every one of them.
 *
 * `httpClient` avoids all of those hazards by construction. The SDK calls exactly two
 * methods on it -- `getClientName()` and `makeRequest()` (RequestSender.js:366,
 * stripe.core.js:283) -- and `makeRequest` is already awaited internally, so awaiting a
 * token inside it is invisible to everything above. Return shapes, auto-pagination,
 * error classes, `this` binding, options args and sync helpers are all untouched because
 * we never touch them. It also meters requests a proxy would MISS: auto-pagination's
 * follow-up pages, and the SDK's own network retries.
 *
 * --- Configuration ------------------------------------------------------------
 *   STRIPE_RATE_LIMIT_GLOBAL_PER_SECOND    default 80 live / 20 sandbox
 *   STRIPE_RATE_LIMIT_ENDPOINT_PER_SECOND  default 20
 * Set either to 0 to disable that bucket (the ops-script escape hatch).
 *
 * Defaults are 80% of Stripe's published caps, which is what makes claim (2) above true.
 * Sandbox drops the global default to 20 because sandbox's global cap is 25/sec, not
 * 100 -- preview deploys and local dev run on test keys.
 */

// --- Token bucket --------------------------------------------------------------

/**
 * Capacity is pinned to the per-second rate: a bucket holds at most one second of
 * traffic, so "80 per second" means 80 immediately and then a metered refill, never a
 * larger stored burst.
 */
interface Bucket {
  tokens: number;
  /** Timestamp (ms) the token count was last brought up to date. */
  lastRefillMs: number;
  /** Tokens added per second; also the bucket's capacity. */
  ratePerSecond: number;
  /** Never below 1, or a sub-1/sec rate could never accumulate a whole token. */
  capacity: number;
}

function createBucket(ratePerSecond: number, now: number): Bucket {
  const capacity = Math.max(1, ratePerSecond);
  return { tokens: capacity, lastRefillMs: now, ratePerSecond, capacity };
}

function refill(bucket: Bucket, now: number): void {
  const elapsedMs = now - bucket.lastRefillMs;
  if (elapsedMs <= 0) return;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + (elapsedMs / 1000) * bucket.ratePerSecond);
  bucket.lastRefillMs = now;
}

/** Milliseconds until this bucket holds a whole token. 0 when one is available now. */
function waitMs(bucket: Bucket): number {
  if (bucket.tokens >= 1) return 0;
  return Math.max(1, Math.ceil(((1 - bucket.tokens) / bucket.ratePerSecond) * 1000));
}

// --- Endpoint keys -------------------------------------------------------------

/**
 * Reduce a request path to the endpoint bucket it belongs to.
 *
 *   /v1/subscriptions/sub_123             -> /v1/subscriptions
 *   /v1/invoices?limit=100&status=paid    -> /v1/invoices
 *   /v1/payment_intents/pi_1/confirm      -> /v1/payment_intents
 *   /v2/core/events/evt_1                 -> /v2/core/events
 *
 * The SDK appends the query string to the path before handing it to the HTTP client
 * (StripeResource.js:162-167), so stripping it is required, not defensive.
 */
export function endpointKeyFromPath(path: string): string {
  const queryAt = path.indexOf("?");
  const withoutQuery = queryAt === -1 ? path : path.slice(0, queryAt);
  const segments = withoutQuery.split("/").filter(Boolean);
  if (segments.length === 0) return "/";
  // v2 nests one level deeper (/v2/<product>/<resource>) than v1 (/v1/<resource>).
  const depth = segments[0] === "v2" ? 3 : 2;
  return "/" + segments.slice(0, depth).join("/");
}

// --- Limiter -------------------------------------------------------------------

export interface RateLimiterOptions {
  /** Requests per second across every endpoint. 0 disables the global bucket. */
  globalPerSecond: number;
  /** Requests per second for any single endpoint. 0 disables per-endpoint buckets. */
  perEndpointPerSecond: number;
  /**
   * Emit a `console.error` when one acquire waits at least this long. At most one line
   * per LOG_INTERVAL_MS so a burst cannot flood the log. 0 disables logging.
   */
  logThresholdMs?: number;
}

export interface RateLimiterStats {
  /** Acquires currently waiting for a token. */
  queued: number;
  /** True while a refill timer is pending -- asserted by tests to prove no timer leak. */
  timerPending: boolean;
  /** Acquires that waited more than 0ms. */
  throttledCount: number;
  totalWaitedMs: number;
  maxWaitMs: number;
}

export interface RateLimiter {
  /** Resolves once both the global and the endpoint's bucket have a token to spend. */
  acquire(endpoint: string): Promise<void>;
  stats(): RateLimiterStats;
}

interface Waiter {
  endpoint: string;
  enqueuedAtMs: number;
  resolve: () => void;
}

const LOG_INTERVAL_MS = 10_000;
const DEFAULT_LOG_THRESHOLD_MS = 1_000;

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const globalRate = normaliseRate(options.globalPerSecond);
  const endpointRate = normaliseRate(options.perEndpointPerSecond);
  const logThresholdMs = options.logThresholdMs ?? DEFAULT_LOG_THRESHOLD_MS;

  const stats: RateLimiterStats = {
    queued: 0,
    timerPending: false,
    throttledCount: 0,
    totalWaitedMs: 0,
    maxWaitMs: 0,
  };

  // Both buckets off: hand back a no-op so callers pay nothing but a resolved promise.
  if (globalRate === 0 && endpointRate === 0) {
    return { acquire: () => Promise.resolve(), stats: () => ({ ...stats }) };
  }

  const globalBucket = globalRate > 0 ? createBucket(globalRate, Date.now()) : null;
  const endpointBuckets = new Map<string, Bucket>();

  // A single FIFO queue and a single pending timer. FIFO keeps the limiter
  // starvation-free and trivially deadlock-free: the head always becomes servable,
  // because both buckets refill on a wall clock that nothing in here can stop. It does
  // mean a throttled endpoint can briefly hold up a free one -- the accepted trade for
  // one queue instead of N interacting ones. Under the burst this exists for, every
  // endpoint is saturated anyway.
  const queue: Waiter[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastLogAtMs = 0;

  function bucketFor(endpoint: string): Bucket | null {
    if (endpointRate === 0) return null;
    let bucket = endpointBuckets.get(endpoint);
    if (!bucket) {
      bucket = createBucket(endpointRate, Date.now());
      endpointBuckets.set(endpoint, bucket);
    }
    return bucket;
  }

  /** Wait needed before `endpoint` can spend a token from every bucket that applies. */
  function waitForBoth(endpoint: string, now: number): number {
    let wait = 0;
    if (globalBucket) {
      refill(globalBucket, now);
      wait = Math.max(wait, waitMs(globalBucket));
    }
    const endpointBucket = bucketFor(endpoint);
    if (endpointBucket) {
      refill(endpointBucket, now);
      wait = Math.max(wait, waitMs(endpointBucket));
    }
    return wait;
  }

  /** Spend a token from every bucket that applies. Only call when waitForBoth() is 0. */
  function spend(endpoint: string): void {
    if (globalBucket) globalBucket.tokens -= 1;
    const endpointBucket = bucketFor(endpoint);
    if (endpointBucket) endpointBucket.tokens -= 1;
  }

  function recordWait(waiter: Waiter, now: number): void {
    const waited = now - waiter.enqueuedAtMs;
    if (waited <= 0) return;
    stats.throttledCount += 1;
    stats.totalWaitedMs += waited;
    if (waited > stats.maxWaitMs) stats.maxWaitMs = waited;
    if (logThresholdMs > 0 && waited >= logThresholdMs && now - lastLogAtMs >= LOG_INTERVAL_MS) {
      lastLogAtMs = now;
      // console.error, not console.log: production builds strip log/info/debug/warn.
      console.error(
        "[stripe-rate-limiter] throttling - " +
          waiter.endpoint +
          " waited " +
          waited +
          "ms, " +
          queue.length +
          " still queued (global " +
          globalRate +
          "/s, endpoint " +
          endpointRate +
          "/s, per instance)"
      );
    }
  }

  function schedule(ms: number): void {
    if (timer !== null) return;
    stats.timerPending = true;
    // Deliberately NOT unref()'d: an awaited acquire is not itself enough to keep the
    // event loop alive, so an unref'd timer would let a CLI script exit mid-flight with
    // Stripe calls still queued. The timer only exists while the queue is non-empty and
    // is always cleared by pump(), so it cannot leak.
    timer = setTimeout(pump, ms);
  }

  function pump(): void {
    timer = null;
    stats.timerPending = false;
    while (queue.length > 0) {
      const head = queue[0];
      const now = Date.now();
      const wait = waitForBoth(head.endpoint, now);
      if (wait > 0) {
        schedule(wait);
        return;
      }
      spend(head.endpoint);
      queue.shift();
      stats.queued = queue.length;
      recordWait(head, now);
      head.resolve();
    }
  }

  return {
    acquire(endpoint: string): Promise<void> {
      // Fast path: nothing queued, no timer pending, tokens available. No timer is
      // created and there is nothing to reorder against when the queue is empty.
      if (queue.length === 0 && timer === null) {
        const now = Date.now();
        if (waitForBoth(endpoint, now) === 0) {
          spend(endpoint);
          return Promise.resolve();
        }
      }
      const promise = new Promise<void>((resolve) => {
        // The executor runs synchronously, so the waiter is queued before pump() below.
        queue.push({ endpoint, enqueuedAtMs: Date.now(), resolve });
        stats.queued = queue.length;
      });
      if (timer === null) pump();
      return promise;
    },
    stats: () => ({ ...stats }),
  };
}

/** Non-finite / negative / NaN all mean "off" rather than "deadlock". */
function normaliseRate(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

// --- Configuration -------------------------------------------------------------

/** Stripe's published caps. Defaults are 80% of these. */
const LIVE_GLOBAL_CAP_PER_SECOND = 100;
const SANDBOX_GLOBAL_CAP_PER_SECOND = 25;
const PER_ENDPOINT_CAP_PER_SECOND = 25;
const SAFETY_FACTOR = 0.8;

export interface ResolvedLimiterConfig {
  globalPerSecond: number;
  perEndpointPerSecond: number;
  sandbox: boolean;
}

/** Just the vars this module reads. `process.env` is assignable to it. */
export interface LimiterEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_RATE_LIMIT_GLOBAL_PER_SECOND?: string;
  STRIPE_RATE_LIMIT_ENDPOINT_PER_SECOND?: string;
  // Keeps `process.env` (an index-signature type) assignable to this.
  [key: string]: string | undefined;
}

/**
 * Resolve the limiter's rates from env. Exported so the test can exercise the parsing
 * without booting the Stripe singleton.
 */
export function resolveLimiterConfig(env: LimiterEnv = process.env): ResolvedLimiterConfig {
  // Sandbox keys are `sk_test_...` / `rk_test_...`; sandbox's global cap is 25/sec, not 100.
  const sandbox = (env.STRIPE_SECRET_KEY ?? "").includes("_test_");
  const globalCap = sandbox ? SANDBOX_GLOBAL_CAP_PER_SECOND : LIVE_GLOBAL_CAP_PER_SECOND;
  return {
    sandbox,
    globalPerSecond: readRate(env.STRIPE_RATE_LIMIT_GLOBAL_PER_SECOND, globalCap * SAFETY_FACTOR),
    perEndpointPerSecond: readRate(
      env.STRIPE_RATE_LIMIT_ENDPOINT_PER_SECOND,
      PER_ENDPOINT_CAP_PER_SECOND * SAFETY_FACTOR
    ),
  };
}

/** Blank/absent/garbage falls back to the default; an explicit 0 disables the bucket. */
function readRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error(
      '[stripe-rate-limiter] ignoring non-numeric rate "' + raw + '", using ' + fallback + "/sec"
    );
    return fallback;
  }
  return parsed;
}

let sharedLimiter: RateLimiter | null = null;

/** Process-wide limiter shared by every call through the Stripe singleton. */
export function getStripeRateLimiter(): RateLimiter {
  if (!sharedLimiter) {
    sharedLimiter = createRateLimiter(resolveLimiterConfig());
  }
  return sharedLimiter;
}

export function getStripeRateLimiterStats(): RateLimiterStats {
  return getStripeRateLimiter().stats();
}

// --- HTTP client shim ----------------------------------------------------------

/** Exactly the shape `new Stripe(key, { httpClient })` accepts. */
type StripeHttpClient = NonNullable<Stripe.StripeConfig["httpClient"]>;

/**
 * The default client the SDK would have picked for us. `createNodeHttpClient()` with no
 * agent is identical to the platform's `createDefaultHttpClient()`
 * (NodePlatformFunctions.js:110-116); the fetch client is the fallback for a
 * worker/edge build, where the node factory is absent.
 */
export function createDefaultStripeHttpClient(): StripeHttpClient {
  return typeof Stripe.createNodeHttpClient === "function"
    ? Stripe.createNodeHttpClient()
    : Stripe.createFetchHttpClient();
}

/**
 * Wrap a Stripe HTTP client so every request spends a token first.
 *
 * Transparency contract -- this shim must add latency and nothing else:
 *   - it forwards all eight arguments positionally and returns the inner promise as-is,
 *     so the response object (and its stream / raw handles) is the inner client's own;
 *   - it never catches, so a connection error still surfaces as the SDK's own
 *     StripeConnectionError, and an HTTP error is still built by `_jsonResponseHandler`
 *     from the untouched response -- error classes, decline codes and status codes are
 *     exactly what they were;
 *   - `getClientName()` stays delegated so the user-agent string is unchanged.
 */
export function createRateLimitedHttpClient(
  inner: StripeHttpClient,
  limiter: RateLimiter = getStripeRateLimiter()
): StripeHttpClient {
  return {
    getClientName: () => inner.getClientName(),
    makeRequest: async (host, port, path, method, headers, requestData, protocol, timeout) => {
      await limiter.acquire(endpointKeyFromPath(path));
      return inner.makeRequest(host, port, path, method, headers, requestData, protocol, timeout);
    },
  };
}
