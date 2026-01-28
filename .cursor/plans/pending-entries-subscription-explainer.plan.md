---
name: "Pending entries and subscription explainer "
overview: "Refactor my-account pending entries so subscribers (and failed-renewal users) never see 0: show upcoming entries with a renewal-date indicator or a distinct 'update payment' indicator. Add a one-time-per-account subscription explainer modal. Minimal surface area: one date util, one modal, optional localStorage helpers, inline stats updates."
todos:
  - id: format-renewal
    content: Add formatRenewalDate(date, locale = 'en-AU') util (compact DD/MM/YYYY, 7pm)
    status: pending
  - id: pending-ui
    content: Define PendingEntriesData type; update Membership card (expected entries + badge), remove Hourglass and tooltip
    status: pending
  - id: explainer-modal
    content: "Implement SubscriptionExplainerModal and wire in store + UnifiedModalManager "
    status: pending
  - id: explainer-trigger
    content: "Add explainer trigger effect + localStorage (hasSeenExplainer / markExplainerSeen helpers) "
    status: pending
isProject: false
---

# Pending Entries + Subscription Explainer (Lean Plan)

## 1. Pending entries refactor

**Goal:** Active subscribers with 0 membership entries in the draw never see "0". They see **upcoming entries** (expected count) plus a **text/badge** with the renewal date in a **compact** format.

**Renewal date format:** Use a **compact UI format** for the renewal date, e.g.:

- `28/01/2026, 7pm` (DD/MM/YYYY for default `en-AU`; locale configurable via `formatRenewalDate(date, locale)`).

So the indicator reads **"Added on renewal · 28/01/2026, 7pm"**. Numeric date + time; keep it short and scannable.

**Current behavior:** [My-account page](src/app/\\\\\\\\\\(site)/my-account/page.tsx) stats grid shows Membership = 0 when pending, with Hourglass + tooltip.

**Who gets "don't show 0" (same approach):**

- **(A) Active subscribers** with 0 membership entries in the draw (`hasActiveMembership` + 0 in draw).
- **(B) Failed renewal users** with 0 membership entries in the draw. Failed renewal = `hasFailedRenewal(user)` from [subscription-helpers](src/utils/subscription/subscription-helpers.ts): `status === "past_due"` and `!isActive` and `autoRenew === true`. These users can "Pay now" to restore their subscription.

**Changes:**

- **`getPendingEntries()`**: 
  - Consider both (A) and (B). Today it only checks `hasActiveMembership`; extend to also treat `hasFailedRenewal(user)` as eligible when membership entries in draw are 0.
  - Define a **`PendingEntriesData`** type and return it when pending. Keeps TS strict and avoids misuse:
    ```ts
    type PendingEntriesData = {
      expectedEntries: number;
      renewalDate: Date | null;  // from user.subscription?.endDate; fixed 7pm when formatting if not stored
      isFailedRenewal: boolean;  // from hasFailedRenewal(user)
      isPending: true;
    };
    ```

  - `getPendingEntries()` returns `PendingEntriesData | null`. UI branches simply: `if (pending.isFailedRenewal) { ... } else { ... }`.
- **`formatRenewalDate(date: Date, locale = 'en-AU') => string`**: Output compact format like `28/01/2026, 7pm` (DD/MM/YYYY for en-AU). Define locale explicitly: default `'en-AU'`. Add to [month-helpers](src/utils/dates/month-helpers.ts) or `src/utils/dates/format-renewal.ts`. Use `date-fns` `format` + locale.
- **Membership card**: When `pendingEntriesData`, show `expectedEntries` instead of `displayMembershipEntries`, and a small **badge/text**:
  - **Active (A):** If `renewalDate` present → `Added on renewal · {formatRenewalDate(renewalDate)}`. If null → `Added on renewal` only. Never render `Added on renewal · undefined`.
  - **Failed renewal (B):** Use a **different indicator**: **`Update payment to add entries`** (recommended; short and clear). Alternatives: "Pay now to restore entries" or "Payment required to add entries". Avoid vague copy like "Pending". **Do not** pass `renewalDate` / `endDate` into `formatRenewalDate` for (B); we branch on `isFailedRenewal` and never show a date for failed-renewal.
- Remove Hourglass, pending tooltip block, and related state (`showPendingTooltip`, `pendingTooltipPosition`). Keep the **accumulation** tooltip (Info + MonthProjectionTooltip) as-is.
- **Total Entries:** Unchanged.

No new components or hooks. Logic stays in the page.

---

### 1b. Failed renewal users (same approach, different indicator)

Apply the **same pattern** as active subscribers: never show 0, show upcoming entries. Use a **distinct indicator** so users understand they must update payment.

- **Eligibility:** `hasFailedRenewal(user)` (past_due, !isActive, autoRenew) and 0 membership entries in the draw.
- **Display:** Show `expectedEntries` (same derivation as active case where possible; package + `entriesPerMonth`). Badge: **`Update payment to add entries`** (no date). Never use `renewalDate` or `formatRenewalDate` for (B).
- **`getPendingEntries()`** returns `PendingEntriesData` with `isFailedRenewal: true` for this case; Membership card branches on `isFailedRenewal` to render the failed-renewal indicator (no date) instead of the renewal-date one.

---

## 2. Subscription explainer modal

**Goal:** One-time **per account** modal on my-account explaining (1) entries added every month, (2) note that users who joined on the 25th, 26th, or 27th are billed on the 24th next month (UI prep only).

**When:** **Active subscriber only** (not failed-renewal), not seen before, my-account only, after higher-priority modals. Same priority as special-packages (1). Do **not** show the explainer to failed-renewal users — they already have the payment-focused RenewalFailedModal; the explainer would be noise.

**Persistence:** `localStorage` key `subscriptionExplainerSeen_${userId}`. Set on close, check before requesting.

**Optional readability improvement:** Use two tiny helpers instead of inline `localStorage` calls:

```ts
const hasSeenExplainer = (userId: string) =>
  typeof window !== "undefined" && !!localStorage.getItem(`subscriptionExplainerSeen_${userId}`);

const markExplainerSeen = (userId: string) =>
  typeof window !== "undefined" && localStorage.setItem(`subscriptionExplainerSeen_${userId}`, "true");
```

- Guard `userId` and SSR (e.g. only use inside `useEffect` or when `userId` exists). Keeps trigger effect clean.

**Content:** Headline ("How your membership entries work"), body ("You receive **X** entries every month"), billing note (25th–27th → 24th), single "Got it" / "Close" button.

**Implementation:**

- **`SubscriptionExplainerModal`**: Props `isOpen`, `onClose`, `entriesPerMonth`, `packageName?`. Use `ModalContainer`, `ModalHeader`, `ModalContent`, `Button`. Presentational only.
- **Store:** Add `subscription-explainer` to `ModalType`, priority 1. Not in `SESSION_ONCE_MODALS`.
- **UnifiedModalManager:** Add case, render modal, pass data from `activeModalData`.
- **Trigger (my-account):** Single `useEffect`. Only call `requestModal('subscription-explainer', ...)` when:
  - **Active member** (`hasActiveMembership`), not failed-renewal — never trigger for `hasFailedRenewal(user)`.
  - `!hasSeenExplainer(userId)`, and not in upsell/user-setup flow this run, **and**
  - **`!activeModal`** — do not fire while any other modal is active. Use `activeModal` from `useModalPriorityStore` (or equivalent) so we never race with upsell/user-setup/renewal-failed.
- **Dependency array:** Depend only on `userId`, `hasActiveMembership`, `hasFailedRenewal(user)`, and `activeModal`. **Do not** depend on the entire `user` object or `accountData` — that causes unnecessary retriggers. Add `requestModal` etc. only if the linter requires it; keep the set minimal.
- On close: `markExplainerSeen(userId)`, then normal close handler.

---

## 3. Files to add or touch

| File | Action |

|------|--------|

| `src/utils/dates/month-helpers.ts` or `format-renewal.ts` | Add `formatRenewalDate` (compact format) |

| `src/app/(site)/my-account/page.tsx` | Define `PendingEntriesData` type; extend `getPendingEntries`; update Membership card; remove pending tooltip + state; add explainer trigger (tight deps: `userId`, `hasActiveMembership`, `hasFailedRenewal(user)`, `activeModal`); optionally `hasSeenExplainer` / `markExplainerSeen` |

| `src/components/modals/SubscriptionExplainerModal.tsx` | **New** modal |

| `src/stores/useModalPriorityStore.ts` | Add `subscription-explainer` type and priority |

| `src/components/modals/UnifiedModalManager.tsx` | Handle `subscription-explainer`, render modal |

---

## 4. What we’re not doing

- No `MembershipStatCard` or `AccountStatsGrid` extraction.
- No `useAccountStats` or `useSubscriptionExplainerTrigger` hooks.
- No DB persistence for explainer-seen.
- No changes to MajorDrawSection or Total Entries logic.

---

## 5. Implementation order

1. Add `formatRenewalDate(date, locale = 'en-AU')` (compact: `28/01/2026, 7pm`), then use it in `getPendingEntries` and the Membership card.
2. Update Membership card: expected count + badge (active: renewal date; failed-renewal: "Update payment to add entries"), remove Hourglass and pending tooltip.
3. Implement `SubscriptionExplainerModal` and wire in store + UnifiedModalManager.
4. Add explainer trigger effect + `hasSeenExplainer` / `markExplainerSeen` helpers.