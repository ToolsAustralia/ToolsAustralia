# Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Claude Design "Settings Redesign" into the real My Account → Settings page (index + Profile + Password fully; Subscription/Payment chrome-only) as a frontend-only re-skin with real data wiring and `?tab=` URL sync.

**Architecture:** Keep the shared `DashboardHeader`, session/data hooks, modal portal, and all handlers/endpoints unchanged. Redesign the settings *body*: a settings index (identity + status-aware previews + past-due/guest CTAs + tab cards), a desktop sidebar / mobile segmented strip, and re-skinned Profile & Password tabs. A single co-located primitives module encapsulates the design's look. Subscription/Payment wrappers get only outer-spacing alignment. Design-tool harness (device frame, tweaks panel, `mobile-frame` overrides) is dropped — the real app uses the real viewport.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind (config already has `red-{400,500,600,650,675}`, `brand-tier.*`, `font-poppins`), lucide-react, TanStack Query, NextAuth, `ThemeContext` (`.dark` class).

**Verification model:** No UI test runner exists in this repo (CLAUDE.md: `tsx` tests are billing-logic only). Per-task verification = `npx tsc --noEmit` clean for touched files + `npx eslint <files>` clean + the task's visual/behavioral acceptance checklist (manual conformance to the design reference). **Commit once per phase** (per user instruction), never push.

**Design reference files (read-only source of truth):**
- `c:\tmp\design_extract\tools-australia\project\settings\app.jsx` (index + shell wiring)
- `…\settings\shell.jsx` (TopHeader/SettingsSidebar — port sidebar/index only)
- `…\settings\primitives.jsx` (Card/SectionHeader/Field/Input/LockedField/Btn/Badge)
- `…\settings\profile-tab.jsx`, `…\settings\password-tab.jsx`
- `…\settings\subscription-tab.jsx`, `…\settings\payment-tab.jsx` (chrome reference only)
- Intent transcript: `c:\tmp\design_extract\tools-australia\chats\chat6.md`

**Global rules for every task:**
- Frontend only. Do NOT modify any file under `src/app/api/**`, `src/services/**`, `src/hooks/**` (except none), `src/models/**`, `src/lib/**`, `src/components/modals/SubscriptionManagementModal/**`, `src/components/modals/PaymentMethodsTab/**`. Do NOT change any fetch URL, handler, or query key.
- Reuse existing imports/handlers verbatim; only JSX/Tailwind/markup changes plus the new primitives module and the inline state-deriver.
- Every element ships explicit `dark:` variants. Use `font-poppins` where the design uses `font-display`. Use Tailwind tokens, no arbitrary hex when a token exists.
- No `any`. No new npm dependency. No new file unless this plan creates it.
- Lucide icon mapping for the design's hand-rolled icons (examples): Back→`ArrowLeft`, User→`User`, Card→`CreditCard`, Key→`KeyRound`, Wallet→`Wallet`, ChevRight→`ChevronRight`, Alert→`AlertTriangle`, CheckCir→`CheckCircle2`, Sparkles→`Sparkles`, Lock→`Lock`, Shield→`ShieldCheck`, LogOut→`LogOut`, Info→`Info`, Eye/EyeOff→`Eye`/`EyeOff`, Mail→`Mail`, Phone→`Phone`, Mobile→`Smartphone`, Star→`Star`, Plus→`Plus`, ArrowUp→`ArrowUpRight`, Fingerprint→`Fingerprint`. Match stroke widths to the design (`strokeWidth={2}`–`2.5`).

---

### Task 1: Foundation — Tailwind tokens + settings primitives + state deriver

**Files:**
- Modify: `tailwind.config.ts` (extend `boxShadow` + `keyframes`/`animation`)
- Create: `src/app/(site)/my-account/components/settings/ui/primitives.tsx`

- [ ] **Step 1: Add `lift` shadow + `pulse-ring` animation tokens to `tailwind.config.ts`**

In `theme.extend.boxShadow` add (alongside existing `xl`/`2xl`):
```ts
lift: "0 1px 0 rgba(0,0,0,0.02), 0 12px 32px -16px rgba(0,0,0,0.18)",
"lift-dark": "0 1px 0 rgba(255,255,255,0.04), 0 16px 40px -20px rgba(0,0,0,0.7)",
```
In `theme.extend.keyframes` add:
```ts
pulseRing: {
  "0%, 100%": { boxShadow: "0 0 0 0 rgba(238,0,0,0.45)" },
  "50%": { boxShadow: "0 0 0 8px rgba(238,0,0,0)" },
},
```
In `theme.extend.animation` add:
```ts
"pulse-ring": "pulseRing 1.8s ease-out infinite",
```
Apply in markup as `shadow-lift dark:shadow-lift-dark` and `animate-pulse-ring` (replaces the design's `.lift` / `.pulse-ring` CSS — no globals.css edit).

- [ ] **Step 2: Create the primitives module**

Create `src/app/(site)/my-account/components/settings/ui/primitives.tsx`, a `"use client"`-free pure presentational module (no hooks, no fetch) porting `primitives.jsx` 1:1 in TSX with typed props:

- `Card({ children, className, as })` — `rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900` + passthrough className.
- `SectionHeader({ title, description?, icon?, accent? })` — accent gradient bar (`red`/`amber`/`emerald`/`sky`), poppins bold title, optional lucide icon + description; bottom border divider.
- `Field({ label, locked?, hint?, error?, children })` — label (with `Lock` icon when locked), control slot, hint/error rows.
- `SettingsInput(props)` — themed `<input>` (`focus:ring-2 focus:ring-red-600/30 focus:border-red-600`), forwards all input props + className.
- `LockedField({ value })` — read-only styled value box.
- `SettingsButton({ variant, size, icon?, children, ...btn })` — variants `primary|secondary|ghost|danger|outlineRed|dark`, sizes `sm|md|lg`, exact classes from `primitives.jsx` (primary = `bg-red-600 hover:bg-red-675 text-white`), `type="button"` default, disabled styles.
- `SettingsBadge({ tone, icon?, children })` — tones `neutral|success|warning|danger|info|dark`.

All exported as named exports (no `Object.assign(window,…)`). Use `React.ComponentType<{ className?: string }>` for icon props. Strongly type variant/tone/size with string-literal unions.

- [ ] **Step 3: Verify types + lint**

Run: `npx tsc --noEmit` → Expected: no new errors referencing the new file.
Run: `npx eslint "src/app/(site)/my-account/components/settings/ui/primitives.tsx" "tailwind.config.ts"` → Expected: clean.

- [ ] **Step 4: Acceptance checklist**
  - `primitives.tsx` exports all 7 primitives, fully typed, no `any`, no business logic, no hooks/fetch.
  - Tailwind tokens added; no edit to `src/app/globals.css`.
  - No other file changed.

- [ ] **Step 5: Phase 1 commit**
```bash
git add tailwind.config.ts "src/app/(site)/my-account/components/settings/ui/primitives.tsx"
git commit -m "feat(settings): foundation — lift/pulse-ring tokens + settings UI primitives"
```
(Commit message body must end with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`; gpg-sign disabled if it errors.)

---

### Task 2: Settings shell, index & `?tab=` URL sync — `settings/page.tsx`

**Files:**
- Modify: `src/app/(site)/my-account/settings/page.tsx`
- Create: `src/app/(site)/my-account/components/settings/SettingsSidebar.tsx`

Preserve EXACTLY: `useSession` guard, `useMyAccountData`, `useMembershipModal`, `useQueryClient`, `handleSubscriptionUpdate`, `handleSignOut`, `hasFailedRenewal`, `MembershipModal` portal, `DashboardHeader` usage and its props, loading/error states, and the `SubscriptionTab`/`PaymentTab`/`ProfileTab`/`PasswordTab` props passed.

- [ ] **Step 1: Add pure state deriver (inline in `page.tsx`)**

Add a module-scope pure function. `insights` lives on `MyAccountData`, **not** on
`user`, so `membershipTier` is passed as a third parameter (no nested access):
```ts
import type { MyAccountData } from "@/hooks/queries"; // already used elsewhere
type SettingsUserState = "member" | "past_due" | "guest";
function deriveSettingsUserState(
  user: MyAccountData["user"],
  hasFailed: boolean,
  membershipTier?: string,
): { state: SettingsUserState; tierLabel?: string; tierPrice?: number } {
  if (hasFailed) {
    return {
      state: "past_due",
      tierLabel: user.subscriptionPackageData?.name,
      tierPrice: user.subscriptionPackageData?.price,
    };
  }
  if (user.subscription?.isActive) {
    return {
      state: "member",
      tierLabel: user.subscriptionPackageData?.name ?? membershipTier,
      tierPrice: user.subscriptionPackageData?.price,
    };
  }
  if (user.enrichedOneTimePackages?.some((p) => p.isActive)) {
    return { state: "member" }; // one-time: neutral Member, no tier chip
  }
  return { state: "guest" };
}
```
Call site: `deriveSettingsUserState(user, hasFailed, accountData.insights?.membershipTier)`.

- [ ] **Step 2: Implement `?tab=` URL sync**

- Derive `activeSection` from `searchParams.get("tab")` as the single source of truth (validate against the 4 ids; else `null`). Remove the local `useState`-only switching where it diverges from the URL.
- `setActiveTab(id)` → `router.push(\`/my-account/settings?tab=\${id}\`, { scroll: false })`; selecting index → `router.push("/my-account/settings", { scroll: false })`.
- `handleBackClick`: if a section is active → go to index (`router.push("/my-account/settings", { scroll:false })`); else `router.back()`.
- Keep the existing `useEffect` deep-link behavior subsumed by deriving from `searchParams` directly (delete the now-redundant `useState`+effect if fully replaced; keep behavior identical for first load).

- [ ] **Step 3: Create `SettingsSidebar.tsx`**

Port `shell.jsx`'s `SettingsSidebar` (desktop vertical list + mobile 4-col segmented strip) to TSX. **This file owns and exports the shared tab contract** so page + sidebar agree on one type:
```ts
export type SettingsSection = "profile" | "subscription" | "password" | "payment";
export const SETTINGS_TABS: Array<{
  id: SettingsSection; label: string; shortLabel: string;
  icon: React.ComponentType<{ className?: string }>; desc: string;
}> = [ /* Profile/Subscription/Password/Payment, lucide icons, short labels */ ];
```
`page.tsx` imports `SettingsSection` + `SETTINGS_TABS` from this file (delete the old local `SettingsSection`/`SETTINGS_ITEMS` in `page.tsx`; replace usages). Props: `{ activeTab: SettingsSection; setActiveTab: (id: SettingsSection)=>void; hasAlert: boolean; isMobile?: boolean; onSignOut: ()=>void }`. Subscription row shows the alert dot when `hasAlert`; desktop variant includes the Sign-out row → `onSignOut`. No data/business logic.

- [ ] **Step 4: Rebuild the page body**

Replace the body (the `max-w-4xl … <ul>/<div>` block) with the design's layout, wired to real data:

- **Index** (`activeSection === null`): port `SettingsIndex` from `app.jsx`:
  - Identity card: initials from `formatDisplayName(user.firstName,user.lastName)` (import from `@/utils/display-name`), real email, status badge from `deriveSettingsUserState` (`tierLabel` / `Past due` / `Guest`).
  - Past-due hero — render only when `hasFailed`; `animate-pulse-ring`; onClick → `setActiveTab("subscription")`.
  - Guest CTA — render only when state `=== "guest"`; onClick → `setActiveTab("subscription")`.
  - Tab preview cards (4) with real summaries:
    - profile: `user.isEmailVerified ? "Verified" : "Not verified"`.
    - subscription: guest → "No active plan"; past_due → "Payment failed — tap to resolve" (danger tone); member → `\`\${tierLabel ?? "Member"}\${tierPrice ? \` · $\${tierPrice}/mo\` : ""}\`` and, if `user.subscription?.endDate`, secondary `\`Next billing \${formatted endDate}\`` (format with `toLocaleDateString` or existing date util — no new dep).
    - password: primary "Change your account password" (no last-changed data).
    - payment: from `user.savedPaymentMethods` → `n=length`; `n===0` → "No cards saved"; else `\`\${n} card\${n>1?"s":""} saved\`` + secondary `"Default set"` when `some(m=>m.isDefault)`.
  - Sign-out card → `handleSignOut`.
  - Footer line: `\`Member since \${new Date(user.createdAt).toLocaleDateString("en-AU",{month:"short",year:"numeric"})}\``.
- **Tab view** (`activeSection != null`): desktop `grid grid-cols-[260px_1fr] gap-8` (sidebar + content); mobile sticky segmented `SettingsSidebar isMobile`. Render the existing tab components unchanged in props:
  - `profile` → `<ProfileTab user={user} />`
  - `subscription` → `<SubscriptionTab user=… membershipModal=… onSubscriptionUpdate=… />` (unchanged)
  - `password` → `<PasswordTab userEmail={user.email} />`
  - `payment` → `<PaymentTab user={user} />`
- Use a responsive container (`max-w-3xl` index / `max-w-6xl` tab) with real `sm:`/`lg:` (NO `mobile-frame` scaffolding). Mobile vs desktop via Tailwind responsive classes only (no JS viewport state) — render the mobile segmented strip with `lg:hidden` and the desktop sidebar with `hidden lg:block` so both exist in the DOM and CSS picks per real viewport.

- [ ] **Step 5: Verify types + lint**

Run: `npx tsc --noEmit` → Expected: no new errors.
Run: `npx eslint "src/app/(site)/my-account/settings/page.tsx" "src/app/(site)/my-account/components/settings/SettingsSidebar.tsx"` → Expected: clean.

- [ ] **Step 6: Acceptance checklist**
  - All preserved imports/handlers/props byte-identical in behavior; no fetch/queryKey/handler change.
  - `?tab=` updates on tab change; deep link `?tab=password` opens Password; browser Back from a tab → index; Back from index → `router.back()`.
  - Index shows correct identity badge + previews for member (with tier), past_due, guest, and one-time-only (neutral Member).
  - Past-due hero only when `hasFailed`; Guest CTA only when guest. Light + dark both correct. No horizontal scroll at 360px.
  - No design-harness artifacts (no tweaks panel, no device frame, no `mobile-frame` CSS).

- [ ] **Step 7: Phase 2 commit**
```bash
git add "src/app/(site)/my-account/settings/page.tsx" "src/app/(site)/my-account/components/settings/SettingsSidebar.tsx"
git commit -m "feat(settings): redesigned shell, status-aware index, sidebar & ?tab= URL sync"
```

---

### Task 3: Profile tab full re-skin — `components/settings/ProfileTab.tsx`

**Files:**
- Modify: `src/app/(site)/my-account/components/settings/ProfileTab.tsx`

Preserve EXACTLY: props interface, all `useState`, `handleSaveMobile`, `handleSaveProfile`, `invalidateAccountData`, `requestModal("user-setup", true, { initialStep: 3 })`, `getGiveawayIneligibilityReasons`, `isGiveawayIneligible`, `Dropdown` (state), `BirthdatePicker` (DOB), `GiveawayEligibilityNotice`, `formatDisplayName`, both fetch calls to `/api/user/update-profile`, all toast messages.

- [ ] **Step 1: Re-skin JSX using the new primitives, mirroring `profile-tab.jsx`**

- Wrap in `space-y-6`. Sections via `SectionHeader` (Personal Information — `User` accent red; Contact & Details — `Phone` accent red).
- Locked identity: two `Card`-based identity cards (name via `formatDisplayName`, email) with `Lock` affordance + "Contact support to change" microcopy (port design `IdentityCard`).
- Email-verified row: `Card` with `ShieldCheck`; `SettingsBadge` `success "Verified"` when `user.isEmailVerified`, else `warning "Not verified"` + the existing Verify-Email button (`requestModal(...)` unchanged) styled via `SettingsButton`.
- Guest upsell strip — render only when `!user.subscription?.isActive && !(user.enrichedOneTimePackages?.some((p) => p.isActive))` (explicit inline expression, not the page deriver — ProfileTab stays self-contained): dark gradient `Card` "Join a plan" → `router.push("/my-account/settings?tab=subscription", { scroll:false })` (add `useRouter` from `next/navigation`; no new prop threaded).
- Contact & Details: phone `Field` with a static `+61` / 🇦🇺 visual prefix adornment wrapping the existing input value/handlers (value handling byte-identical); Save phone / Reset buttons → existing handlers via `SettingsButton`.
- State: keep `<Dropdown … label="State">`; keep the `ineligibilityReasons.state` Info note.
- DOB: keep `<BirthdatePicker>`; keep the `ineligibilityReasons.under18` Info note.
- Profession: keep the existing free-text `<input>` (restyled with `SettingsInput`), `maxLength={100}` retained. **Do NOT** adopt the design's emoji tiles (changes field semantics — flagged).
- Eligibility callout (`GiveawayEligibilityNotice` unchanged) + Reset/Save profile (existing handlers) via `SettingsButton`.
- Sign-out section: render only when not guest, per design (`LogOut`, danger button). The button calls a no-op? — NO: there is no sign-out handler in ProfileTab; the design's profile sign-out duplicates the index one. **Omit the profile sign-out section** (the index + sidebar already provide sign-out; adding a handler here would thread new logic). Note in flags.

- [ ] **Step 2: Verify types + lint**

Run: `npx tsc --noEmit` → Expected: no new errors.
Run: `npx eslint "src/app/(site)/my-account/components/settings/ProfileTab.tsx"` → Expected: clean.

- [ ] **Step 3: Acceptance checklist**
  - All handlers/fetches/toasts/modal triggers unchanged; Dropdown + BirthdatePicker retained; profession stays free-text.
  - Save phone, Save profile, Reset, Verify email all behave exactly as before.
  - Guest upsell strip only for guest; navigates to subscription tab via URL.
  - Light + dark correct; no horizontal scroll at 360px; ineligibility notes still appear for SA/ACT and under-18.

- [ ] **Step 4: Phase 3 commit**
```bash
git add "src/app/(site)/my-account/components/settings/ProfileTab.tsx"
git commit -m "feat(settings): re-skin Profile tab to redesigned look (behavior unchanged)"
```

---

### Task 4: Password tab full re-skin — `components/settings/PasswordTab.tsx`

**Files:**
- Modify: `src/app/(site)/my-account/components/settings/PasswordTab.tsx`

Preserve EXACTLY: props (`userEmail`), all `useState`, `calculatePasswordStrength`, `handleChangePassword`, `handleRequestReset`, all validation/toast messages, both fetch URLs (`/api/user/change-password`, `/api/auth/request-password-reset`).

- [ ] **Step 1: Re-skin JSX mirroring `password-tab.jsx` (minus unbacked elements)**

- `space-y-6`. **Omit** the design's security-score dial + security checklist hero (no backing data — flagged).
- "Change password" `SectionHeader` (`KeyRound`, red). Three `Field`s: current / new / confirm, using a password input with show/hide eye toggle (port the design `PWInput2` pattern; keep existing `showNewPassword`/`showConfirmPassword` state; current-password field non-toggling as today).
- New-password field: live 4-segment strength bar driven by existing `calculatePasswordStrength(newPassword)` + a live **Requirements** panel (`Card` border-dashed) computed client-side from `newPassword` (`length>=6`, upper+lower, has digit, has special) — pure client logic, no data dependency.
- Confirm field: inline error "Passwords don't match." when `newPassword && confirmNewPassword && newPassword!==confirmNewPassword` (display only; the existing `handleChangePassword` validation/toasts remain authoritative and unchanged).
- Clear / Update buttons → existing handlers via `SettingsButton`.
- "Two-factor & recovery" `SectionHeader` (`Fingerprint`, emerald). Two `Card`s:
  - SMS verification — `SettingsBadge warning "Coming soon"`, disabled button, microcopy. Static placeholder (backend not implemented — flagged). No handler.
  - Email recovery — `SettingsBadge success "Active"`; "Send reset email" button → existing `handleRequestReset` (unchanged), with its loading text.

- [ ] **Step 2: Verify types + lint**

Run: `npx tsc --noEmit` → Expected: no new errors.
Run: `npx eslint "src/app/(site)/my-account/components/settings/PasswordTab.tsx"` → Expected: clean.

- [ ] **Step 3: Acceptance checklist**
  - Change-password + request-reset behavior, validation, toasts byte-identical.
  - Strength bar + requirements panel update live; confirm-mismatch inline hint shows; no security dial / checklist rendered.
  - SMS card is visibly disabled "Coming soon"; Email-recovery triggers the existing reset endpoint.
  - Light + dark correct; no horizontal scroll at 360px.

- [ ] **Step 4: Phase 4 commit**
```bash
git add "src/app/(site)/my-account/components/settings/PasswordTab.tsx"
git commit -m "feat(settings): re-skin Password tab; omit unbacked security dial (flagged)"
```

---

### Task 5: Subscription/Payment chrome alignment + docs + flag report

**Files:**
- Modify: `src/app/(site)/my-account/components/settings/SubscriptionTab.tsx`
- Modify: `src/app/(site)/my-account/components/settings/PaymentTab.tsx`
- Modify: `docs/dashboard-account/frontend.md` (+ touch any other dashboard-account doc the doc-sync hook flags)

- [ ] **Step 1: Chrome alignment only**

In `SubscriptionTab.tsx` and `PaymentTab.tsx`: keep the dynamic import + `SubscriptionManagementModal renderAsPanel` / `PaymentMethodsTab` and all props **exactly as-is**. Only adjust the outer wrapper `<div className="space-y-4">` → match the new shell's content rhythm (e.g. `space-y-6`) so the panel sits consistently with the re-skinned tabs. **No other change. Do NOT touch the modal component internals.**

- [ ] **Step 2: Update domain docs**

In `docs/dashboard-account/frontend.md` add a "Settings Redesign (2026-05-19)" section documenting: the new `settings/ui/primitives.tsx`, `SettingsSidebar.tsx`, `?tab=` URL sync, the re-skinned Profile/Password tabs, and a **Flagged / deferred design elements** subsection copied from the spec §6 (incl. payment brand/last4 and profile sign-out omission). Keep it concise; align with existing doc style. Run the doc-sync expectation: editing `src/app/(site)/my-account/**` maps to `docs/dashboard-account/` — update whichever files the Stop hook reports stale (likely `frontend.md`, possibly `architecture.md`).

- [ ] **Step 3: Verify types + lint (full touched set)**

Run: `npx tsc --noEmit` → Expected: clean (no new errors anywhere).
Run: `npm run lint` → Expected: no new errors introduced by touched files.

- [ ] **Step 4: Acceptance checklist**
  - Subscription/Payment panels render identically in behavior; only outer spacing changed.
  - `docs/dashboard-account/` updated; doc-sync Stop hook passes.
  - Flagged list present and complete.

- [ ] **Step 5: Phase 5 commit**
```bash
git add "src/app/(site)/my-account/components/settings/SubscriptionTab.tsx" "src/app/(site)/my-account/components/settings/PaymentTab.tsx" docs/dashboard-account/
git commit -m "feat(settings): align Sub/Pay chrome; document redesign + flagged follow-ups"
```

---

## Final review (post-implementation, separate pass)

After Task 5, a fresh-context review pass (the caller's "100x" self-review):
1. Re-read each changed file end-to-end vs the design reference + spec §5.
2. Confirm zero changes to fetch URLs, query keys, handlers, modal internals, `DashboardHeader`, layout, hooks, services, models.
3. `npx tsc --noEmit` + `npm run lint` clean.
4. Walk all states: member(tradie/foreman/boss)/past_due/guest/one-time × light/dark × 360px & desktop — verify against design (minus flagged).
5. Produce the consolidated flagged-elements report for the user.

## Spec coverage self-check

- Spec §4 tokens/primitives → Task 1. ✓
- Spec §5.1 shell+index+URL sync → Task 2. ✓
- Spec §5.2 Profile → Task 3. ✓
- Spec §5.3 Password → Task 4. ✓
- Spec §5.4/5.5 Sub/Pay chrome → Task 5. ✓
- Spec §6 flags → Task 5 docs + Final review report. ✓
- Spec §2a harness-drop → enforced in Task 2 Step 4 + global rules. ✓
- Spec §3 scope locks → global rules + per-task "preserve exactly". ✓
