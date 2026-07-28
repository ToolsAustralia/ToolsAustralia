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

  // This spec drives the ONE shared seeded member (e2e/helpers/db.ts MEMBER) through
  // eleven different lifecycle states via direct DB writes (e2e/seed/streak.ts) — the
  // same account every other spec's `storageState: MEMBER_STATE` logs in as, and the
  // same draw (e2e/seed/draw.ts, renamed here to DRAW_NAME) other specs read entries
  // from. Best-effort restore of the two baselines documented in those seed files
  // (users.ts: active tradie-subscription, no streakMonths; draw.ts: 15 membership
  // entries, draw named "E2E Major Draw", no streak bucket) so a run that scopes to
  // just this spec doesn't leave the shared fixtures visibly wrong for whatever runs
  // next. This does NOT make the spec safe to run interleaved with others in the same
  // pass — see the file-level concern in task-2-report.md; there is no seed-level lock
  // preventing a concurrently-scheduled worker from reading/mutating this same
  // document mid-journey. Runs even if the test body fails partway through.
  test.afterAll(async () => {
    await setStreak(0, { streakEntries: 0 });
    await renameDemoDraw("E2E Major Draw");
  });

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

    // The dashboard's subscription-explainer overlay (src/app/(site)/my-account/page-client.tsx)
    // auto-opens ~2.5s after mount, but ONLY the first time a session with an ACTIVE
    // subscription lands on /my-account (gated on hasSeenExplainer(userId) — a fresh browser
    // context has no localStorage). Beats 1-2 below are guest/one-time (never active), so
    // Beat 3 is the very first qualifying load; dismissing it there is enough for the rest of
    // the journey — Escape closes it via the same onClose path a backdrop click would, which
    // calls markExplainerSeen(userId) (src/components/modals/UnifiedModalManager.tsx), and
    // that localStorage key persists across every later reload/goto in this same context.
    // Mirrors the proven helper in e2e/specs/account/my-account.spec.ts.
    const dismissSubscriptionExplainerIfItOpens = async () => {
      const headline = page.locator("#sem-headline");
      const opened = await headline
        .waitFor({ state: "visible", timeout: 4_000 })
        .then(() => true)
        .catch(() => false);
      if (opened) {
        await page.keyboard.press("Escape");
        await headline.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
      }
    };

    // ── Beat 1 — not a member yet ───────────────────────────────────────────
    // Warm the route BEFORE the first demo.step so the opening caption lands on a
    // rendered page, never a blank tab (proof-mode round-3 rule).
    //
    // "Become a member" is NOT unique on this page: DashboardHero (src/components/
    // sections/dashboard/DashboardHero.tsx) renders it TWICE more — once in a
    // "hidden lg:flex" desktop row, once in an "lg:hidden" mobile row — the exact
    // "PromoHero renders a mobile AND desktop copy" hazard demo.ts's own showHighlight
    // comment warns about. On mobile-chrome, `.first()` over the whole page resolves
    // to the DESKTOP row's copy (first in DOM order, CSS-hidden at this viewport) and
    // fails toBeVisible(). Scope to DashboardGuestPanel's own section (the one that
    // also has "Buy a package" — a button DashboardHero never renders) so the match is
    // structurally unique regardless of viewport, no `:visible` guessing required.
    await setNonMember();
    await page.goto("/my-account");
    const guestCta = page.locator("section").filter({ hasText: "Buy a package" }).getByRole("button", { name: /Become a member/i });
    await expect(guestCta).toBeVisible({ timeout: 30_000 });

    await demo.step("Someone with an account but no membership sees what they're missing", async () => {
      await expect(page.getByText(/Members only/i).first()).toBeVisible({ timeout: 20_000 });
      await demo.highlight(streakCard, "The full reward ladder — the reason to join");
    });

    // ── Beat 2 — one-time buyer ─────────────────────────────────────────────
    await setOneTimeHolder();
    await page.reload();
    await expect(page.getByText(/Members only/i).first()).toBeVisible({ timeout: 30_000 });

    await demo.step("A one-time pack buyer sees it too — the ladder is members-only", async () => {
      await demo.highlight(streakCard, "Still locked — membership is what starts a streak");
    });

    // ── Beat 3 — day one ────────────────────────────────────────────────────
    await setStreak(0);
    await page.reload();
    await dismissSubscriptionExplainerIfItOpens();
    await expect(page.getByText(/New streak/i).first()).toBeVisible({ timeout: 30_000 });

    await demo.step("They join. Day one — the streak starts at zero", async () => {
      await expect(page.getByText(/Fresh steel/i).first()).toBeVisible({ timeout: 20_000 });
      await demo.highlight(streakCard, "+100 free entries at their 2nd renewal");
    });

    // ── Beat 4 — building ───────────────────────────────────────────────────
    await setStreak(3);
    await page.reload();
    await expect(streakCard).toBeVisible({ timeout: 30_000 });

    await demo.step("Three renewals in — level 2 is banked, level 4 is next", async () => {
      // The "next rung" reward pill renders TWICE (a persistent copy + a hover-reveal
      // copy hidden via CSS `hidden`, both real DOM text) — .first() avoids a strict-mode
      // violation, not a loosened assertion (both nodes carry the identical, correct text).
      await expect(page.getByText(/\+200 free entries/i).first()).toBeVisible({ timeout: 20_000 });
      await demo.highlight(streakCard, "One more renewal for +200 free entries");
    });

    // ── Beat 5 — the payoff ─────────────────────────────────────────────────
    // Marker planted at 3 so the live counter of 4 crosses a rung and celebrates once.
    await seedCelebrationMarker(page, userId, 3);
    await setStreak(4, { streakEntries: 300 });
    await page.reload();
    await expect(page.getByText(/free entries landed/i).first()).toBeVisible({ timeout: 30_000 });

    await demo.step("Their 4th renewal lands — 200 free entries, granted automatically", async () => {
      await expect(page.getByText(new RegExp(DRAW_NAME, "i")).first()).toBeVisible({ timeout: 20_000 });
      await demo.highlight(streakCard, `+200 free entries, straight into the ${DRAW_NAME}`);
    });

    // seedCelebrationMarker's addInitScript is PAGE-scoped and Playwright has no API to
    // unregister it — left alone, it keeps re-planting lastSeen=3 before every future
    // navigation for the rest of THIS test. Since every later beat jumps streakMonths
    // forward again (3→6→12...), that stale marker would re-arm a NEW celebration on every
    // reload, and at Beat 7 the celebration's justHit banner takes priority over the
    // "Founding member" chip (LoyaltyStreak.tsx: `if (justHit) return { label: ... }` runs
    // BEFORE the `founding` case), which would break that beat's own assertion. Register a
    // second script with a lastSeen no future streak value in this test will ever cross —
    // later-registered init scripts run last, so "999" permanently wins from here on.
    await seedCelebrationMarker(page, userId, 999);

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
    await expect(page.getByText(/Founding member/i).first()).toBeVisible({ timeout: 30_000 });

    await demo.step("Twelve renewals — the permanent Founding member badge", async () => {
      await demo.highlight(streakCard, "The ladder now repeats, every year they stay");
    });

    // ── Beat 8 — forgiving ──────────────────────────────────────────────────
    await setPastDue(7);
    await page.goto("/my-account");
    await expect(page.getByText(/Payment issue/i).first()).toBeVisible({ timeout: 30_000 });

    await demo.step("A failed payment doesn't burn the streak — fixing the card carries it on", async () => {
      // "streak's safe" sits inside a <b> nested in the footer <p> — both contain the
      // matching substring, so .first() resolves the strict-mode ambiguity.
      await expect(page.getByText(/streak.{0,10}s safe/i).first()).toBeVisible({ timeout: 20_000 });
      await demo.highlight(streakCard, "Nothing banked is lost");
    });

    // ── Beat 9 — the save ───────────────────────────────────────────────────
    // The Cancel button lives inside ManageSheet, which LazyManageSheet mounts only once
    // the "manage" sheet is opened (src/app/(site)/my-account/components/sheets/
    // LazyManageSheet.tsx + ManageSheet.tsx) — it does NOT exist on a bare
    // /my-account/membership load. The ?open=subscription deep-link (page-client.tsx)
    // opens it directly on the root dashboard — same proven pattern as
    // e2e/specs/account/my-account.spec.ts's ManageSheet coverage.
    await setStreak(7);
    await page.goto("/my-account?open=subscription");
    await expect(page.getByText("Manage membership")).toBeVisible({ timeout: 30_000 });
    const cancelButton = page.getByRole("button", { name: /cancel membership/i });
    await expect(cancelButton).toBeVisible({ timeout: 20_000 });

    await demo.step("Now a member with a 7-renewal streak tries to cancel", async () => {
      await cancelButton.click();
      // Step1Reason's own "Why are you cancelling?" copy is a sr-only <legend> — not what a
      // viewer actually sees. The visible screen headline is "what's making you leave?".
      await expect(page.getByText(/what.{0,3}s making you leave/i).first()).toBeVisible({ timeout: 20_000 });
    });

    await demo.step("The cancellation flow shows exactly what's at stake", async () => {
      await page.getByText(/too expensive/i).first().click();
      await page.getByRole("button", { name: /continue|next/i }).first().click();
      await expect(page.getByText(/on the line/i).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/\+400 free entries/i).first()).toBeVisible({ timeout: 20_000 });
    });

    await demo.step("Pausing freezes the streak instead of ending it — the strongest save we have", async () => {
      await expect(page.getByText(/Pausing freezes your streak/i).first()).toBeVisible({ timeout: 20_000 });
      await demo.highlight(page.getByRole("button", { name: /Keep my streak/i }), "One tap keeps it alive");
    });

    // ── Beat 10 — forward framing ───────────────────────────────────────────
    // The OTHER stakes variant: under 2 renewals there is no streak to lose, so the
    // screen pivots to the ladder ahead (StepStakes.tsx — lossFraming = streak >= 2). Same
    // ManageSheet → Cancel → reason → stakes path as Beat 9; the earlier flow never
    // completed an actual cancellation, so the subscription is still active to re-enter.
    await setStreak(1);
    await page.goto("/my-account?open=subscription");
    await expect(page.getByText("Manage membership")).toBeVisible({ timeout: 30_000 });
    const cancelButtonAgain = page.getByRole("button", { name: /cancel membership/i });
    await expect(cancelButtonAgain).toBeVisible({ timeout: 20_000 });
    await cancelButtonAgain.click();
    await expect(page.getByText(/what.{0,3}s making you leave/i).first()).toBeVisible({ timeout: 20_000 });
    await page.getByText(/too expensive/i).first().click();
    await page.getByRole("button", { name: /continue|next/i }).first().click();
    await expect(page.getByText(/just.{0,10}getting started/i).first()).toBeVisible({ timeout: 20_000 });

    await demo.step("A newer member sees the other side of it — the ladder ahead, not the loss", async () => {
      await expect(page.getByText(/ONE renewal away/i).first()).toBeVisible({ timeout: 20_000 });
      await demo.highlight(page.getByText(/2nd renewal/i).first(), "One renewal from their first +100");
    });

    // ── Beat 11 — the legals ────────────────────────────────────────────────
    await page.goto("/terms");
    const clause = page.getByText(/Additional entries may be offered/i).first();
    await expect(clause).toBeVisible({ timeout: 30_000 });
    await demo.smoothScrollTo(clause);

    await demo.step("And it's covered in the terms — free entries, never sold", async () => {
      await demo.highlight(clause, "Section 5.1 — additional free entries");
    });
  });
});
