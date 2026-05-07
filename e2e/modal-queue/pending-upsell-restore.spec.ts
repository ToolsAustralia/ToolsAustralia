// e2e/modal-queue/pending-upsell-restore.spec.ts
//
// Pending-upsell sessionStorage restore behaviour (the "tab-switching"
// recovery path in src/stores/useModalPriorityStore.ts:280-295) is already
// covered by `e2e/upsells/post-membership.spec.ts`, which seeds the same
// `pendingUpsell` + `pendingUpsellFlag` keys and asserts the upsell modal
// opens after reload.
//
// Per the modal-queue domain instructions: "duplicates — keep the simpler
// version and skip the other." Keeping the upsells/post-membership.spec.ts
// version (it lives with sibling upsell specs); this entry is a pointer.

import { test } from "../fixtures/test";

test.describe("pending upsell restore from sessionStorage", () => {
  test.skip(
    "DUPLICATE — covered by e2e/upsells/post-membership.spec.ts",
    async () => {
      // Intentionally empty.
    },
  );
});
