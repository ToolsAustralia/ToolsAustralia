import type { Page } from "@playwright/test";
import mongoose from "mongoose";
import { connectE2eDb, entriesForUser, findUserByEmail } from "./db";

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
  card: { number: string; expiry: string; cvc: string }
): Promise<void> {
  const frame = page
    .frameLocator('iframe[name^="__privateStripeFrame"], iframe[title*="payment" i]')
    .first();
  await frame.getByRole("textbox", { name: /card number/i }).fill(card.number);
  await frame.getByRole("textbox", { name: /expir/i }).fill(card.expiry);
  await frame.getByRole("textbox", { name: /cvc|security code/i }).fill(card.cvc);
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
  packageType: "membership" | "one-time"
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
