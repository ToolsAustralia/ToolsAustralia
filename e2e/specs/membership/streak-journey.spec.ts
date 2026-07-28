import type { Page, TestInfo } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import type { Demo } from "../../fixtures/demo";
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

/**
 * The full eleven-beat Membership Streak journey (guest → one-time buyer → day-one member →
 * building → milestone payoff → entries proof → Founding → past-due → cancellation "save"
 * with loss framing → cancellation "save" with forward framing → the terms clause) — shared
 * by the mobile and desktop demo tests below so the two viewports can never drift out of
 * sync (one journey walked twice, not two hand-maintained copies). The project-name guard
 * and the demo-title annotation stay in each CALLING test, not here, so a run recorded under
 * the wrong Playwright project fails immediately — before any of this function's DB seeding
 * or navigation even begins.
 */
async function runStreakJourney(page: Page, demo: Demo, testInfo: TestInfo): Promise<void> {
  void testInfo; // not read directly by the journey — demo.step()/demo fixture already close over it

  const userId = await memberUserId();
  await renameDemoDraw(DRAW_NAME);

  // Provably unique to LoyaltyStreak: "LEVEL"/"FOUNDING" is the medallion's own label
  // text (LoyaltyStreak.tsx:132, `{isMax ? "FOUNDING" : "LEVEL"}`) — grepped across the
  // whole src tree, it appears NOWHERE else on /my-account, not even in EntryWallet.tsx.
  // A bare `hasText: "Streak"` filter was NOT unique: from Beat 5 on, entriesBySource.streak
  // > 0 makes EntryWallet ALSO render a "Streak <n>" legend row (EntryWallet.tsx:162-167),
  // and on mobile-chrome the `lg:grid` never activates, so EntryWallet (page-client.tsx:346)
  // precedes LoyaltyStreak (page-client.tsx:368) in plain DOM order — `.first()` silently
  // resolved to the wallet's <section>, and every highlight() from Beat 5 on drew the
  // spotlight ring around the wrong card while the caption narrated the streak card. Tests
  // still passed because `expect(streakCard).toBeVisible()` is true either way — the wallet
  // genuinely is visible. See the cross-containment regression guard right before Beat 5.
  const streakCard = page.locator("section").filter({ hasText: /LEVEL|FOUNDING/i }).first();
  // Mirror-image check: "Entries ·" (the wallet's eyebrow, EntryWallet.tsx:115) is grepped
  // unique to EntryWallet.tsx across the whole src tree — LoyaltyStreak never renders it,
  // in any state (teaser, fresh, active, atrisk, paused, founding), so this locator cannot
  // resolve to the streak card the way the old `streakCard` filter could resolve to the wallet.
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

  // Regression guard (review round 2): from here on entriesBySource.streak > 0, which is
  // exactly the condition that made the OLD `hasText: "Streak"` streakCard locator
  // ambiguous with EntryWallet (see the comment above its declaration). Prove each locator
  // still resolves to its OWN, correct <section> — content one component structurally
  // cannot render — before trusting either for a highlight(). This is the assertion that
  // would have failed under the old bug: back then `streakCard` WAS the wallet, so it DID
  // contain "Entries ·".
  await expect(streakCard).toContainText(/LEVEL|FOUNDING/i); // positive: really is the streak card
  await expect(streakCard).not.toContainText("Entries ·"); // negative: NOT the wallet
  await expect(wallet).not.toContainText(/LEVEL|FOUNDING/i); // mirror-image check

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

  // Beats 9 & 10 share this exact cancel-flow entry — extracted so the two can't drift out
  // of sync the way they did before this review round (see task-2-report.md, review round
  // 2, Important 2). The Cancel button lives inside ManageSheet, which LazyManageSheet
  // mounts only once the "manage" sheet is opened (src/app/(site)/my-account/components/
  // sheets/LazyManageSheet.tsx + ManageSheet.tsx) — it does NOT exist on a bare
  // /my-account/membership load. The ?open=subscription deep-link (page-client.tsx) opens
  // it directly on the root dashboard — same proven pattern as
  // e2e/specs/account/my-account.spec.ts's ManageSheet coverage. Returns the (asserted
  // visible) Cancel button locator; deliberately does NOT click it — beat 9 clicks it
  // inside a narrated demo.step (its "tries to cancel" moment), beat 10 doesn't narrate
  // that part at all, so the click stays with each caller.
  const openManageSheetAndGetCancelButton = async () => {
    await page.goto("/my-account?open=subscription");
    await expect(page.getByText("Manage membership")).toBeVisible({ timeout: 30_000 });
    const cancelButton = page.getByRole("button", { name: /cancel membership/i });
    await expect(cancelButton).toBeVisible({ timeout: 20_000 });
    return cancelButton;
  };

  // Reason step: pick "Too expensive right now" and continue — identical in both beats,
  // only the SCREEN it reveals afterward (and whether that reveal happens before or inside
  // the next demo.step) differs per beat.
  const chooseTooExpensiveAndContinue = async () => {
    await page.getByText(/too expensive/i).first().click();
    await page.getByRole("button", { name: /continue|next/i }).first().click();
  };

  // ── Beat 9 — the save ───────────────────────────────────────────────────
  await setStreak(7);
  const cancelButton = await openManageSheetAndGetCancelButton();

  await demo.step("Now a member with a 7-renewal streak tries to cancel", async () => {
    await cancelButton.click();
    // Step1Reason's own "Why are you cancelling?" copy is a sr-only <legend> — not what a
    // viewer actually sees. The visible screen headline is "what's making you leave?".
    await expect(page.getByText(/what.{0,3}s making you leave/i).first()).toBeVisible({ timeout: 20_000 });
  });

  // Reason selection happens BEFORE the next demo.step opens, not inside it (review round 2,
  // Important 2 fix): the caption below promises "what's at stake" — the stakes screen must
  // already be on screen when the caption paints and holds, not revealed partway through
  // that hold by a click still to come. Mirrors Beat 10's already-correct shape below.
  await chooseTooExpensiveAndContinue();
  await expect(page.getByText(/on the line/i).first()).toBeVisible({ timeout: 20_000 });

  await demo.step("The cancellation flow shows exactly what's at stake", async () => {
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
  const cancelButtonAgain = await openManageSheetAndGetCancelButton();
  await cancelButtonAgain.click();
  await expect(page.getByText(/what.{0,3}s making you leave/i).first()).toBeVisible({ timeout: 20_000 });
  await chooseTooExpensiveAndContinue();
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
}

test.describe("Membership Streak demo @demo", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");
  test.use({ storageState: MEMBER_STATE });
  // Proof mode holds every caption (holdFor: max(1800, 300×words) ms) BEFORE running its
  // body AND adds slowMo:200 to every action, so a recording of this 12-beat journey runs
  // several times longer than a normal pass (~2.5m). A 300s budget timed out mid-render.
  // Normal runs keep the tighter budget so a real hang still fails fast.
  test.setTimeout(process.env.E2E_PROOF === "1" ? 1_200_000 : 300_000);

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
  // document mid-journey. Runs even if the test body fails partway through. Now that
  // TWO tests in this describe (mobile + desktop below) both run the full mutating
  // journey against the same seeded member, this afterAll still only cleans up once,
  // after BOTH tests finish — it does not (and cannot, from this file alone) prevent
  // the two from being scheduled concurrently by a mixed multi-project run; see
  // task-3-report.md for the same concern, now doubled.
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

    await runStreakJourney(page, demo, testInfo);
  });

  test("the Membership Streak, end to end, on desktop", async ({ page, demo }, testInfo) => {
    expect(testInfo.project.name, "record this one under chromium-desktop").toBe("chromium-desktop");
    testInfo.annotations.push({
      type: "demo-title",
      description: "The Membership Streak — how members earn free entries",
    });

    await runStreakJourney(page, demo, testInfo);
  });
});

// Separate describe block (not a manual browser.newContext()) so this test still gets full
// fixture coverage — QA watchdog, per-worker x-forwarded-for, third-party blocklist — from
// e2e/fixtures/test.ts. An empty storageState object is the Playwright-supported way to opt
// a describe block out of the file's auth state; `storageState` is resolved per-describe, so
// a logged-out context cannot be produced inside the authenticated describe above. Mirrors
// the proven "my-account guest gate" pattern in e2e/specs/account/my-account.spec.ts.
test.describe("Membership Streak — the non-member view @demo", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");
  test.use({ storageState: { cookies: [], origins: [] } });

  test("what a non-member sees", async ({ page, demo }, testInfo) => {
    expect(testInfo.project.name, "record this one under mobile-chrome").toBe("mobile-chrome");
    testInfo.annotations.push({
      type: "demo-title",
      description: "What a visitor sees before they sign up",
    });

    await page.goto("/my-account");
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    await demo.step("A signed-out visitor can't reach the dashboard at all", async () => {
      await expect(page.getByRole("button", { name: /sign in|log in/i }).first()).toBeVisible({ timeout: 20_000 });
    });

    // The brief's original draft asserted `page.locator("main")` to prove the page rendered —
    // verified against src/app/(site)/layout.tsx and every component in the /membership render
    // tree (MembershipPageClient.tsx and its children under src/components/sections/membership/)
    // and there is NO <main> element anywhere on this route; the site layout wraps page content
    // in a plain `<div className="site-main-content ...">`, not a landmark <main>. That assertion
    // would have timed out and failed every run. Replaced with the same proven-live locator every
    // sibling /membership spec in this repo already uses (e2e/specs/membership/modal.spec.ts,
    // purchase-subscription.spec.ts, purchase-decline.spec.ts, webhook-replay.spec.ts,
    // registration.spec.ts) — the "Choose Tradie" tier CTA, which only exists once
    // MembershipTierChooser has actually rendered.
    await page.goto("/membership");
    const chooseTradie = page
      .getByRole("button", { name: /choose tradie/i })
      .or(page.getByRole("link", { name: /choose tradie/i }))
      .first();
    await expect(chooseTradie).toBeVisible({ timeout: 30_000 });

    // Verified, not assumed: grepped "Founding member" across the whole src/ tree — it appears
    // only in src/components/sections/dashboard/LoyaltyStreak.tsx (the /my-account dashboard
    // card this journey's authenticated tests spotlight), plus the FAQ corpus and its generated
    // knowledge pack — never in src/app/(site)/membership/** or any component it imports. The
    // public signup page sells the packages/tiers; the streak ladder is a member-only surface
    // it never mentions, so this assertion states a real, currently-true fact about the product.
    await demo.step("And the public membership page never mentions the streak — that's a members-only surface", async () => {
      await expect(page.locator("body")).not.toContainText(/Founding member/i);
    });
  });
});
