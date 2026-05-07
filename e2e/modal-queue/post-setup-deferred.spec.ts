// e2e/modal-queue/post-setup-deferred.spec.ts
//
// Verifies the 10-second deferred ReferFriendModal trigger after user setup
// completion (src/app/(site)/my-account/page.tsx:160-173). The behaviour is
// already covered by `e2e/referrals/refer-reward-modal.spec.ts`, which:
//   - installs page.clock
//   - lands on /my-account
//   - seeds sessionStorage["showReferFriendAfterSetup"] = "true"
//   - reloads, fast-forwards 11s
//   - asserts refer-friend-modal becomes visible AND the flag is cleared
//
// Per the modal-queue domain instructions: "duplicates — keep the simpler
// version and skip the other." Keeping the referrals/refer-reward-modal.spec.ts
// version (lives with sibling referral specs); this entry is a pointer.

import { test } from "../fixtures/test";

test.describe("post-setup deferred refer-friend modal", () => {
  test.skip(
    "DUPLICATE — covered by e2e/referrals/refer-reward-modal.spec.ts",
    async () => {
      // Intentionally empty.
    },
  );
});
