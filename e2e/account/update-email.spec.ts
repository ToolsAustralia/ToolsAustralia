// e2e/account/update-email.spec.ts
//
// BLOCKED: there is no UI surface to change the user's email address on
// /my-account/settings. The Profile tab renders the email as a locked,
// read-only display (ProfileTab.tsx:140-148) and the only adjacent control
// is "Verify Email" — which opens the UserSetupModal at step 3 to verify
// the EXISTING email, not to change it.
//
// The API endpoint /api/user/update-email exists and accepts { newEmail }
// (src/app/api/user/update-email/route.ts) and the route is wired through
// the email verification rate limiter, but no component in the codebase
// posts to it. Until the Profile tab gains an "Update email" form, this
// spec is BLOCKED.
//
// To unblock: add an editable email control inside ProfileTab that POSTs
// { newEmail } to /api/user/update-email, then re-author this spec to:
//   1. fill the new-email input
//   2. click submit
//   3. assert the response is { success: true } and the user's
//      pendingKlaviyoMergeFromEmail is set in DB.

import { test } from "../fixtures/test";

test.skip(
  "BLOCKED: no UI surface to change email on /my-account/settings — see comment",
  async () => {
    // intentionally empty
  },
);
