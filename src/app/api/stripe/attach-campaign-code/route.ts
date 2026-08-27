/**
 * DEPRECATED WIRE ALIAS — remove one release after `attach-typed-code` ships.
 *
 * This seam used to be called the campaign attach. It now carries all three code
 * types, so it was renamed to `/api/stripe/attach-typed-code` (one concept, one
 * name). The PATH, unlike every other name in the rename, is a contract between
 * two independently-cached deployables: a browser tab that loaded the OLD bundle
 * before the deploy still POSTs here. Deleting this file outright would answer
 * that tab with a 404, which `useStripeSubscription.attachTypedCode` reads as a
 * definite `"refused"` — the sale still completes (the never-block contract holds
 * either way), but the customer's one-per-lifetime bonus code is silently
 * dropped. That is the exact failure this whole change exists to close, so it is
 * not an acceptable price for a rename.
 *
 * It is an alias, not a fork: zero logic, one implementation, and it re-exports
 * the real handler rather than duplicating it. Delete it once no live bundle can
 * still be pointing here.
 */
export { POST } from "../attach-typed-code/route";
