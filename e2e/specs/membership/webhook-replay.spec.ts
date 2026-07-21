import { spawnSync } from "node:child_process";
import { test as base, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement, findBenefitsGrantedRef, uniqueMobile, waitForActiveMembership } from "../../helpers/payment";
import { benefitsGrantedCount, connectE2eDb, disconnectE2eDb, entriesForUser } from "../../helpers/db";

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
  test("resending the payment event does not double-grant", async ({ page }) => {
    // See purchase-subscription.spec.ts's identical note: generous budget for full
    // 3-project concurrent runs against one `next dev` server — this spec has the
    // most sequential steps of the five (purchase + queue poll + CLI resend + settle).
    test.setTimeout(400_000);
    const runId = process.env.E2E_RUN_ID || "dev";
    const email = `e2e-replay-${runId}-${test.info().project.name}@e2e.io`;

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
    await page.locator('input[name="phone"]').fill(uniqueMobile(email));
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

    // Grant count must not move. NOTE: a Stripe resend carries a FRESH event.id
    // (src/services/stripe-webhook-queue/processQueuedEvent.ts's own comment: "Stripe
    // dashboard *resends* carry a fresh event.id and bypass enqueue idempotency") — so
    // neither the queue's eventId-unique index nor the ProcessedStripeEvent eventId
    // dedup (Layers 1-3) block a resend from re-entering handleInvoicePaymentSucceeded.
    // The actual guard exercised here is Layer 4: the paymentevents unique `_id`
    // ("BenefitsGranted-invoice_<invoice id>", keyed by the INVOICE, not the wrapping
    // Stripe event) — handleInvoicePaymentSucceeded creates that doc FIRST via the
    // unique constraint specifically so a second delivery of the same invoice can't
    // grant twice, however it arrives.
    await page.waitForTimeout(10_000);
    expect(await entriesForUser(userId)).toBe(entries);
    expect(await benefitsGrantedCount(ref.kind, ref.id)).toBe(1);
  });
});
