# E2E watch commands

Single-purpose commands for **visually watching** Playwright specs run in a real Chromium window. All commands:

- Open a real Chrome window (no embedded preview)
- Run sequentially (`--workers=1`) so windows don't fight
- Skip the 24 setup logins (`--no-deps`) — uses existing storageState files
- Skip seed/cleanup (`E2E_KEEP_FIXTURES=true`) — DB stays seeded across runs
- 400ms slow-mo between actions (`PLAYWRIGHT_SLOW_MO=400`) so you can read what's happening

Prerequisites: dev server on `localhost:3000` (`npm run dev`) and a one-time seed (`npm run seed:e2e`).

---

## Curated journeys (most useful)

End-to-end flows that walk through a representative user experience.

| Command | What it covers | Approx time |
|---|---|---|
| `npm run watch:journey:guest` | Homepage → login → guest checkout | ~3 min |
| `npm run watch:journey:fresh` | Profile → settings tabs → join membership → member checkout | ~5 min |
| `npm run watch:journey:tradie` | Upgrade → cancel → upsell-redeem → member checkout | ~4 min |

---

## All flows for one user role

Runs every spec mapped to that role. Use this when you want to see "everything a tradie can do."

| Command | Role's storage state | Spec count |
|---|---|---|
| `npm run watch:guest` | unauthenticated | ~30 specs (auth, navigation, contact, consent, partner, promo, banners, url-params, draws/major guest, draws/mini guest, shop guest specs) |
| `npm run watch:fresh` | logged-in, no subscription | ~25 specs (account, referrals, toasts, modal-queue, global-ui, membership/{join,benefits}, shop/{member-checkout,my-account-orders}, rewards, etc.) |
| `npm run watch:tradie` | active Tradie subscription | ~6 specs (membership/{upgrade,cancel,cancel-upsell-redeem,update-payment-method,explainer-modal}) |
| `npm run watch:foreman` | active Foreman subscription | ~2 specs (membership/{upgrade,downgrade}) |
| `npm run watch:boss` | active Boss subscription | ~1 spec (membership/downgrade) |
| `npm run watch:cancelling` | Tradie with autoRenew off | ~1 spec (membership/resume) |
| `npm run watch:pastdue` | Tradie with status=past_due | ~2 specs (membership/{renewal-failed,update-payment-method}) |
| `npm run watch:affiliate` | logged-in affiliate | ~4 specs (affiliate/{login,dashboard,link-generation,commission-track}) |

---

## All flows in one domain (across all relevant roles)

| Command | What it does |
|---|---|
| `npm run watch:auth` | Login, logout, forgot-password, reset-password, email-verification, user-setup-modal |
| `npm run watch:account` | Profile update, change password, update email/phone, payment methods, settings tabs |
| `npm run watch:membership` | Join, upgrade, downgrade, cancel, cancel-upsell-redeem, resume, renewal-failed, update-payment-method, benefits, package-detail, special-packages, explainer-modal |
| `npm run watch:shop` | Cart, guest checkout, member checkout, 3DS, browse-filter, brand page, member discount, order detail, my-account orders, out-of-stock |

---

## One specific spec file

The `npm run watch` base script lets you append any args after `--`:

```powershell
# Watch one spec, in its specific project:
npm run watch -- e2e/membership/cancel.spec.ts --project=chromium-tradie

# Watch one spec without slow-mo (faster):
npm run watch -- e2e/auth/login.spec.ts --project=chromium-guest --slow-mo=0

# Watch with debug inspector (step-by-step):
npm run watch -- e2e/account/profile-update.spec.ts --project=chromium-fresh --debug

# Watch only previously-failed tests:
npm run watch -- --last-failed
```

---

## Adjusting the speed

The default `npm run watch` uses `PLAYWRIGHT_SLOW_MO=400`. Override per run:

```powershell
# Slower (great for screen recording / demos)
$env:PLAYWRIGHT_SLOW_MO="1000"; npm run watch:journey:tradie

# Faster (just verifying things work)
$env:PLAYWRIGHT_SLOW_MO="100"; npm run watch:fresh

# No slow-mo (full speed)
$env:PLAYWRIGHT_SLOW_MO="0"; npm run watch:tradie
```

---

## Browse + click in a UI (instead of CLI)

```powershell
$env:E2E_KEEP_FIXTURES="true"; npm run test:e2e:ui
```

Opens UI mode at `localhost:8080`:

- Left sidebar lists all 152 tests grouped by file
- Filter by status (passed / failed / skipped) or project
- **Toggle the 👁 (Show browser) icon** to make Chromium visibly pop up per run
- Click any test → ▶ to run → watch live
- Click a finished test → scrub the trace (instant replay with screenshots)

---

## Watch the report after a run

```powershell
npm run test:e2e:report
```

Opens an HTML report of the last run with per-test traces (screenshots, network, console, source).

---

## Other E2E scripts (not watch-related)

| Command | Purpose |
|---|---|
| `npm run test:e2e` | Run all 152 tests headlessly (4 workers, fast — use for CI-like validation) |
| `npm run test:e2e:headed` | Run all tests with browser windows visible |
| `npm run test:e2e:debug` | Run with Playwright Inspector for stepping through |
| `npm run test:e2e:codegen` | Open codegen recorder against `localhost:3000` |
| `npm run test:e2e:report` | View last HTML report |
| `npm run test:e2e:ui` | UI mode (recommended browser-based runner) |
| `npm run test:e2e:auth` | Headless run of all auth specs |
| `npm run test:e2e:account` | Headless run of all account specs |
| `npm run test:e2e:draws` | Headless run of all draws specs |
| `npm run test:e2e:membership` | Headless run of all membership specs |
| `npm run test:e2e:shop` | Headless run of all shop specs |
| `npm run test:e2e:upsells` | Headless run of all upsells specs |
| `npm run test:e2e:rewards` | Headless run of all rewards specs |
| `npm run test:e2e:promo` | Headless run of all promo specs |
| `npm run test:e2e:referrals` | Headless run of all referrals specs |
| `npm run test:e2e:affiliate` | Headless run of all affiliate specs |
| `npm run test:e2e:partner` | Headless run of all partner specs |
| `npm run test:e2e:contact` | Headless run of all contact specs |
| `npm run test:e2e:consent` | Headless run of all consent specs |
| `npm run test:e2e:navigation` | Headless run of all navigation specs |
| `npm run test:e2e:url-params` | Headless run of all url-params specs |
| `npm run test:e2e:modal-queue` | Headless run of all modal-queue specs |
| `npm run test:e2e:global-ui` | Headless run of all global-ui specs |
| `npm run test:e2e:banners-widgets` | Headless run of all banners-widgets specs |
| `npm run test:e2e:toasts` | Headless run of all toasts specs |

---

## Seed and cleanup

| Command | Purpose |
|---|---|
| `npm run seed:e2e` | Seed 28 fixtures (24 Users + 4 Affiliates) + 20 real Stripe test customers |
| `npm run seed:e2e:clear` | Purge all fixtures (Mongo + Stripe + Klaviyo, no re-seed) |
| `npm run cleanup:e2e` | Cascade delete: Mongo docs + Stripe customers + Klaviyo profile deletion jobs queued |

Both seed (purge step) and cleanup queue Klaviyo data-privacy deletion jobs for every `test-e2e-*@example.com` profile. Klaviyo deletion is asynchronous on their side — jobs appear on the Deleted Profiles page in the Klaviyo dashboard once processed (usually within minutes). If Klaviyo is not configured (`KLAVIYO_API_KEY` missing), the step skips silently.

`globalSetup` runs `seed:e2e` automatically when `npm run test:e2e` starts, unless `E2E_KEEP_FIXTURES=true` is set. `globalTeardown` runs `cleanup:e2e` after the suite, also skipped under `E2E_KEEP_FIXTURES=true`.

---

## Troubleshooting

**Watch commands skip setup; if storageState files don't exist yet:**
Run setup once with `npm run test:e2e -- --project=setup-shared --project=setup-affiliate` to generate them. Subsequent watch runs reuse the files.

**A watched spec fails because user state is wrong:**
The fixture users may have leftover state from prior runs. Re-run `npm run seed:e2e` to reset everything.

**Browser opens but nothing happens for 30s:**
Dev server may have stalled. Check `localhost:3000` is responding. If not, kill old node processes and restart `npm run dev`.

**Want to see only one role's flows, not the cascade across all projects:**
Use the per-role command (e.g., `npm run watch:tradie`) — the `--project=chromium-<role>` filter prevents other projects from running.

**Want to run the same spec on multiple roles to compare:**
Use the per-spec form across multiple commands:
```powershell
npm run watch -- e2e/membership/upgrade.spec.ts --project=chromium-tradie
npm run watch -- e2e/membership/upgrade.spec.ts --project=chromium-foreman
```

---

## Quick reference card

```
EVERY-FLOW-IN-A-DOMAIN
  npm run watch:auth
  npm run watch:account
  npm run watch:membership
  npm run watch:shop

EVERY-FLOW-FOR-A-ROLE
  npm run watch:guest          (unauthenticated)
  npm run watch:fresh          (logged-in, no subscription)
  npm run watch:tradie         (Tradie subscription)
  npm run watch:foreman        (Foreman subscription)
  npm run watch:boss           (Boss subscription)
  npm run watch:cancelling     (cancelled subscription)
  npm run watch:pastdue        (past-due subscription)
  npm run watch:affiliate      (logged-in affiliate)

CURATED-USER-JOURNEYS
  npm run watch:journey:guest
  npm run watch:journey:fresh
  npm run watch:journey:tradie

ONE-SPEC
  npm run watch -- <path/to/spec.ts> --project=chromium-<role>

UI-MODE
  npm run test:e2e:ui          (browser at localhost:8080)
  npm run test:e2e:report      (HTML report of last run)
```
