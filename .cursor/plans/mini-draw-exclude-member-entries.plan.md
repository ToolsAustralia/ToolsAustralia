---
name: ""
overview: ""
todos: []
isProject: false
---

# Mini Draw: Exclude Member Entries Refactor (updated)

## Summary

Per updated terms: **Membership packages apply to Major Giveaway only; Mini Draw eligibility is only for users who purchase a Mini Pack.** The backend draw pool is already correct (MiniDraw.entries only from mini-draw-package purchases). Changes are **UI, copy, data, and export** only.

---

## 1. Entry count: mini-pack only (no member entries)

**File:** `src/components/features/MiniDrawPackages.tsx`

- In `calculateUserEntryCount()`, remove all use of `lastMonthAccumulatedEntries`.
- Return only: `participationEntry.totalEntries` when participation exists with totalEntries > 0, else `activeMiniDrawPackageEntries`.

---

## 2. Subscription management: remove “Free Entries for All Mini Draws”

**File:** `src/components/modals/SubscriptionManagementModal.tsx`

- Plan benefits: when `isMiniDrawsFeature`, do not show “X Free Entries for All Mini Draws”; show raw feature text or remove/replace with neutral copy.
- Upgrade options: remove or replace `{totalEntriesAfterUpgrade} Free Entries for All Mini Draws`.
- Downgrade options: remove or replace `{downgradeEntries} Free Entries for All Mini Draws`.

---

## 3. Membership package data: **OPTION A — Remove “Mini Draws” from subscription features**

**File:** `src/data/membershipPackages.ts`

- **Remove** the `"Mini Draws"` feature string from the `features` array for all three subscription tiers (Tradie, Foreman, Boss). Do not replace with alternative wording; membership is Major Giveaway + discounts only.

---

## 4. Mini draw participants export: correct to package-only

**File:** `src/app/api/admin/mini-draw/[id]/export/route.ts`

The export currently (1) adds `lastMonthAccumulatedEntries` to each participant’s total and (2) adds extra participants from “users with active subscriptions whose package includes Mini Draws”. Both must be removed so the export matches the refactor (only mini pack purchasers, package-only counts).

**Changes:**

1. **Existing entries (lines 65–100)**
  - Do **not** add `lastMonthAccumulatedEntries` to `entry.totalEntries`.  
  - Use **only** `entry.totalEntries` from `miniDraw.entries` when building `existingEntriesMap`.  
  - Remove the comment about “including membership benefits” and the subscription select/usage for this block (you can keep user lookup for name/email/mobile/state only).
2. **Membership-based entries block (lines 103–221)**
  - **Remove** the entire second pass that:
    - Queries users with active subscriptions whose package features include “Mini Draws”
    - Computes `totalEntries = lastMonthAccumulatedEntries + participationEntries`
    - Adds rows to `membershipEntriesMap` for users not in `existingEntriesMap`.
  - After Option A, no subscription package will include “Mini Draws”, but the logic is wrong regardless: mini draw participants should be **only** those in `miniDraw.entries`.
3. **Merge step (lines 214–221)**
  - **Remove** the merge of `membershipEntriesMap` into `mergedEntriesMap`.  
  - Export data should be built **only** from `existingEntriesMap` (i.e. from `miniDraw.entries` with package-only totals).
4. **Result**
  - Export list = exactly the participants in `miniDraw.entries`.  
  - Each row’s “Total Entries” = that entry’s `totalEntries` (mini-draw-package only).  
  - Summary “Total Entries” in Excel will align with `miniDraw.totalEntries`.

---

## 5. My Account: mini draw section banners and CTA

**File:** `src/app/(site)/my-account/page.tsx`

- “You’re entered” banner: base on **having purchased mini pack entries**, not on membership. Copy: entries only from mini pack purchases.
- CTA banner: replace “Subscribe … automatically enter all mini draws” with “Purchase a mini pack to enter mini draws” (or similar).
- Button/link labels: align with “entries only from mini packs”.

---

## 6. Mini draw detail page: membership gate and copy

**File:** `src/components/features/MiniDrawDetailClient.tsx`

- Prefer showing `MiniDrawPackages` to any authenticated user when `showPackages` (remove membership gate). If keeping gate, copy must state that membership does not grant free mini draw entries.

---

## 7. Promo/FAQ copy

**File:** `src/components/sections/promo/PromoFAQs.tsx`

- Clarify: member entries = Major Giveaway; mini draws = mini pack purchase only.

---

## 8. Optional: other copy and Klaviyo

- Mini draws list / home taglines: no claim that membership gives mini draw entries.
- Klaviyo: `mini_draw_entries` is already package-only; no change unless you want to avoid implying member_entries apply to mini draws.

---

## Implementation order (suggested)

1. **membershipPackages.ts** – Option A: remove “Mini Draws” from subscription features.
2. **MiniDrawPackages.tsx** – Remove `lastMonthAccumulatedEntries` from `calculateUserEntryCount()`.
3. **export route** – Use only `miniDraw.entries` and `entry.totalEntries`; remove member-entry addition and membership-based participant block.
4. **SubscriptionManagementModal.tsx** – Remove/replace “Free Entries for All Mini Draws”.
5. **my-account/page.tsx** – Banners and CTAs based on mini pack entries + updated copy.
6. **MiniDrawDetailClient.tsx** – Membership gate (optional) and copy.
7. **PromoFAQs.tsx** – Member vs mini draw eligibility copy.
8. Any remaining taglines.

