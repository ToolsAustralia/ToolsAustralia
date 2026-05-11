/**
 * Marks an Error object as "already handled by an inner error handler"
 * so the outer catch block in `MembershipModal.handleSubmit` (and similar)
 * can skip its own `handlePaymentError` call.
 *
 * Why this exists:
 * `MembershipModal.handleSubmit` is a long async function. Several inner
 * branches do:
 *
 *     await handlePaymentError(result.error, ...);
 *     throw new Error(result.error);
 *
 * They `throw` so the rest of `handleSubmit` doesn't run. But the outer
 * `try { ... } catch (error) { await handlePaymentError(error, ...); }`
 * then runs `handlePaymentError` a SECOND time on the same error —
 * producing duplicate toasts and (for real errors) duplicate auto-log
 * attempts that collide on the dedup hash.
 *
 * Usage:
 *   await handlePaymentError(result.error, { ... });
 *   throw markErrorHandled(new Error(result.error));
 *
 *   // in the outer catch:
 *   if (isErrorHandled(error)) return;
 */

type HandledFlag = { __alreadyHandled?: true };

export function markErrorHandled<T extends Error>(error: T): T {
  (error as T & HandledFlag).__alreadyHandled = true;
  return error;
}

export function isErrorHandled(error: unknown): boolean {
  return !!(
    error &&
    typeof error === "object" &&
    (error as HandledFlag).__alreadyHandled === true
  );
}
