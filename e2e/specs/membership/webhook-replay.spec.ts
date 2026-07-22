import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { test as base, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement, findBenefitsGrantedRef, purchaseIdentity, waitForActiveMembership } from "../../helpers/payment";
import { benefitsGrantedCount, connectE2eDb, disconnectE2eDb, entriesForUser } from "../../helpers/db";
import { LOG_DIR } from "../../lib/paths";

/**
 * This spec is the only purchase spec that keeps the page open well past the
 * grant (DB polling + `stripe events resend` + a 10s settle wait — ~30-40s extra
 * vs. the other specs, which close the page moments after the grant lands). That
 * extra window is long enough for the post-purchase upsell modal's fallback image
 * request to actually resolve and fail — verified via `--trace on` network capture
 * (not guessed): `GET /_next/image?url=%2Fimages%2Fupsells%2F_fallback.webp&w=640&q=75`
 * returns 400. This is a pre-existing, unrelated product issue (Next's image
 * optimizer choking on the upsell fallback asset), out of this task's scope
 * (src/**) and orthogonal to what this spec asserts (webhook replay idempotency).
 * The base watchdog has no URL context for a bare "Failed to load resource" — it's
 * Chrome's own auto-logged message for ANY failed resource, not something our code
 * emits — so it can't be filtered by path; shadow it here (same override pattern as
 * purchase-decline.spec.ts) rather than let unrelated asset noise fail this spec.
 * The response-status (>=500) check is preserved unchanged, so a real backend
 * regression during this test still fails it.
 */
/* eslint-disable react-hooks/rules-of-hooks -- see purchase-decline.spec.ts's identical
   note: Playwright's fixture continuation param is named `use`, colliding with React
   19's `use` hook for this lint rule (pre-existing false positive, already present
   unfixed in ../../fixtures/test.ts's own fixtures). Scoped to this override only. */
const test = base.extend({
  watchdog: async ({ page, context, baseURL }, use) => {
    await context.route(/klaviyo\.com|contentsquare\.net|hotjar\.(com|io)/, (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
    );
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      const text = m.text();
      if (m.type() !== "error") return;
      if (/Download the React DevTools/i.test(text)) return;
      if (/\[Fast Refresh\]/i.test(text)) return;
      if (/third-party cookie/i.test(text)) return;
      // See file-level comment: verified upsell fallback image 400, not app noise.
      if (/Failed to load resource.*400/i.test(text)) return;
      problems.push(`console.error: ${text.slice(0, 300)}`);
    });
    page.on("response", (r) => {
      if (baseURL && r.url().startsWith(baseURL) && r.status() >= 500) {
        problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
      }
    });
    await use();
    if (problems.length) {
      throw new Error(`QA watchdog caught ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    }
  },
});
/* eslint-enable react-hooks/rules-of-hooks */

test.afterAll(async () => {
  await disconnectE2eDb();
});

test.describe("webhook replay safety @purchase", () => {
  // EXTERNAL mode: belt-and-suspenders — run.ts's --grep-invert "@purchase|@admin" already excludes this tag; this guards a direct `playwright test` invocation that bypasses run.ts.
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");

  test("resending the payment event does not double-grant", async ({ page }) => {
    // See purchase-subscription.spec.ts's identical note: generous budget for full
    // 3-project concurrent runs against one `next dev` server — this spec has the
    // most sequential steps of the five (purchase + queue poll + CLI resend + settle).
    test.setTimeout(400_000);
    const { email, mobile } = purchaseIdentity("replay", test.info());

    // Complete a normal purchase first (same steps as purchase-subscription):
    await page.goto("/membership");
    await page
      .getByRole("button", { name: /choose tradie/i })
      .or(page.getByRole("link", { name: /choose tradie/i }))
      .first()
      .click();
    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("Replay");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill(mobile);
    await page.getByRole("button", { name: /register/i }).click();

    const purchaseButton = page.getByRole("button", { name: /^purchase$/i });
    await expect(purchaseButton).toBeVisible({ timeout: 45_000 });
    await fillPaymentElement(page, CARDS.ok);
    await expect(purchaseButton).toBeEnabled({ timeout: 30_000 });
    await purchaseButton.click();

    const { userId, entries } = await waitForActiveMembership(email, 180_000);

    // Identify THIS purchase's invoice id (not just "the latest queue row" — a full
    // 3-project run has other workers completing purchases concurrently, and a
    // most-recent heuristic could replay a DIFFERENT user's event and still pass
    // trivially). Doc shape verified live: paymentevents `_id` is
    // "BenefitsGranted-invoice_<stripe invoice id>" for membership grants.
    const ref = await findBenefitsGrantedRef(userId, "membership");
    expect(ref.kind).toBe("invoice");

    // Find the queue row for exactly that invoice's invoice.payment_succeeded event, to
    // recover the ORIGINAL Stripe event id (evt_...) for `stripe events resend`.
    // Verified live doc shape: src/models/StripeWebhookQueue.ts — collection name is
    // "stripewebhookqueue" (singular), fields are `eventId` (Stripe evt_... id) and
    // `type` (Stripe event type) — NOT "stripewebhookqueues" / `eventType` as an
    // earlier draft of this spec assumed. `payload` is the full Stripe event, so
    // `payload.data.object.id` is the invoice id.
    // No `status` filter: verified live that the row can still read "processing" for a
    // moment after `waitForActiveMembership` already sees the grant — `markSucceeded`
    // (processQueuedEvent.ts) writes AFTER the benefit-granting dispatch returns, so
    // filtering on status:"succeeded" here raced and intermittently found nothing. The
    // row exists (any status) the instant the webhook POST is received — enqueueStripeEvent
    // runs synchronously before `after()` is even scheduled — so a short poll is enough.
    const db = await connectE2eDb();
    let eventId: string | undefined;
    const queueDeadline = Date.now() + 30_000;
    while (Date.now() < queueDeadline && !eventId) {
      const row = await db.connection
        .collection<{ eventId: string; type: string; payload: { data: { object: { id: string } } } }>(
          "stripewebhookqueue"
        )
        .findOne({ type: "invoice.payment_succeeded", "payload.data.object.id": ref.id });
      if (row?.eventId) eventId = String(row.eventId);
      else await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(eventId, `no invoice.payment_succeeded queue row for invoice ${ref.id}`).toBeTruthy();

    // Replay it through the real webhook path (orchestrator's stripe-listen forwarder):
    const r = spawnSync("stripe", ["events", "resend", eventId!, "--confirm"], {
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 30_000,
    });
    expect(r.status, `stripe events resend failed: ${r.stderr}`).toBe(0);

    // Positive-delivery proof: verify the resend actually round-tripped through the
    // orchestrator's `stripe listen` forwarder to our server, BEFORE trusting the
    // no-double-grant assertions below — otherwise an unchanged entries count is
    // ambiguous: consistent with BOTH "the idempotency guard worked" and "the replay
    // never arrived at all" (a routing failure would pass vacuously).
    //
    // CORRECTION (found live during this fix round, contradicts the original assumption):
    // this test used to assume a resend mints a FRESH event.id and looked for a second,
    // differently-`eventId`'d `stripewebhookqueue` row. That's true for a genuine Stripe
    // DASHBOARD resend (per processQueuedEvent.ts's own comment), but NOT for the CLI's
    // `stripe events resend` — verified with a live diagnostic session (`stripe-listen.log`
    // showed the SAME `evt_...` id POSTed to /api/stripe/webhook TWICE, 5s apart, both 200).
    // Because `enqueueStripeEvent`'s upsert is keyed on `eventId`, a same-id redelivery is a
    // Layer-1 (queue-level) no-op — `created: false`, "already queued; skipping fan-out" — it
    // never reaches `processQueuedEvent`/`handleInvoicePaymentSucceeded` again, so there is NO
    // Mongo-observable side effect from the redelivery itself (no new queue row; no field on
    // the existing row changes; Layer 4's `paymentevents` unique `_id` is never even
    // re-exercised because the request is dropped before that point). The only direct evidence
    // available that the resend reached our local pipeline is the forwarder's own relay log
    // recording a SECOND delivery of the same event id — so this polls that log file instead.
    const stripeListenLogPath = path.join(LOG_DIR, "stripe-listen.log");
    const deliveryPattern = new RegExp(`POST .*/api/stripe/webhook \\[${eventId}\\]`, "g");
    let deliveryCount = 0;
    const logPollDeadline = Date.now() + 30_000;
    while (Date.now() < logPollDeadline && deliveryCount < 2) {
      const logText = await fs.readFile(stripeListenLogPath, "utf8").catch(() => "");
      deliveryCount = (logText.match(deliveryPattern) ?? []).length;
      if (deliveryCount < 2) await new Promise((res) => setTimeout(res, 1_000));
    }
    expect(
      deliveryCount >= 2,
      `resend did not reach the local forwarder: ${stripeListenLogPath} shows only ` +
        `${deliveryCount} POST(s) for event ${eventId} after 30s (expected >=2 — the ` +
        `original delivery plus the resend) — check that \`stripe listen\` is still ` +
        `forwarding to /api/stripe/webhook.`
    ).toBe(true);

    // Grant count must not move. The guard actually exercised here is Layer 1 (queue-level
    // eventId-unique dedup, proven above by the redelivery being a same-id no-op) — Layer 4,
    // the paymentevents unique `_id` keyed by the invoice, is this suite's OTHER line of
    // defense (see purchase-subscription.spec.ts) for deliveries that DO carry a fresh event
    // id (a genuine Stripe retry after a timeout, or a dashboard resend).
    await page.waitForTimeout(10_000);
    // entries === (pre-replay count): the double-grant detector — a broken guard shows up
    // as entries climbing (e.g. 15 -> 30) on the SAME user.
    expect(await entriesForUser(userId)).toBe(entries);
    // benefitsGrantedCount === 1: proves the guard doc still exists for THIS exact invoice id
    // (catches a zero-count regression — the doc silently missing/deleted/mis-keyed — and a
    // wrong-user regression, since findBenefitsGrantedRef resolved `ref` from THIS userId
    // above) — a complementary check to the entries assertion, not a restatement of it.
    expect(await benefitsGrantedCount(ref.kind, ref.id)).toBe(1);
  });
});
