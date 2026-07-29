# Membership Streak Client Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce narrated mobile + desktop demo videos walking one member through the entire Membership Streak feature — from non-member through Founding, including the cancellation save — plus a proposed terms clause.

**Architecture:** No product code changes. A new `@demo`-tagged Playwright spec drives the real app against the seeded e2e database, writing streak state directly into Mongo between beats to compress months into seconds. The repo's existing proof-mode pipeline (`e2e/proof/post.ts`) renders captions, AU voice-over and screenshots into shippable mp4s.

**Tech Stack:** Playwright, `tsx`, MongoDB (native driver via `e2e/helpers/db.ts`), the proof-mode pipeline in `e2e/proof/`.

**Design spec:** `docs/superpowers/specs/2026-07-28-membership-streak-demo-design.md`

## Global Constraints

- **NO COMMITS without DJ's explicit authorization** (CLAUDE.md rule 1). Commit steps below are written out but MUST NOT run until DJ says `commit` / `push` / `ship it`. Ask, then wait.
- **No `src/` or `scripts/` changes.** This plan touches `e2e/**` and `docs/**` only. Changing product code would trigger BUSINESS.md / CUSTOMER.md doc-sync and is out of scope.
- **Proof-mode rule 1:** mutate state and reload BEFORE the beat's `demo.step`, never inside it. `demo.step` paints its caption and holds *before* running the body.
- **Proof-mode rule 4:** one test per Playwright project. Never call `setViewportSize` mid-recording — Playwright fixes the video canvas at context creation and never rescales it.
- **Caption rule:** a beat's caption must open ON its subject. Navigation, loading and modal dismissal happen silently before `demo.step` is called.
- **Copy rule (CLAUDE.md rule 11, LEGAL):** every caption and narration string uses "free entries" / "prize draw" / "giveaway". NEVER "odds", "chances", "lottery", "raffle", "bet". Entries are never sold — they are included with the membership.
- **`@demo` is a client-facing curation tag.** Every tagged test needs a `demo-title` annotation in plain client language, never a spec id.
- Streak ladder, verbatim from `src/config/streakMilestones.ts`: **Lv2 +100 · Lv4 +200 · Lv6 +300 · Lv8 +400 · Lv10 +500 · Lv12 +600**, `STREAK_RECURRENCE_PERIOD = 12`, `STREAK_FOUNDING_LEVEL = 12`.

---

## File Structure

| File | Responsibility |
|---|---|
| `e2e/seed/streak.ts` (create) | All demo state mutations — one exported function per account state. The single place that knows the shape of `subscription.streakMonths`, `oneTimePackages`, `entriesBySource.streak`. |
| `e2e/specs/membership/streak-journey.spec.ts` (create) | The three tests: mobile journey, desktop journey, guest coda. Narration and beat order only — no DB field knowledge (it calls the seed helpers). |
| `e2e/lib/env.ts` (modify) | Add the streak preview flag to the server env overlay. |
| `docs/STREAK_TERMS_CLAUSE.md` (create) | The proposed §5.1(e) wording. |
| `docs/e2e/proof-mode.md` (modify) | Document the new `@demo` flow + rules learned. |

**Critical dependency:** without the `e2e/lib/env.ts` change the streak card never renders and every beat is blank. Task 1 must land first.

---

### Task 1: Streak preview flag + demo state helpers

**Files:**
- Modify: `e2e/lib/env.ts` (the `overlay` object, ~line 52)
- Create: `e2e/seed/streak.ts`
- Modify: `e2e/seed/index.ts`

**Interfaces:**
- Consumes: `connectE2eDb`, `MEMBER` from `e2e/helpers/db.ts`
- Produces, all from `e2e/seed/streak.ts`:
  - `setNonMember(): Promise<void>`
  - `setOneTimeHolder(): Promise<void>`
  - `setStreak(months: number, opts?: { streakEntries?: number }): Promise<void>`
  - `setPastDue(months: number): Promise<void>`
  - `seedCelebrationMarker(page: Page, userId: string, lastSeen: number): Promise<void>`
  - `memberUserId(): Promise<string>`
  - `renameDemoDraw(name: string): Promise<void>`

- [ ] **Step 1: Add the streak preview flag to the e2e env overlay**

In `e2e/lib/env.ts`, inside the `overlay` object (beside the other `NEXT_PUBLIC_*` entries):

```ts
    // Membership Streak surfaces (LoyaltyStreak card, EntryWallet gold bucket,
    // RewardsMilestones track) ship DARK behind DASHBOARD_FEATURES.loyaltyStreak /
    // .milestoneProgress, which read this var (src/config/dashboardFeatures.ts).
    // The streak-journey @demo spec is entirely blank without it.
    NEXT_PUBLIC_DASHBOARD_STREAK_PREVIEW: "true",
```

- [ ] **Step 2: Create the demo state helpers**

Create `e2e/seed/streak.ts`:

```ts
import type { Page } from "@playwright/test";
import { connectE2eDb, MEMBER } from "../helpers/db";

/**
 * Membership Streak demo — state mutations for the @demo journey spec.
 *
 * The demo walks ONE member through their whole life by writing state directly
 * and reloading, so months compress into seconds while every number on screen
 * stays the real counter driving the real card.
 *
 * Field shapes verified against:
 *   - acct derivation: src/utils/dashboard/derive-dashboard-account-state.ts
 *     (pastdue → paused → active → onetime → none)
 *   - one-time detection: getActivePackage reads user.oneTimePackages[].isActive
 *   - streak counter: src/hooks/useDashboardState.ts reads subscription.streakMonths
 *   - entry buckets: EntryWallet sums entriesBySource; e2e/helpers/db.ts reads
 *     totalEntries — the two MUST stay equal (see e2e/seed/draw.ts).
 */

async function users() {
  const db = await connectE2eDb();
  return db.connection.collection("users");
}

/** The seeded member's _id as a string — needed for the celebration localStorage key. */
export async function memberUserId(): Promise<string> {
  const user = await (await users()).findOne({ email: MEMBER.email }, { projection: { _id: 1 } });
  if (!user) throw new Error("memberUserId: seeded member not found — run wipeAndSeed first");
  return String(user._id);
}

/** Beat 1 — registered account, never purchased (acct: "none"). */
export async function setNonMember(): Promise<void> {
  await (await users()).updateOne(
    { email: MEMBER.email },
    { $unset: { subscription: "", oneTimePackages: "" } }
  );
}

/** Beat 2 — one-time pack holder, no subscription (acct: "onetime"). */
export async function setOneTimeHolder(): Promise<void> {
  await (await users()).updateOne(
    { email: MEMBER.email },
    {
      $unset: { subscription: "" },
      $set: { oneTimePackages: [{ packageId: "apprentice-onetime", isActive: true, purchaseDate: new Date() }] },
    }
  );
}

/** Active Tradie subscription at `months` consecutive renewals (acct: "active"). */
export async function setStreak(months: number, opts: { streakEntries?: number } = {}): Promise<void> {
  const now = new Date();
  const renewalIn12Days = new Date(now.getTime() + 12 * 24 * 3600 * 1000);
  await (await users()).updateOne(
    { email: MEMBER.email },
    {
      $unset: { oneTimePackages: "" },
      $set: {
        subscription: {
          packageId: "tradie-subscription",
          status: "active",
          isActive: true,
          startDate: new Date(now.getTime() - months * 30 * 24 * 3600 * 1000),
          endDate: renewalIn12Days,
          autoRenew: true,
          streakMonths: months,
          streakGeneration: 1,
        },
      },
    }
  );
  if (opts.streakEntries !== undefined) await setStreakEntries(opts.streakEntries);
}

/** Beat 8 — failed renewal (acct: "pastdue" → the at-risk card). */
export async function setPastDue(months: number): Promise<void> {
  const now = new Date();
  await (await users()).updateOne(
    { email: MEMBER.email },
    {
      $unset: { oneTimePackages: "" },
      $set: {
        subscription: {
          packageId: "tradie-subscription",
          status: "past_due",
          isActive: false,
          startDate: new Date(now.getTime() - months * 30 * 24 * 3600 * 1000),
          endDate: new Date(now.getTime() - 2 * 24 * 3600 * 1000),
          autoRenew: true,
          streakMonths: months,
          streakGeneration: 1,
        },
      },
    }
  );
}

/**
 * Writes the member's streak entry bucket on the active draw. totalEntries is kept
 * equal to the bucket sum — EntryWallet renders the buckets while e2e/helpers/db.ts
 * entriesForUser() reads totalEntries, and a mismatch makes the two disagree on camera.
 */
async function setStreakEntries(streakEntries: number): Promise<void> {
  const db = await connectE2eDb();
  const membership = 15; // the seeded Tradie position (e2e/seed/draw.ts)
  const { ObjectId } = await import("mongodb");
  const userId = new ObjectId(await memberUserId());
  await db.connection.collection("majordraws").updateOne(
    { status: "active" },
    {
      $set: {
        "entries.$[row].entriesBySource": { membership, streak: streakEntries },
        "entries.$[row].totalEntries": membership + streakEntries,
        "entries.$[row].lastUpdatedDate": new Date(),
        totalEntries: membership + streakEntries,
      },
    },
    { arrayFilters: [{ "row.userId": userId }] }
  );
}

/**
 * Beat 5 — arms the celebration. useStreakCelebration (src/hooks/useStreakCelebration.ts)
 * fires when the live counter EXCEEDS the persisted per-user marker and the new level sits
 * on a rung. A first-ever visit seeds the marker silently, so it must be planted BEFORE the
 * page that shows the milestone loads.
 */
export async function seedCelebrationMarker(page: Page, userId: string, lastSeen: number): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`ta-streak-seen:${userId}`, String(lastSeen)] as const
  );
}

/** The seeded draw is called "E2E Major Draw" — unshippable in a client video. */
export async function renameDemoDraw(name: string): Promise<void> {
  const db = await connectE2eDb();
  await db.connection.collection("majordraws").updateOne({ status: "active" }, { $set: { name } });
}
```

- [ ] **Step 3: Verify the helpers compile and the flag is wired**

Run:

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "e2e/seed/streak" || echo "streak.ts: no type errors"
grep -n "NEXT_PUBLIC_DASHBOARD_STREAK_PREVIEW" e2e/lib/env.ts
```

Expected: `streak.ts: no type errors`, and the grep prints the overlay line.

- [ ] **Step 4: Prove the flag reaches the running app**

Run the existing dashboard smoke test, which boots the e2e server with the overlay:

```bash
npx tsx e2e/run.ts --grep "dashboard loads for the seeded active member" --project chromium-desktop
```

Expected: PASS. This does not yet assert the streak card — it proves the server still boots with the new env var. A boot failure here means the overlay edit broke `resolveE2eEnv`.

- [ ] **Step 5: Commit — ONLY IF DJ HAS AUTHORIZED (see Global Constraints)**

```bash
git add e2e/lib/env.ts e2e/seed/streak.ts
git commit -m "test(e2e): streak preview flag + demo state helpers"
```

---

### Task 2: The journey spec — mobile, validated OUTSIDE proof mode

**Files:**
- Create: `e2e/specs/membership/streak-journey.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect` from `e2e/fixtures/test.ts`; `MEMBER_STATE` from `e2e/lib/paths.ts`; every helper from `e2e/seed/streak.ts` (Task 1)
- Produces: test title `"the Membership Streak, end to end, on mobile"`

**Why non-proof first:** proof mode forces `workers: 1` and `slowMo: 200`, so a full run takes minutes. Every selector and state transition gets validated at normal speed first; only then do we record. Iterating on selectors inside proof mode is the single biggest time sink available here.

- [ ] **Step 1: Write the spec**

Create `e2e/specs/membership/streak-journey.spec.ts`:

```ts
import { test, expect } from "../../fixtures/test";
import { MEMBER_STATE } from "../../lib/paths";
import {
  memberUserId,
  renameDemoDraw,
  seedCelebrationMarker,
  setNonMember,
  setOneTimeHolder,
  setPastDue,
  setStreak,
} from "../../seed/streak";

const DRAW_NAME = "July Major Draw";

test.describe("Membership Streak demo @demo", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");
  test.use({ storageState: MEMBER_STATE });
  test.setTimeout(300_000); // proof mode holds every caption before running its body

  test("the Membership Streak, end to end, on mobile", async ({ page, demo }, testInfo) => {
    expect(testInfo.project.name, "record this one under mobile-chrome").toBe("mobile-chrome");
    testInfo.annotations.push({
      type: "demo-title",
      description: "The Membership Streak — how members earn free entries",
    });

    const userId = await memberUserId();
    await renameDemoDraw(DRAW_NAME);

    const streakCard = page.locator("section").filter({ hasText: "Streak" }).first();
    const wallet = page.locator("section").filter({ hasText: "Entries ·" }).first();

    // ── Beat 1 — not a member yet ───────────────────────────────────────────
    // Warm the route BEFORE the first demo.step so the opening caption lands on a
    // rendered page, never a blank tab (proof-mode round-3 rule).
    await setNonMember();
    await page.goto("/my-account");
    await expect(page.getByText(/Become a member/i)).toBeVisible({ timeout: 30_000 });

    await demo.step("Someone with an account but no membership sees what they're missing", async () => {
      await expect(page.getByText(/Members only/i)).toBeVisible({ timeout: 20_000 });
      await demo.highlight(streakCard, "The full reward ladder — the reason to join");
    });

    // ── Beat 2 — one-time buyer ─────────────────────────────────────────────
    await setOneTimeHolder();
    await page.reload();
    await expect(page.getByText(/Members only/i)).toBeVisible({ timeout: 30_000 });

    await demo.step("A one-time pack buyer sees it too — the ladder is members-only", async () => {
      await demo.highlight(streakCard, "Still locked — membership is what starts a streak");
    });

    // ── Beat 3 — day one ────────────────────────────────────────────────────
    await setStreak(0);
    await page.reload();
    await expect(page.getByText(/New streak/i)).toBeVisible({ timeout: 30_000 });

    await demo.step("They join. Day one — the streak starts at zero", async () => {
      await expect(page.getByText(/Fresh steel/i)).toBeVisible({ timeout: 20_000 });
      await demo.highlight(streakCard, "+100 free entries at their 2nd renewal");
    });

    // ── Beat 4 — building ───────────────────────────────────────────────────
    await setStreak(3);
    await page.reload();
    await expect(streakCard).toBeVisible({ timeout: 30_000 });

    await demo.step("Three renewals in — level 2 is banked, level 4 is next", async () => {
      await expect(page.getByText(/\+200 free entries/i).first()).toBeVisible({ timeout: 20_000 });
      await demo.highlight(streakCard, "One more renewal for +200 free entries");
    });

    // ── Beat 5 — the payoff ─────────────────────────────────────────────────
    // Marker planted at 3 so the live counter of 4 crosses a rung and celebrates once.
    await seedCelebrationMarker(page, userId, 3);
    await setStreak(4, { streakEntries: 300 });
    await page.reload();
    await expect(page.getByText(/free entries landed/i)).toBeVisible({ timeout: 30_000 });

    await demo.step("Their 4th renewal lands — 200 free entries, granted automatically", async () => {
      await expect(page.getByText(new RegExp(DRAW_NAME, "i")).first()).toBeVisible({ timeout: 20_000 });
      await demo.highlight(streakCard, `+200 free entries, straight into the ${DRAW_NAME}`);
    });

    // ── Beat 6 — entries proof ──────────────────────────────────────────────
    await setStreak(6, { streakEntries: 600 });
    await page.reload();
    await expect(wallet).toBeVisible({ timeout: 30_000 });

    await demo.step("Six renewals in — 600 free entries banked from the streak alone", async () => {
      await demo.smoothScrollTo(wallet);
      await expect(wallet.getByText(/Streak/i).first()).toBeVisible({ timeout: 20_000 });
      await demo.highlight(wallet, "600 free entries, on top of their monthly entries");
    });

    // ── Beat 7 — Founding ───────────────────────────────────────────────────
    await setStreak(12, { streakEntries: 2100 });
    await page.goto("/my-account");
    await expect(page.getByText(/Founding member/i)).toBeVisible({ timeout: 30_000 });

    await demo.step("Twelve renewals — the permanent Founding member badge", async () => {
      await demo.highlight(streakCard, "The ladder now repeats, every year they stay");
    });

    // ── Beat 8 — forgiving ──────────────────────────────────────────────────
    await setPastDue(7);
    await page.goto("/my-account");
    await expect(page.getByText(/Payment issue/i)).toBeVisible({ timeout: 30_000 });

    await demo.step("A failed payment doesn't burn the streak — fixing the card carries it on", async () => {
      await expect(page.getByText(/streak.{0,10}s safe/i)).toBeVisible({ timeout: 20_000 });
      await demo.highlight(streakCard, "Nothing banked is lost");
    });

    // ── Beat 9 — the save ───────────────────────────────────────────────────
    await setStreak(7);
    await page.goto("/my-account/membership");
    await expect(page.getByRole("button", { name: /cancel/i }).first()).toBeVisible({ timeout: 30_000 });

    await demo.step("Now a member with a 7-renewal streak tries to cancel", async () => {
      await page.getByRole("button", { name: /cancel/i }).first().click();
      await expect(page.getByText(/why are you|reason/i).first()).toBeVisible({ timeout: 20_000 });
    });

    await demo.step("The cancellation flow shows exactly what's at stake", async () => {
      await page.getByText(/too expensive/i).first().click();
      await page.getByRole("button", { name: /continue|next/i }).first().click();
      await expect(page.getByText(/on the line/i)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/\+400 free entries/i)).toBeVisible({ timeout: 20_000 });
    });

    await demo.step("Pausing freezes the streak instead of ending it — the strongest save we have", async () => {
      await expect(page.getByText(/Pausing freezes your streak/i)).toBeVisible({ timeout: 20_000 });
      await demo.highlight(page.getByRole("button", { name: /Keep my streak/i }), "One tap keeps it alive");
    });

    // ── Beat 10 — forward framing ───────────────────────────────────────────
    // The OTHER stakes variant: under 2 renewals there is no streak to lose, so the
    // screen pivots to the ladder ahead (StepStakes.tsx — lossFraming = streak >= 2).
    await setStreak(1);
    await page.goto("/my-account/membership");
    await expect(page.getByRole("button", { name: /cancel/i }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /cancel/i }).first().click();
    await page.getByText(/too expensive/i).first().click();
    await page.getByRole("button", { name: /continue|next/i }).first().click();
    await expect(page.getByText(/just.{0,10}getting started/i)).toBeVisible({ timeout: 20_000 });

    await demo.step("A newer member sees the other side of it — the ladder ahead, not the loss", async () => {
      await expect(page.getByText(/ONE renewal away/i)).toBeVisible({ timeout: 20_000 });
      await demo.highlight(page.getByText(/2nd renewal/i).first(), "One renewal from their first +100");
    });

    // ── Beat 11 — the legals ────────────────────────────────────────────────
    await page.goto("/terms");
    const clause = page.getByText(/Additional entries may be offered/i);
    await expect(clause).toBeVisible({ timeout: 30_000 });
    await demo.smoothScrollTo(clause);

    await demo.step("And it's covered in the terms — free entries, never sold", async () => {
      await demo.highlight(clause, "Section 5.1 — additional free entries");
    });
  });
});
```

- [ ] **Step 2: Run it OUTSIDE proof mode and watch it fail**

```bash
npx tsx e2e/run.ts --grep "on mobile" --project mobile-chrome
```

Expected on the first run: FAIL. The likely failures, in order of probability, are (a) a text selector that doesn't match the rendered copy, (b) the cancel button on `/my-account/membership` having different labelling, (c) the reason-step control names in `Step1Reason`. This step exists to surface them cheaply.

- [ ] **Step 3: Fix each failing selector against the real DOM**

For every failure, read the actual component before guessing — `src/components/sections/dashboard/LoyaltyStreak.tsx`, `src/components/modals/CancellationFlowModal/Step1Reason.tsx`, `src/app/(site)/my-account/membership/`. Do NOT loosen an assertion to make it pass; a caption that narrates something the viewer cannot see is the exact defect proof mode is prone to.

- [ ] **Step 4: Re-run until green**

```bash
npx tsx e2e/run.ts --grep "on mobile" --project mobile-chrome
```

Expected: PASS, all beats.

- [ ] **Step 5: Commit — ONLY IF AUTHORIZED**

```bash
git add e2e/specs/membership/streak-journey.spec.ts
git commit -m "test(e2e): membership streak @demo journey spec (mobile)"
```

---

### Task 3: Desktop twin + guest coda

**Files:**
- Modify: `e2e/specs/membership/streak-journey.spec.ts`

**Interfaces:**
- Consumes: everything from Task 2
- Produces: test titles `"the Membership Streak, end to end, on desktop"` and `"what a non-member sees"`

- [ ] **Step 1: Extract the journey body into a shared function**

Refactor the Task 2 test body into `async function runStreakJourney(page, demo, testInfo)` above the describe, then have the mobile test call it. This avoids two copies drifting apart — the desktop test is the identical journey at a different viewport.

- [ ] **Step 2: Add the desktop test**

```ts
  test("the Membership Streak, end to end, on desktop", async ({ page, demo }, testInfo) => {
    expect(testInfo.project.name, "record this one under chromium-desktop").toBe("chromium-desktop");
    testInfo.annotations.push({
      type: "demo-title",
      description: "The Membership Streak — how members earn free entries",
    });
    await runStreakJourney(page, demo, testInfo);
  });
```

- [ ] **Step 3: Add the guest coda in its own describe**

A separate describe is required — `storageState` is per-describe, and a logged-out context cannot be produced inside an authenticated test.

```ts
test.describe("Membership Streak — the non-member view @demo", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");
  test.use({ storageState: { cookies: [], origins: [] } });

  test("what a non-member sees", async ({ page, demo }, testInfo) => {
    testInfo.annotations.push({
      type: "demo-title",
      description: "What a visitor sees before they sign up",
    });

    await page.goto("/my-account");
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    await demo.step("A signed-out visitor can't reach the dashboard at all", async () => {
      await expect(page.getByRole("button", { name: /sign in|log in/i }).first()).toBeVisible({ timeout: 20_000 });
    });

    await page.goto("/membership");
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });

    await demo.step("And the public membership page never mentions the streak — worth fixing", async () => {
      await expect(page.locator("body")).not.toContainText(/Founding member/i);
    });
  });
});
```

- [ ] **Step 4: Run all three outside proof mode**

```bash
npx tsx e2e/run.ts --grep "on desktop"          --project chromium-desktop
npx tsx e2e/run.ts --grep "what a non-member"   --project mobile-chrome
```

Expected: both PASS.

- [ ] **Step 5: Commit — ONLY IF AUTHORIZED**

```bash
git add e2e/specs/membership/streak-journey.spec.ts
git commit -m "test(e2e): desktop twin + non-member coda for the streak demo"
```

---

### Task 4: Render, frame-verify, and review the videos

**Files:** none modified — this task produces artifacts under `e2e-artifacts/proof/`.

- [ ] **Step 1: Render the mobile journey**

```bash
npx tsx e2e/run.ts --proof --grep "on mobile" --project mobile-chrome
```

Scope by **test title**, not `--project` alone — `--project` still collects every test in the file, and a mis-projected test failing inside a serial describe skips the one you wanted.

- [ ] **Step 2: Frame-verify the opening and closing seconds**

```bash
ls e2e-artifacts/proof/*/
ffmpeg -ss 00:00:01 -i <path>.mp4 -frames:v 1 /tmp/open.png
ffmpeg -ss 00:00:20 -i <path>.mp4 -frames:v 1 /tmp/mid.png
```

Then **Read those PNGs** and confirm: the video opens on the title card (not a blank tab), the title card shows the client-facing `demo-title`, captions sit at the top and don't cover the streak card, and no caption narrates something absent from the frame. Extract frames where nobody looks, not only at cue midpoints — that is where every previously-shipped defect hid.

- [ ] **Step 3: Render desktop + coda**

```bash
npx tsx e2e/run.ts --proof --grep "on desktop"        --project chromium-desktop
npx tsx e2e/run.ts --proof --grep "what a non-member" --project mobile-chrome
```

- [ ] **Step 4: Run the judge panel on both journey videos**

Invoke `/video-review` against the rendered mp4s. Bar: no criterion below 4, average ≥ 4.5, zero disclosed cosmetic defects. Verdict RERENDER means fix and repeat Step 1 — do not ship a video the panel rejected.

- [ ] **Step 5: Report the bundle paths to DJ**

Each `e2e-artifacts/proof/<date>-<branch>/<test-slug>/` is self-contained (mp4 + srt + step screenshots + HTML report) and needs no checkout to view. Give DJ the paths and the one-line framing note about the feature being shipped dark.

---

### Task 5: Terms clause + documentation

**Files:**
- Create: `docs/STREAK_TERMS_CLAUSE.md`
- Modify: `docs/e2e/proof-mode.md`

- [ ] **Step 1: Write the proposed terms clause**

Create `docs/STREAK_TERMS_CLAUSE.md`. It must state that this is a **proposal only — no live terms are changed by this file**, that §5.1 sentence 3 today reads *"Additional entries may be offered via promotions, referrals, or free entry methods"* (generic coverage; the streak is never named), and that naming it is the stronger position at launch. Then the proposed clause, verbatim:

> **5.1(e) Membership Streak.** Members receive free entries at consecutive paid renewal milestones — the 2nd, 4th, 6th, 8th, 10th and 12th consecutive renewal — granted automatically into the next eligible Major Giveaway. These free entries are included with the membership at no additional cost and are not sold separately. A streak counts consecutive **paid** renewals only. A membership that lapses in full resets the streak to zero and the milestone ladder restarts. Paused or overdue memberships accrue no streak progress while no renewal payment is made. The ladder repeats every twelve consecutive renewals. Tools Australia may vary or withdraw future unearned milestones on reasonable notice; milestones already earned are unaffected.

Check it against CLAUDE.md rule 11 before saving: no "odds", "chances", "lottery", "raffle", "bet"; entries described as *included*, never sold or priced per unit.

- [ ] **Step 2: Document the new @demo flow**

In `docs/e2e/proof-mode.md`, add `streak-journey.spec.ts` to the list of `@demo` flows and add a short "Rules learned" subsection covering: the DB-mutation-between-beats device, the `NEXT_PUBLIC_DASHBOARD_STREAK_PREVIEW` overlay requirement, and the celebration marker needing `addInitScript` before load.

- [ ] **Step 3: Verify no doc-sync breakage**

```bash
npm run lint 2>&1 | tail -5
```

Expected: clean. No `src/` or `scripts/` file changed, so the doc-sync Stop hook's BUSINESS/CUSTOMER triggers stay silent.

- [ ] **Step 4: Commit — ONLY IF AUTHORIZED**

```bash
git add docs/STREAK_TERMS_CLAUSE.md docs/e2e/proof-mode.md
git commit -m "docs: proposed streak terms clause + demo flow notes"
```

---

## Known risks

**The `paused` card state is unreachable — confirmed, not a guess.** `deriveStreakCardState` (`src/utils/dashboard/streak-display.ts:79`) returns `null` for any `acct` that isn't `active` or `pastdue`, and `page-client.tsx` never passes the `paused` prop. A retention-paused member therefore sees **no streak card at all**. Beat 8 shows at-risk only; the pause story rides on beat 9's freeze reframe, which is real and reachable. Report to DJ as a product finding: the cancellation flow promises "pausing freezes your streak", but a member who accepts that pause then sees nothing confirming it.

**Selector fragility in beats 9–10.** The cancellation flow's reason step and cancel entry point are the least-pinned parts of this spec, and beat 10 walks the same path a second time. Task 2 Step 3 exists specifically to resolve them against the real DOM rather than by guessing — fix them once and apply to both beats.

**Video length.** Twelve beats at proof-mode hold rates lands near 4–5 minutes per viewport. If DJ wants it tighter, the cut candidates in order are beat 2 (one-time buyer), beat 7 (Founding), then beat 4 (building) — never beats 9–10, which are the commercial argument.
