# Referrals — Frontend

## Hook

| Hook | Purpose | Source |
|---|---|---|
| `useReferralCode()` | Resolve referral code from URL/session | [src/hooks/useReferralCode.ts](../../src/hooks/useReferralCode.ts) |

## Where it's consumed

Referral codes are read on signup pages (members can be attributed at registration) and on certain promo landing pages. The site-wide `<ReferralTracker />` (mounted in `src/app/providers.tsx`) calls `useReferralCode()` on every route so any landing on `?ref=<CODE>` persists the code into `sessionStorage` under the key `tools-aus:referral-code` (uppercased, trimmed).

The `ReferFriendModal` (`src/components/modals/ReferFriendModal.tsx`) opens from the `Refer a Friend` button in the dashboard `QuickActions` panel, and also auto-opens 10s after `UserSetupModal` completes when `sessionStorage["showReferFriendAfterSetup"] === "true"` (see `src/app/(site)/my-account/page.tsx`).

> _TODO: enumerate other exact pages once root docs are merged._

## E2E test IDs

| testid | Component | Notes |
|---|---|---|
| `refer-friend-trigger` | `src/app/(site)/my-account/components/QuickActions.tsx` | Button on the dashboard that opens the modal. |
| `refer-friend-modal` | `src/components/modals/ReferFriendModal.tsx` (`<ModalContainer testId>`) | Modal panel. |
| `refer-copy-code-button` | `src/components/modals/ReferFriendModal.tsx` | Copies the referral code to the clipboard. |
| `refer-copy-link-button` | `src/components/modals/ReferFriendModal.tsx` | Copies the share link (`/membership?ref=<CODE>`) to the clipboard. |

Specs live under `e2e/referrals/`:

- `refer-modal.spec.ts` (chromium-fresh) — modal opens from QuickActions trigger and renders the user's code.
- `copy-code-link.spec.ts` (chromium-fresh) — copy button writes the code to the clipboard (requires `clipboard-read` grant).
- `signup-with-ref.spec.ts` (chromium-guest) — `?ref=<code>` landing persists the code into `sessionStorage["tools-aus:referral-code"]`.
- `refer-reward-modal.spec.ts` (chromium-fresh) — `sessionStorage["showReferFriendAfterSetup"]="true"` triggers the modal after a 10s timer (uses `page.clock.runFor(11_000)`).
