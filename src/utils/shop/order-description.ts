/**
 * The one-line description Stripe shows against a shop payment.
 *
 * Stripe's payments list renders `description` as its widest column, so it is the
 * only place an operator can tell two $90.95 charges apart without opening both.
 * It used to read "Tools Australia shop order SHOP-20260820-XE442E" — the order
 * number is already carried in PaymentIntent metadata and stored on the order as
 * `paymentIntentId`, so spending that column on it said nothing the record did not
 * already hold, while the thing an operator actually needs to match against a
 * printer job — WHICH GARMENT, IN WHICH VARIANT — was absent.
 *
 * Pure and separately testable: it runs inside the checkout route's hot path and a
 * throw here would fail a payment for a formatting concern.
 */

/** Only the fields this needs — an Order document satisfies it structurally. */
export interface OrderDescriptionLine {
  name?: string;
  sku?: string;
  quantity?: number;
}

/**
 * Stripe truncates the column long before its own 1000-character limit, so the
 * string is kept short enough to read in the list rather than merely to store.
 */
const MAX_LENGTH = 120;

const clip = (s: string) => (s.length <= MAX_LENGTH ? s : `${s.slice(0, MAX_LENGTH - 1)}…`);

/**
 * `"Torquay Hoodie ×2 · ajrAx-2XL-Bot8043"`, and `"… + 2 more"` for a mixed basket.
 *
 * `fallback` (the order number) is used only when the lines carry no name at all,
 * which would otherwise leave the charge labelled with an empty string.
 */
export function buildShopOrderDescription(
  lines: readonly OrderDescriptionLine[],
  fallback: string
): string {
  const named = lines.filter((l) => (l.name ?? "").trim().length > 0);
  if (named.length === 0) return clip(fallback);

  const [first, ...rest] = named;
  const parts = [first.name!.trim()];

  // Quantity only when it is not 1 — "×1" on every single-item order is noise in a
  // column this narrow.
  if (typeof first.quantity === "number" && first.quantity > 1) {
    parts.push(`×${first.quantity}`);
  }

  const sku = (first.sku ?? "").trim();
  const head = sku ? `${parts.join(" ")} · ${sku}` : parts.join(" ");

  // A basket is summarised rather than listed: five SKUs would overflow the column
  // and hide the one detail the head line exists to show.
  return clip(rest.length > 0 ? `${head} + ${rest.length} more` : head);
}
