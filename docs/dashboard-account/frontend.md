# Dashboard-Account — Frontend

## Pages

`src/app/(site)/my-account/`:
- Profile view / edit
- Subscription management (cancel, upgrade, downgrade)
- Payment methods (list, add, set default, remove)
- Draws history / current entries
- Rewards / redeemables wallet
- Metrics / activity

> _TODO: enumerate exact page subdirectories._

## Hooks

See [architecture.md](./architecture.md#hooks) — `useDashboardEntryDisplay`, `useDashboardLandingOrchestration`.

## LandingPageTrigger

[src/app/(site)/components/LandingPageTrigger.tsx](../../src/app/(site)/components/LandingPageTrigger.tsx) — coordinates "first-time" landing page experiences. Hooks into [metrics-analytics](../metrics-analytics/) helpers (`dashboard-landing-session`, `dashboard-entry-hold`).

## State conventions

- All data via TanStack Query from feature-domain API
- No local state for things that should be global

## E2E test IDs

`src/app/(site)/my-account/page.tsx` — outermost wrapper carries `data-testid="dashboard-root"` (registry: `testid.dashboardRoot`). Used by Playwright auth specs (`login.spec.ts`, `logout.spec.ts`, `user-setup-modal.spec.ts`) to assert successful navigation to the authenticated dashboard.

### QuickActions

`src/app/(site)/my-account/components/QuickActions.tsx`:
- The "Refer a Friend" button carries `data-testid="refer-friend-trigger"` (`testid.referFriendTrigger`). Used by `e2e/referrals/refer-modal.spec.ts` and `e2e/referrals/copy-code-link.spec.ts` to open the `ReferFriendModal`.

The dashboard also auto-opens the `ReferFriendModal` 10 seconds after `UserSetupModal` completes when `sessionStorage["showReferFriendAfterSetup"] === "true"` (see `src/app/(site)/my-account/page.tsx` lines ~150-173). Covered by `e2e/referrals/refer-reward-modal.spec.ts`, which uses `page.clock.runFor(11_000)` to fast-forward instead of waiting wall-clock.

### Settings page (`/my-account/settings`)

`src/app/(site)/my-account/settings/page.tsx`:
- The tab list `<ul>` carries `account-settings-tabs` (`testid.accountSettingsTabs`).
- Each tab button carries `account-settings-tab-<id>` where id is `profile | subscription | password | payment` (`testid.accountSettingsTab{Profile,Subscription,Password,Payment}`). The list is gated until `useMyAccountData` resolves — first paint can take ~20s on a cold session, use `timeout: 25_000` on the first assertion.
- Tab clicks DO NOT update the URL — they swap a `useState<SettingsSection | null>` value. However the page reads `?tab=...` on first mount, so deep-linking (`/my-account/settings?tab=password`) works.

`src/app/(site)/my-account/components/settings/ProfileTab.tsx`:
- Phone input + save: `account-update-phone`, `account-update-phone-submit` (`testid.accountUpdatePhone`, `testid.accountUpdatePhoneSubmit`). Posts to `/api/user/update-profile`. Mobile values are normalised by the User model pre-save hook to `+61...` format (see `src/models/User.ts` line ~1060).
- Profession input: `account-profile-profession` (`testid.accountProfileProfession`). Persisted via the "Save profile" button.
- "Save profile" button: `account-profile-save` (`testid.accountProfileSave`). Saves state, profession, birthdate to `/api/user/update-profile`.
- **Name and Email are READ-ONLY** in this tab — there is no UI surface to edit them. Any spec needing first/last-name editing will block until that surface is added.

`src/app/(site)/my-account/components/settings/PasswordTab.tsx`:
- Inputs: `account-change-password-current`, `-new`, `-confirm` (`testid.accountChangePassword{Current,New,Confirm}`).
- Save button: `account-change-password-save` (`testid.accountChangePasswordSave`). Posts to `/api/user/change-password`.

`src/components/modals/PaymentMethodsTab.tsx` (rendered by the Payment tab):
- Add button (both empty-state and bottom variants): `account-add-payment-method-button` (`testid.accountAddPaymentMethodButton`). Posts to `/api/stripe/create-setup-intent`.
- Each saved card row: `account-saved-card-item` (`testid.accountSavedCardItem`).
- Delete + Set Default buttons inside each row: `account-saved-card-delete`, `account-saved-card-set-default` (`testid.accountSavedCard{Delete,SetDefault}`).

### Specs (`e2e/account/`)

| Spec | Status | Notes |
|---|---|---|
| `profile-update.spec.ts` | PASS | edits profession (firstName/lastName not exposed) |
| `change-password.spec.ts` | PASS | mutates fresh user, restores hash in afterEach |
| `update-email.spec.ts` | BLOCKED | no UI surface for changing email; only verify-existing-email exists |
| `update-phone.spec.ts` | PASS | asserts mobile normalised to `+61...` |
| `payment-methods.spec.ts` | PASS (narrowed) | fresh user has no Stripe customer — asserts empty state + add-button visible only |
| `settings-tabs.spec.ts` | PASS | clicks swap content; deep-link `?tab=password` works (URL doesn't update on click) |

### Worker-index gotcha for fixture-mutating specs

`emailFor("fresh")` defaults to `process.env.TEST_WORKER_INDEX` (the global Playwright worker index, which can drift after worker respawns). The custom test fixture (`e2e/fixtures/test.ts`) loads `e2e/.auth/<role>-w<parallelIndex>.json` — i.e. `testInfo.parallelIndex`. These can disagree. Specs that mutate the fixture user **must** use `emailFor("fresh", testInfo.parallelIndex)` so the DB query targets the same user the storageState is authenticated as.
