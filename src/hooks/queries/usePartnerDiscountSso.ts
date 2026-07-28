import { useMutation } from "@tanstack/react-query";

/**
 * usePartnerDiscountSso — open the MyRewards portal via the gated SSO hand-off.
 *
 * Calls `POST /api/partner-discount/sso`; on success, navigates the browser to the
 * returned MyRewards `/verifytoken` URL (the hand-off leaves our app for the portal).
 * A button calls `mutate()` and reads `isPending` / `error` from the returned mutation.
 *
 * WHY A RAW fetch (not `apiPost` from `@/lib/queries`): `apiPost` force-signs-the-user-out
 * on ANY 401/403. But THIS route's 403 means "no active partner-discount access" — a
 * feature gate, NOT an invalid session. A logged-in member who lacks access must see a
 * "no access" error, never be logged out of the whole site. So we read the response here.
 */
interface SsoSuccessResponse {
  success: true;
  data: { redirectUrl: string };
}
interface SsoFailureResponse {
  success: false;
  error: string;
}

async function requestPortalSso(): Promise<{ redirectUrl: string }> {
  const res = await fetch("/api/partner-discount/sso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const body = (await res.json().catch(() => null)) as SsoSuccessResponse | SsoFailureResponse | null;
  if (!res.ok || !body?.success) {
    throw new Error(
      body && body.success === false ? body.error : "Could not open the partner portal. Please try again."
    );
  }
  return body.data;
}

export function usePartnerDiscountSso() {
  return useMutation({
    mutationFn: requestPortalSso,
    onSuccess: ({ redirectUrl }) => {
      // Top-level navigation into the MyRewards portal (intentionally leaves our app).
      window.location.assign(redirectUrl);
    },
  });
}
