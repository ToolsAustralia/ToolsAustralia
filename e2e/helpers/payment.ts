import type { Page, TestInfo } from "@playwright/test";
import mongoose from "mongoose";
import Stripe from "stripe";
import { connectE2eDb, entriesForUser, findUserByEmail } from "./db";
import { resolveE2eEnv } from "../lib/env";

export const CARDS = {
  ok: { number: "4242424242424242", expiry: "12 / 30", cvc: "123" },
  declined: { number: "4000000000000002", expiry: "12 / 30", cvc: "123" },
};

/**
 * Deterministic-but-unique Australian mobile number for registration
 * (`/^(\+61|61|0)?[4-5]\d{8}$/` — src/app/api/auth/register/route.ts:68). The
 * User model unique-indexes `mobile`, and all 5 purchase specs register a new
 * guest user — a single hardcoded "0412345678" (the brief's literal example)
 * collides the instant two of these specs run against the same database
 * (verified live: the second spec's registration 400s with "Mobile number
 * taken"). Seed with the same per-test `email` string each spec already
 * builds, so the phone stays unique across spec × project × run exactly like
 * the email does.
 */
export function uniqueMobile(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const eightDigits = 10_000_000 + (h % 90_000_000); // always 8 digits, no leading zero
  return `04${eightDigits}`;
}

/**
 * Retry-safe unique identity: same run + project + tag gets a fresh email/mobile per retry attempt.
 * The retry index is folded into the email seed so Playwright retries on the same worker
 * reuse a different (yet deterministic) email/mobile pair, avoiding "Email already taken" /
 * "Mobile number taken" collisions that break the `guestUserData` bridge.
 *
 * Email format: must match `src/models/User.ts:346` regex (hyphen separators + 2-char TLD only;
 * "+" and ".local" fail validation).
 */
export function purchaseIdentity(tag: string, testInfo: TestInfo): { email: string; mobile: string } {
  const runId = process.env.E2E_RUN_ID || "dev";
  const email = `e2e-${tag}-${runId}-${testInfo.project.name}-r${testInfo.retry}@e2e.io`.toLowerCase();
  return { email, mobile: uniqueMobile(email) };
}

/**
 * Stripe `<PaymentElement layout="tabs">` renders into its own iframe(s) — one
 * per tab group. Verified live (chromium-desktop, e2e:env): a single
 * `iframe[title="Secure payment input frame"]` (name starts with
 * `__privateStripeFrame`) hosts the "Card" tab's number/expiry/cvc fields as
 * plain-labelled textboxes once the "Card" tab is the active one (it is, by
 * default — `paymentMethodOrder` puts `card` first). Wallet tabs (Apple/Google
 * Pay), when enabled, render as separate buttons OUTSIDE this iframe and are
 * never interacted with here.
 */
export async function fillPaymentElement(
  page: Page,
  card: { number: string; expiry: string; cvc: string },
  // Proof-mode option: per-keystroke delay so card entry is WATCHABLE in demo videos
  // (video-review Judge R: typed, not pasted). Default stays the instant .fill() —
  // functional purchase specs shouldn't pay the extra ~1.5s.
  opts?: { delay?: number }
): Promise<void> {
  const frame = page
    .frameLocator('iframe[name^="__privateStripeFrame"], iframe[title*="payment" i]')
    .first();
  const cardNumber = frame.getByRole("textbox", { name: /card number/i });
  const expiry = frame.getByRole("textbox", { name: /expir/i });
  const cvc = frame.getByRole("textbox", { name: /cvc|security code/i });
  if (opts?.delay) {
    await cardNumber.pressSequentially(card.number, { delay: opts.delay });
    await expiry.pressSequentially(card.expiry.replace(/\s/g, ""), { delay: opts.delay });
    await cvc.pressSequentially(card.cvc, { delay: opts.delay });
  } else {
    await cardNumber.fill(card.number);
    await expiry.fill(card.expiry);
    await cvc.fill(card.cvc);
  }
}

/** DB-level outcome poll: subscription active + entries present. */
export async function waitForActiveMembership(
  email: string,
  timeoutMs = 120_000
): Promise<{ userId: string; entries: number }> {
  await connectE2eDb();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const user = await findUserByEmail(email);
    if (user?.subscription?.status === "active" && user?.subscription?.isActive) {
      const entries = await entriesForUser(String(user._id));
      if (entries > 0) return { userId: String(user._id), entries };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`No active membership + entries for ${email} within ${timeoutMs / 1000}s (webhook not processed?)`);
}

/** DB-level outcome poll for a one-time pack purchase: user exists + entries present. */
export async function waitForOneTimeEntries(
  email: string,
  timeoutMs = 120_000
): Promise<{ userId: string; entries: number }> {
  await connectE2eDb();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const user = await findUserByEmail(email);
    if (user) {
      const entries = await entriesForUser(String(user._id));
      if (entries > 0) return { userId: String(user._id), entries };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`No entries for ${email} within ${timeoutMs / 1000}s (webhook not processed?)`);
}

/**
 * Locates this purchase's `BenefitsGranted` event and returns the id/kind pair
 * ready for `benefitsGrantedCount` (../../helpers/db). Verified live doc shape:
 * `paymentevents` docs have a STRING `_id` in one of two forms depending on
 * `packageType`:
 *   - "membership" (subscription, granted on `invoice.payment_succeeded"`):
 *     `_id: "BenefitsGranted-invoice_<stripe invoice id>"` — e.g.
 *     `BenefitsGranted-invoice_in_1AbCdE...` (src/services/stripe-webhook-handlers/index.ts:3358-3359).
 *   - "one-time" (granted on `payment_intent.succeeded`):
 *     `_id: "BenefitsGranted-<stripe payment intent id>"` — e.g.
 *     `BenefitsGranted-pi_1AbCdE...` (handleOneTimeWebhook → processPaymentBenefits(paymentIntent.id, ...)).
 *   - "upsell" (post-purchase one-click offer, granted on `payment_intent.succeeded`
 *     with metadata.type "upsell"): same pi-shaped id as "one-time"
 *     (handleUpsellWebhook → processPaymentBenefits(packageType: "upsell", ...)).
 * `userId` on the doc is a Mongo ObjectId; matched here via string comparison
 * (mirrors the `entriesForUser` pattern in ../../helpers/db) rather than an
 * ObjectId-typed query filter, so this never depends on driver cast behavior.
 *
 * Callers pair this with `benefitsGrantedCount(kind, id) === 1` (../../helpers/db) as a
 * two-part exactly-once proof: `entries === N` (the caller's own DB poll) is the
 * DOUBLE-grant detector (a broken idempotency guard shows up as entries climbing, e.g.
 * 15 -> 30); `benefitsGrantedCount === 1` is the complementary ZERO/WRONG-USER detector —
 * it proves the specific `BenefitsGranted` guard doc still exists for exactly THIS id
 * (this function already resolved `ref` from the caller's own userId, so a doc missing,
 * deleted, or written under a different id/user fails here even when the entries count
 * happens to look right).
 */
export async function findBenefitsGrantedRef(
  userId: string,
  packageType: "membership" | "one-time" | "upsell"
): Promise<{ kind: "invoice" | "pi"; id: string }> {
  const db = await connectE2eDb();
  const docs = await db.connection
    .collection<{ _id: string; userId: mongoose.Types.ObjectId; packageType: string }>("paymentevents")
    .find({ eventType: "BenefitsGranted", packageType })
    .toArray();
  const doc = docs.find((d) => String(d.userId) === String(userId));
  if (!doc) {
    throw new Error(`No BenefitsGranted "${packageType}" paymentevents doc found for user ${userId}`);
  }
  const invoiceMatch = /^BenefitsGranted-invoice_(.+)$/.exec(doc._id);
  if (invoiceMatch) return { kind: "invoice", id: invoiceMatch[1] };
  const piMatch = /^BenefitsGranted-(.+)$/.exec(doc._id);
  if (piMatch) return { kind: "pi", id: piMatch[1] };
  throw new Error(`Unrecognized paymentevents _id shape: ${doc._id}`);
}

/** The ONE route the browser mints a one-time PaymentIntent through (usePaymentIntent.ts). */
const CREATE_PAYMENT_INTENT_PATH = "/api/stripe/create-payment-intent";

/** One observed call to that route: what identity went up, what object came back. */
export interface PaymentIntentCreation {
  /** `userEmail` exactly as the browser sent it. `null` = the field was absent, which is
   *  the route's "true guest" branch and stamps the literal placeholders. */
  userEmail: string | null;
  /** The id the route answered with; `null` when the call errored. */
  paymentIntentId: string | null;
}

export interface PaymentIntentCreationLog {
  /** Await AFTER the purchase has settled: resolves every in-flight body read, in call order. */
  settle(): Promise<PaymentIntentCreation[]>;
}

/**
 * Records every browser-side PaymentIntent creation for the rest of this page's life.
 *
 * WHY THIS EXISTS. The pack leg used to infer duplicate-PaymentIntent health from the
 * entries count alone, and a duplicate only loses the campaign code when the SECOND
 * object happens to resolve last — so reverting the fix left the leg green about two runs
 * in three. Counting the creations is not a proxy for the defect, it IS the defect: the
 * modal must mint exactly ONE object per pack checkout, and that object must carry a real
 * account rather than the `"guest"` placeholder.
 *
 * Install BEFORE the first navigation — a listener attached later misses the pre-warm,
 * which is the call that used to be duplicated. Body reads are pushed as promises and
 * awaited in `settle()` so a still-streaming response can never be silently dropped.
 */
export function trackPaymentIntentCreations(page: Page): PaymentIntentCreationLog {
  const pending: Array<Promise<PaymentIntentCreation>> = [];
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() !== "POST") return;
    let pathname: string;
    try {
      pathname = new URL(response.url()).pathname;
    } catch {
      return;
    }
    if (pathname !== CREATE_PAYMENT_INTENT_PATH) return;
    pending.push(
      (async (): Promise<PaymentIntentCreation> => {
        let userEmail: string | null = null;
        try {
          const raw = request.postData();
          if (raw) {
            const parsed = JSON.parse(raw) as { userEmail?: unknown };
            if (typeof parsed.userEmail === "string" && parsed.userEmail.length > 0) {
              userEmail = parsed.userEmail;
            }
          }
        } catch {
          // Unparseable body — reported as null, which fails the identity assertion loudly.
        }
        let paymentIntentId: string | null = null;
        try {
          const body = (await response.json()) as { payment_intent_id?: unknown };
          if (typeof body.payment_intent_id === "string") paymentIntentId = body.payment_intent_id;
        } catch {
          // Errored/aborted call — counts as an observed attempt with no object.
        }
        return { userEmail, paymentIntentId };
      })()
    );
  });
  return { settle: () => Promise.all(pending) };
}

/**
 * The PaymentIntent's own metadata, read back from Stripe.
 *
 * The DB cannot answer this: the webhook resolves the customer from the Stripe customer
 * and the email, so a PaymentIntent stamped `userId: "guest"` still produces a correct
 * grant row. `metadata.userId` / `metadata.userEmail` are the only place the identity
 * the object was CREATED with survives — and `metadata.campaignCode` is the only place
 * the attach's answer survives. Test-mode key only; `resolveE2eEnv` re-asserts that.
 */
export async function paymentIntentMetadata(paymentIntentId: string): Promise<Record<string, string>> {
  resolveE2eEnv();
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY unset after resolveE2eEnv()");
  const stripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil", typescript: true });
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent.metadata ?? {};
}
