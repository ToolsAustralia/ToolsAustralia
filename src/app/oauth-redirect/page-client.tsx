"use client";

import { Suspense } from "react";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * OAuth Redirect Helper Page
 * This page auto-submits a form to trigger NextAuth OAuth redirect
 * Used for popup-based OAuth flows
 */
function OAuthRedirectContent() {
  const searchParams = useSearchParams();
  const provider = searchParams.get("provider");
  const callbackUrl = searchParams.get("callbackUrl");
  const csrfToken = searchParams.get("csrfToken");

  useEffect(() => {
    if (provider && csrfToken) {
      // Create and submit form to trigger OAuth redirect
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `/api/auth/signin/${provider}`;

      const csrfInput = document.createElement("input");
      csrfInput.type = "hidden";
      csrfInput.name = "csrfToken";
      csrfInput.value = csrfToken;
      form.appendChild(csrfInput);

      if (callbackUrl) {
        const callbackInput = document.createElement("input");
        callbackInput.type = "hidden";
        callbackInput.name = "callbackUrl";
        callbackInput.value = callbackUrl;
        form.appendChild(callbackInput);
      }

      document.body.appendChild(form);
      form.submit();
    }
  }, [provider, csrfToken, callbackUrl]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-neutral-400">Redirecting to Google...</p>
      </div>
    </div>
  );
}

export default function OAuthRedirectPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-neutral-400">Loading...</p>
        </div>
      </div>
    }>
      <OAuthRedirectContent />
    </Suspense>
  );
}
