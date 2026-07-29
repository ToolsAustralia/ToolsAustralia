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
  // Task-5 fix (Finding 2): read once here for the desktop-only corrective scroll below
  // (Beat 1) — every other use of `testInfo` stays inside demo.step()/the demo fixture,
  // which already close over it.
  const isDesktop = testInfo.project.name === "chromium-desktop";

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
  // context has no localStorage). Escape closes it via the same onClose path a backdrop click
  // would, which calls markExplainerSeen(userId) (src/components/modals/UnifiedModalManager.tsx),
  // and that localStorage key persists across every later reload/goto in this same context.
  // Mirrors the proven helper in e2e/specs/account/my-account.spec.ts.
  //
  // Task-4 root cause (Finding 1), round 1: dismissing ONLY around Beat 3 was not enough —
  // the very first time this modal is requested, its component is a `next/dynamic` chunk
  // (UnifiedModalManager.tsx) that has never been fetched/parsed by the browser before, and
  // that fetch+parse can push #sem-headline's actual DOM appearance past this helper's own
  // wait budget. When that race is lost, Escape is never pressed, markExplainerSeen(userId)
  // never runs, hasSeenExplainer(userId) stays false, and the explainer's 2.5s auto-open
  // timer re-arms on EVERY subsequent full-page navigation.
  //
  // Round 2 (live proof-mode evidence, not just theory): calling this helper after every
  // navigation still was NOT enough — cue-midpoint frames from an actual proof render still
  // caught the explainer open at cues 3, 4, 5, 6, AND 9 (mid-cancellation-flow, inside
  // openManageSheetAndGetCancelButton). The wait below races the explainer's fixed 2.5s
  // delay PLUS the `accountData` fetch that has to resolve before that delay even starts
  // ticking (page-client.tsx's effect is gated on `accountData` being loaded) — under proof
  // mode's slowMo:200 and this dev server's per-route first-compile latency, that combined
  // time is not reliably bounded from the test side no matter how this helper is called.
  //
  // Fix: stop racing it. The app's own gate is a plain, synchronous localStorage read
  // (`hasSeenExplainer`, src/utils/subscription-explainer-storage.ts) — seeding that exact
  // key up front, via the SAME `page.addInitScript` technique `seedCelebrationMarker` below
  // already uses in this file, makes the explainer provably unable to schedule its timer at
  // all for the rest of this browser context, instead of probabilistically dismissing it
  // after it's already on screen. See the `addInitScript` call right after this helper.
  //
  // This helper is kept as a defensive backstop at every navigation that can re-arm the
  // modal (in case a future change to the app's gating logic ever bypasses the seeded key) —
  // near-free once the key is set, since the fast-skip below returns immediately.
  const dismissSubscriptionExplainerIfItOpens = async () => {
    const alreadySeen = await page
      .evaluate((id) => !!window.localStorage.getItem(`subscriptionExplainerSeen_${id}`), userId)
      .catch(() => false);
    if (alreadySeen) return;
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
  // Deterministic prevention (see comment above): pre-seed the explainer's own "seen" key so
  // its auto-open effect (`if (hasSeenExplainer(userId)) return;`, page-client.tsx) never
  // schedules the timer in the first place, on ANY navigation for the rest of this context.
  // Registered once, applies to every future page.goto()/reload() automatically — the exact
  // "PAGE-scoped, no unregister API" mechanism `seedCelebrationMarker`'s own comment (below)
  // documents, used here for the opposite purpose (permanently OFF rather than re-armed).
  await page.addInitScript(
    (key) => window.localStorage.setItem(key, "true"),
    `subscriptionExplainerSeen_${userId}`
  );

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
  // Task-4 fix (round 4, Finding 1 + Finding 4): hoisted BEFORE demo.step, mirroring Beat 6's
  // already-proven fix. Instrumented live (mobile-chrome, normal mode): streakCard sits inside
  // DashboardGuestPanel's stacked single-column layout — well below the fold on mobile at
  // scroll=0 (boxBefore.y=643 against an 839px-tall viewport). Relying on demo.highlight's own
  // scrollIntoViewIfNeeded safety net (called INSIDE the step body, i.e. only after demo.step's
  // caption hold) is exactly round 3's established failure mode: the scroll — and the ring it
  // gates — doesn't happen until after the hold, which can land past the cue's geometric
  // midpoint on a short cue, reading as "no ring at all" on the recording. Same instrumentation
  // ALSO explains Finding 4's mobile heading collision as a side effect of the SAME missing
  // hoist: at scroll=0 "Enter the July Major Draw" (DashboardGuestPanel's own H3) sits at
  // y=212, clear of the caption's y:[6,71] band — but once the highlight's internal scroll ran
  // (mid-body, minimal scrollIntoViewIfNeeded distance), the heading moved to y=47, squarely
  // inside that band. demo.smoothScrollTo's larger 35%-from-top glide (matching Beat 6, not a
  // bespoke offset) clears the heading much further (measured: scrolls to ~350px on mobile,
  // ~286px on desktop, pushing the heading to y<-127 on both — fully off-screen) while landing
  // streakCard comfortably inside the viewport on both viewports (no more of the 1-2px bottom-
  // edge clipping the minimal scrollIntoViewIfNeeded produced). One fix closes both findings.
  await demo.smoothScrollTo(streakCard);
  // Task-5 fix (Finding 2, desktop cue1): the round-4 fix above (comment block ending line
  // 145) only checked DashboardGuestPanel's own H3 ("Enter the {DRAW_NAME}") and confirmed
  // it clears the caption band on both viewports. It never checked the SECOND section that
  // also sits above streakCard — "What members get" (DashboardGuestPanel.tsx MEMBER_BENEFITS)
  // — whose first row is "Free entries into every major draw". Live-measured on
  // chromium-desktop (1280x720): under proof mode's real 35%-from-top glide the bullet lands
  // at y:[90.5, 110.5], overlapping the desktop caption's own fixed top:96 offset
  // (demo.ts showCaption); under this test's own normal-mode scroll (a plain
  // scrollIntoViewIfNeeded, less aggressive) it lands at y:[216.5, 236.5] — still overlapping
  // once the caption wraps past one line. Mobile does NOT have this defect: DashboardGuestPanel
  // is single-column on every viewport, but mobile's caption band is tiny (top:6, 13px font)
  // and clears this same bullet with room to spare — so this fix must not run there.
  //
  // The page-scroll trick Beat 11 uses below (push the offending text fully OFF-SCREEN) does
  // NOT fit here: live-measured, this guest-panel page is short enough (scrollHeight ~1045px
  // against a 720px viewport) that a normal-mode "push fully off-screen" correction gets
  // silently CLAMPED by the browser at the page's real scroll limit, before the bullet ever
  // clears the viewport — confirmed live (an uncapped attempt landed the bullet's bottom at
  // 88px, still on-screen, "in viewport" ratio 1). The fix needed is narrower: only clear the
  // bullet from the caption's fixed top:96 offset (a stable constant regardless of how many
  // lines this cue's own caption text wraps to, since the bullet only needs to sit ABOVE the
  // band's top — not below its bottom), which needs far less scroll room and IS available on
  // both the proof-mode and normal-mode starting positions measured above. Capped at the
  // page's own actual remaining scroll room (mirrors Beat 11's "never ask for more than is
  // really available" bound below) so a future, taller page can't silently under-deliver here
  // either.
  if (isDesktop) {
    const DESKTOP_CAPTION_TOP = 96; // demo.ts showCaption's own fixed desktop top offset
    const membersGetBullet = page.getByText(/Free entries into every major draw/i).first();
    const bulletBox = await membersGetBullet.boundingBox();
    if (bulletBox && bulletBox.y + bulletBox.height > DESKTOP_CAPTION_TOP) {
      const wanted = bulletBox.y + bulletBox.height - DESKTOP_CAPTION_TOP + 8; // clear the band's top, 8px margin
      const { scrollY, maxScrollY } = await page.evaluate(() => ({
        scrollY: window.scrollY,
        maxScrollY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      }));
      const capped = Math.min(wanted, Math.max(0, maxScrollY - scrollY));
      if (capped > 0) {
        await page.evaluate((delta) => window.scrollBy(0, delta), capped);
      }
    }
    const afterBox = await membersGetBullet.boundingBox();
    if (!afterBox) throw new Error("membersGetBullet unexpectedly detached after Beat 1's corrective scroll");
    expect(afterBox.y + afterBox.height).toBeLessThanOrEqual(DESKTOP_CAPTION_TOP);
  }

  await demo.step("Someone with an account but no membership sees what they're missing", async () => {
    // highlight is the FIRST statement — the page is already settled (scrolled above), so the
    // ring draws immediately at body start instead of racing the hold+scroll. The trailing
    // assertion is unaffected — it targets an unrelated locator inside the same, now-visible card.
    await demo.highlight(streakCard, "The full reward ladder — the reason to join");
    await expect(page.getByText(/Members only/i).first()).toBeVisible({ timeout: 20_000 });
  });

  // ── Beat 2 — one-time buyer ─────────────────────────────────────────────
  await setOneTimeHolder();
  await page.reload();
  await expect(page.getByText(/Members only/i).first()).toBeVisible({ timeout: 30_000 });
  // Task-4 fix (round 4, Finding 1): hoisted before demo.step — same mechanism and same
  // live-instrumented mobile evidence as Beat 1 above (streakCard sits below the fold at
  // scroll=0 in this stacked single-column state too; the member/onetime dashboard's aside
  // column renders AFTER the main column in DOM order on every viewport — desktop only
  // avoids scrolling because its lg:grid places that column beside the main one instead of
  // below it). Audited the whole journey for this same shape (round 4 brief's instruction to
  // check every beat, not just the ones a reviewer happened to flag) — every remaining
  // streakCard highlight below (Beats 3, 4, 5, 7, 8) gets the identical hoist for the same
  // proven reason; Beat 6 (the wallet) already had it from round 3.
  await demo.smoothScrollTo(streakCard);

  await demo.step("One-time buyers see it too — members-only", async () => {
    // Task-4 fix (Finding 3, round 1): shortened so the note fits at the desktop render
    // width — it's supplementary to the caption above, not a second caption.
    //
    // Task-4 fix (round 3, frame-audit): the CAPTION itself is also shortened here (was "A
    // one-time pack buyer sees it too — the ladder is members-only", 12 tokens counting the
    // em-dash — holdFor's own word-split counts it — for a 3.6s hold against a cue span of
    // only 7.3s: the hold alone ate essentially half the span, so the ring drew right at the
    // frame-audit's geometric midpoint or a hair past it, a coin flip a live render lost).
    // Live-measured (task-4, round 3): 12 tokens -> holdFor 3600ms against this cue's ~7.3s
    // span left under 70ms of margin before the midpoint; with the scroll now hoisted above,
    // the hold is no longer the only dead window either way — cutting it to 7 tokens (holdFor
    // 2100ms) still keeps a healthy margin.
    await demo.highlight(streakCard, "Locked — membership starts the streak");
  });

  // ── Beat 3 — day one ────────────────────────────────────────────────────
  // Task-4 fix (round 4, Finding 3): explicit streakEntries: 0 — Beat 2 now writes a real
  // one-time bucket (oneTime: 3, membership: 0). setStreak() only calls setStreakEntries
  // (which fully replaces entriesBySource) when opts.streakEntries is passed; without this,
  // Beat 2's bucket would bleed forward into this beat (a fresh active member showing
  // "Membership 0 / One-time 3" instead of the real 15-entry Tradie grant). Explicit here
  // restores the seeded baseline (membership: 15, streak: 0, oneTime dropped) — matches
  // e2e/seed/draw.ts and what this beat always rendered before Beat 2's fix existed.
  await setStreak(0, { streakEntries: 0 });
  await page.reload();
  await dismissSubscriptionExplainerIfItOpens();
  await expect(page.getByText(/New streak/i).first()).toBeVisible({ timeout: 30_000 });
  // Task-4 fix (round 4, Finding 1): hoisted — same proven reason as Beats 1-2 above.
  await demo.smoothScrollTo(streakCard);

  await demo.step("They join. Day one — the streak starts at zero", async () => {
    // highlight first — "New streak" was already asserted before this step opened, and the
    // scroll above already settled, so streakCard (and its "Fresh steel" copy) is already
    // rendered and in view.
    await demo.highlight(streakCard, "+100 free entries at their 2nd renewal");
    await expect(page.getByText(/Fresh steel/i).first()).toBeVisible({ timeout: 20_000 });
  });

  // ── Beat 4 — building ───────────────────────────────────────────────────
  // Task-4 fix (round 4, Finding 2): explicit streakEntries: 100. useStreakCelebration
  // (src/hooks/useStreakCelebration.ts) seeds its marker SILENTLY on the first-ever active-
  // member visit (Beat 3, lastSeen=null -> seeded to 0, no toast) — so THIS beat is the
  // SECOND active-member visit, and streakMonths crossing 0->3 crosses the Lv.2 rung
  // (verified against src/config/streakMilestones.ts: rungs at 2/4/6/8/10/12), firing the
  // "+100 free entries — Lv.2 milestone" celebration toast + in-card banner. Leaving the
  // entries bucket at its Beat-3 baseline (0) meant the toast claimed a grant the wallet
  // directly below didn't reflect (still 15, no Streak line) — same defect class as the
  // Beats 8/9/10 fix. At 3 renewals only Lv.2 (+100) has actually fired (3 < 4, so Lv.4 has
  // not), so the earned total is 100 — wallet reads 115 with a Streak line of 100.
  await setStreak(3, { streakEntries: 100 });
  await page.reload();
  await dismissSubscriptionExplainerIfItOpens();
  await expect(streakCard).toBeVisible({ timeout: 30_000 });
  // Task-4 fix (round 4, Finding 1): hoisted — same proven reason as Beats 1-3 above.
  await demo.smoothScrollTo(streakCard);

  await demo.step("Three renewals in — level 2 is banked, level 4 is next", async () => {
    // highlight first — streakCard (and its "+200 free entries" pill) is already visible
    // and in view, per the assertion + scroll above, before this step opened.
    await demo.highlight(streakCard, "One more renewal for +200 free entries");
    // The "next rung" reward pill renders TWICE (a persistent copy + a hover-reveal
    // copy hidden via CSS `hidden`, both real DOM text) — .first() avoids a strict-mode
    // violation, not a loosened assertion (both nodes carry the identical, correct text).
    await expect(page.getByText(/\+200 free entries/i).first()).toBeVisible({ timeout: 20_000 });
  });

  // ── Beat 5 — the payoff ─────────────────────────────────────────────────
  // Marker planted at 3 so the live counter of 4 crosses a rung and celebrates once.
  await seedCelebrationMarker(page, userId, 3);
  await setStreak(4, { streakEntries: 300 });
  await page.reload();
  await dismissSubscriptionExplainerIfItOpens();
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
  // Task-4 fix (round 4, Finding 1): hoisted — same proven reason as Beats 1-4 above.
  await demo.smoothScrollTo(streakCard);

  await demo.step("Their 4th renewal — 200 free entries, automatic", async () => {
    // highlight first — the regression guard + scroll above already proved streakCard is the
    // right, visible, in-view card before this step opened. The caption already says "200 free
    // entries, automatic"; the note just adds which draw (Finding 3: shortened so it fits at
    // the desktop render width, no longer repeating the entry count the caption already gave).
    //
    // Task-4 fix (round 3, frame-audit): caption shortened (was "...lands — 200 free
    // entries, granted automatically", 10 tokens, holdFor 3000ms) — same class of fix as
    // Beat 2 above, same live measurement method: this cue's ~6.6s span left only ~300ms of
    // margin before the geometric midpoint, and the frame-audit caught the ring not yet
    // drawn there. 8 tokens (holdFor 2400ms) restores ~900ms of margin.
    await demo.highlight(streakCard, `Straight into the ${DRAW_NAME}`);
    await expect(page.getByText(new RegExp(DRAW_NAME, "i")).first()).toBeVisible({ timeout: 20_000 });
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
  await dismissSubscriptionExplainerIfItOpens();
  await expect(wallet).toBeVisible({ timeout: 30_000 });
  // Task-4 fix (Finding 2, round 3): moved OUT of the step body and to BEFORE demo.step opens.
  // Diagnosed live (task-4, round 3): the ring genuinely draws — a beat-body dump showed
  // `ringExists: true` with the ring's rect pixel-identical to the wallet's own, fully inside
  // the viewport. The defect is timing, not resolution: demo.step paints the caption and holds
  // for `holdFor(title)` BEFORE running the body, so with the glide INSIDE the body (as this
  // beat used to have it), the human-paced multi-second smoothScrollTo only started AFTER that
  // hold — pushing the ring's actual draw well past the cue's geometric midpoint, which is
  // exactly where a frame-audit samples. Every other beat in this journey highlights a target
  // that's already on screen without scrolling (relying on demo.highlight's own
  // scrollIntoViewIfNeeded safety net); this is the one beat where the target isn't, so it's
  // the one that needs the settle to happen before the step (and its caption hold) starts.
  await demo.smoothScrollTo(wallet);

  await demo.step("Six renewals — 600 free entries banked", async () => {
    // highlight is the FIRST statement — the page is already settled (scrolled above), so the
    // ring draws immediately at body start instead of after a multi-second glide.
    //
    // Caption also shortened (round 3, frame-audit, same class of fix as Beats 2 and 5 above):
    // was "Six renewals in — 600 free entries banked from the streak alone" (12 tokens,
    // holdFor 3600ms) against a ~6.8s span — the hold ALONE already exceeded half the span
    // even with the scroll moved out of the body, which is why the ring still wasn't drawn
    // yet at the geometric midpoint on a live render. 7 tokens (holdFor 2100ms) restores real
    // margin.
    await demo.highlight(wallet, "600 free entries, on top of their monthly entries");
    await expect(wallet.getByText(/Streak/i).first()).toBeVisible({ timeout: 20_000 });
  });

  // ── Beat 7 — Founding ───────────────────────────────────────────────────
  await setStreak(12, { streakEntries: 2100 });
  await page.goto("/my-account");
  await dismissSubscriptionExplainerIfItOpens();
  await expect(page.getByText(/Founding member/i).first()).toBeVisible({ timeout: 30_000 });
  // Task-4 fix (round 4, Finding 1): hoisted — same proven reason as Beats 1-5 above. Round 3's
  // frame-audit already found the ring draws in good time on the render it checked, but the
  // round-4 instrumentation (mobile-chrome, normal mode) still measured streakCard partially
  // below the fold at scroll=0 here too (boxBefore.y=564 against an 839px viewport) — hoisting
  // removes the risk instead of relying on it staying lucky.
  await demo.smoothScrollTo(streakCard);

  await demo.step("Twelve renewals — the permanent Founding member badge", async () => {
    // Task-4 fix (Finding 3): shortened so the note fits at the desktop render width.
    await demo.highlight(streakCard, "The ladder repeats every year");
    // Task-4 fix (round 3, frame-audit): a DIFFERENT timing defect than Beats 2/5/6 above —
    // here the ring draws in good time (well before this cue's geometric midpoint, frame-
    // verified), but Beat 8's setup runs immediately once this step returns, and its
    // `page.goto("/my-account")` is a FULL navigation that wipes every injected overlay
    // (the ring included) — measured live: the ring was on screen for barely ~1s before that
    // navigation cleared it, so a frame-audit sampling this cue's geometric midpoint (which
    // `post.ts` deliberately extends to just before Beat 8's OWN step opens, so it always
    // includes that trailing setup work) landed on Beat 8's "Loading your dashboard" screen
    // instead. Same sanctioned fix already used at Beat 8 and the closing terms beat (demo.ts's
    // own contract: a short dwell after highlight is the correct tool once the ring itself is
    // proven to draw correctly) — held here, not there, because it's THIS step returning that
    // triggers the wipe.
    await page.waitForTimeout(1_500);
  });

  // ── Beat 8 — forgiving ──────────────────────────────────────────────────
  // Task-4 fix (round 2, wallet/medallion consistency): explicit streakEntries — at 7
  // renewals only rungs Lv.2/4/6 (+100/+200/+300 = 600) are earned; Lv.8 (+400, this
  // beat's own "pending" figure) hasn't fired. Without this, the wallet kept Beat 7's
  // 2,100 (the 12-renewal total) while the medallion read Level 7 — two contradictory
  // numbers in the same frame. See src/config/streakMilestones.ts for the ladder.
  await setPastDue(7, { streakEntries: 600 });
  await page.goto("/my-account");
  await dismissSubscriptionExplainerIfItOpens();
  await expect(page.getByText(/Payment issue/i).first()).toBeVisible({ timeout: 30_000 });
  // Task-4 fix (Finding 3, round 3): past-due /my-account auto-opens a SECOND overlay the
  // explainer-dismiss helper above doesn't know about — RenewalFailedModal
  // (src/components/modals/UnifiedModalManager.tsx: an effect gated on
  // `hasFailedRenewal(userData)` fires `requestModal("renewal-failed", true)` as soon as
  // account data loads on any /my-account route). Its Shell (src/components/modals/
  // RenewalFailedModal/Shell.tsx) is a `position:fixed inset-0` dialog with a near-opaque
  // `bg-black/85 backdrop-blur-md` backdrop at `zIndex:80` — nowhere near
  // demo.ts's ring (`z-index:2147483646`), so the ring itself always paints on top, but
  // `streakCard`'s OWN boundingBox() is still geometrically correct underneath: what a
  // viewer actually SEES inside that ring's cutout is whatever sits at z:80 (the modal),
  // not the hidden card. Verified live (task-4, round 3): a `.filter({hasText:
  // /LEVEL|FOUNDING/i})` diagnostic dump at this exact point found exactly ONE matching
  // `<section>` on the page — the real streak card, no ancestor-wrapper false match — so
  // the locator was never the problem; the modal sitting on top of a correctly-targeted-but-
  // hidden card is. Mirrors `dismissSubscriptionExplainerIfItOpens` above (same
  // Escape-key-closes-it shape, confirmed via Shell.tsx's own `onEscape` listener) so the
  // underlying card is what the camera actually sees before the ring is ever drawn.
  //
  // ONE checkpoint, placed AFTER the "Payment issue" assertion above (round 3, second pass):
  // an earlier version of this fix checked twice (once right after `goto`, once here), mirroring
  // dismissSubscriptionExplainerIfItOpens's own two-checkpoint shape — but that helper's SECOND
  // call is near-free because it fast-skips on an already-seen localStorage key.
  // RenewalFailedModal has no such flag, so a second blind `waitFor({state:"visible"})` after an
  // already-successful first dismissal just burns its whole timeout waiting for a dialog that
  // will never reopen — measured live, that alone added ~4s of dead setup time between Beat 7
  // and Beat 8, which is exactly what pushed Beat 8's `page.goto` (and the "Loading your
  // dashboard" screen it shows) out far enough to still be on screen at Beat 7's OWN
  // geometric midpoint (that cue's declared span always runs right up until Beat 8's step
  // opens). "Payment issue" and this modal's own open-effect both key off the same `userData`
  // fetch, so by the time that text is visible the effect has already had every chance to
  // fire — ONE check here is enough; it doesn't need to also be racing anything before it.
  const dialog = page.getByRole("dialog");
  const dialogOpened = await dialog
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (dialogOpened) {
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  }
  // Task-4 fix (round 4, Finding 1): hoisted — same proven reason as Beats 1-5/7 above. Placed
  // after the RenewalFailedModal dismissal, not before — the card's boundingBox() is correct
  // even while the modal covers it (see comment above), but scrolling only matters once there's
  // nothing left to interrupt it for the rest of the beat.
  await demo.smoothScrollTo(streakCard);

  await demo.step("A failed payment doesn't burn the streak — fixing the card carries it on", async () => {
    // highlight first — streakCard is already on screen and in view (asserted + scrolled
    // above). Finding 3 (round 1): note shortened so it fits at the desktop render width.
    await demo.highlight(streakCard, "Nothing lost");
    // This caption is one of the longest in the journey (holdFor ≈ 4.2s), which pushed the
    // ring's actual draw time past this cue's own geometric midpoint in a proof-mode
    // frame-audit (verified: ring landed ~0.4s after the midpoint) — a short explicit dwell
    // after highlight is the sanctioned fix (demo.ts's own contract), cheap here since it
    // only delays the (already-passing) trailing assertion below.
    await page.waitForTimeout(1_500);
    // "streak's safe" sits inside a <b> nested in the footer <p> — both contain the
    // matching substring, so .first() resolves the strict-mode ambiguity.
    await expect(page.getByText(/streak.{0,10}s safe/i).first()).toBeVisible({ timeout: 20_000 });
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
  //
  // `dismissSubscriptionExplainerIfItOpens()` here too, BEFORE the "Manage membership" wait
  // — see the helper's own comment for the root cause (a lost race on the explainer's
  // first-ever `next/dynamic` chunk load re-arming its 2.5s auto-open timer on every later
  // navigation). This `goto` is exactly such a navigation. Runs entirely before either
  // beat's `demo.step` opens (never inside one — a caption must not hold over a modal being
  // dismissed, docs/e2e/proof-mode.md round 4).
  const openManageSheetAndGetCancelButton = async () => {
    await page.goto("/my-account?open=subscription");
    await dismissSubscriptionExplainerIfItOpens();
    await expect(page.getByText("Manage membership")).toBeVisible({ timeout: 30_000 });
    const cancelButton = page.getByRole("button", { name: /cancel membership/i });
    await expect(cancelButton).toBeVisible({ timeout: 20_000 });
    return cancelButton;
  };

  // Reason step: pick "Too expensive right now" and continue — identical in both beats,
  // only the SCREEN it reveals afterward (and whether that reveal happens before or inside
  // the next demo.step) differs per beat.
  //
  // Second `dismissSubscriptionExplainerIfItOpens()` checkpoint: `openManageSheetAndGetCancelButton()`'s
  // own dismissal above is a fixed window starting right after `page.goto` — but the
  // explainer's 2.5s timer only starts once `accountData` has loaded (page-client.tsx), so
  // on a slower load its headline can still land AFTER that window closes. By the time we
  // reach THIS point, `cancelButton.click()` + its own "what's making you leave" wait + the
  // reason step's render have already consumed several more seconds since that `goto` —
  // comfortably past the explainer's 2.5s timer either way — so re-checking here is what
  // actually closes the race, not just moving it later. Near-free once already dismissed
  // (the helper's own localStorage fast-skip returns immediately — no #sem-headline wait at
  // all by this point in the journey); load-bearing on the rare run where it isn't.
  //
  // Explicit `{ timeout: 10_000 }` on both clicks: playwright.config.ts sets no
  // `actionTimeout`, so an actionability wait with no bound never expires — a click on an
  // element that's covered (the explainer bug above) or never becomes actionable hangs to
  // the whole test's timeout with no useful error (docs/e2e/proof-mode.md). Bounding each
  // click here means a future regression fails in ~10s with a clear "intercepts pointer
  // events" / "not enabled" message at this exact line, not a 20-minute silent hang.
  // `.check()` on the radio (not `.click()` on its label) is the correct Playwright
  // primitive for a checkbox/radio — it asserts the resulting checked state as part of its
  // own actionability wait, so `canContinue` (Step1Reason.tsx) is provably true before the
  // Continue click ever attempts to fire.
  const chooseTooExpensiveAndContinue = async () => {
    await dismissSubscriptionExplainerIfItOpens();
    const reasonRadio = page.getByRole("radio", { name: /too expensive/i });
    await reasonRadio.check({ timeout: 10_000 });
    await expect(reasonRadio).toBeChecked({ timeout: 5_000 });
    await page.getByRole("button", { name: /continue|next/i }).first().click({ timeout: 10_000 });
  };

  // ── Beat 9 — the save ───────────────────────────────────────────────────
  // Task-4 fix (round 2): explicit streakEntries, not left to inherit Beat 8's residual
  // value. It's the same 7-renewal total (600 — see Beat 8's comment above) so this was
  // already numerically correct by coincidence, but stating it here removes the implicit
  // dependency on Beat 8 leaving the right number behind. Not screen-visible either way —
  // StepStakes (src/components/modals/CancellationFlowModal/StepStakes.tsx) computes its
  // "+400 free entries" / ladder copy from state.streakMonths via nextStreakMilestone,
  // never from the persisted entries bucket, and the dashboard wallet/medallion sit behind
  // ManageSheet + CancellationFlowModal's full-viewport overlay for the rest of this beat.
  await setStreak(7, { streakEntries: 600 });
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
    // Task-4 fix (round 4, Finding 5): ring moved off the generic "Keep my streak" CTA onto the
    // specific bullet the caption is actually about. StepStakes.tsx (lossFraming branch) renders
    // three FeatureRow bullets in its ValueCard; the third is "Rather take a break? Pausing
    // freezes your streak — it carries straight on when you're back" — the exact supporting line
    // for this caption. `getByText` on "Pausing freezes your streak" resolves to the <b> (its own
    // text is fully self-contained there, per Playwright's smallest-containing-element rule);
    // walking up to its nearest ancestor <div> lands on FeatureRow's own row div (icon + full
    // sentence — verified against src/components/modals/CancellationFlowModal/primitives.tsx:
    // FeatureRow renders `<div><span>icon</span><span>{children}</span></div>`, so
    // `ancestor::div[1]` from the <b> skips the intermediate <span> and resolves to that outer
    // div), giving a ring around the whole bullet rather than just the bolded phrase. This is
    // the same stakes screen the previous step already asserted onto ("+400 free entries"), no
    // click happened in between, so the bullet is already rendered and in view.
    const pauseBullet = page.getByText(/Pausing freezes your streak/i).first().locator("xpath=ancestor::div[1]");
    await demo.highlight(pauseBullet, "Freezes it — doesn't end it");
    await expect(page.getByText(/Pausing freezes your streak/i).first()).toBeVisible({ timeout: 20_000 });
    // Task-5 fix (Finding 1, desktop cue-11 spinner) — root cause, established via live
    // instrumentation (normal mode, no proof): per e2e/proof/post.ts, a cue's declared
    // on-screen SPAN runs from its own demo.step call to the NEXT cue's demo.step call
    // minus 200ms — it always includes whatever setup work the FOLLOWING beat performs
    // before its own step opens (the same mechanism already fixed at Beats 7/8 above, and
    // already measured for this exact beat boundary in task-4-rerender-report.md: "cue 11 →
    // 12's span... 10.5s (final verified run)... Beat 10's real, necessary work"). Beat 10's
    // own setup (below) re-navigates to `/my-account?open=subscription` — a FULL page
    // navigation that re-mounts the dashboard shell and briefly shows the ROOT
    // DashboardLoader ("Loading your dashboard", src/components/loading/DashboardLoader.tsx)
    // before the reopened ManageSheet/CancellationFlowModal mounts — then re-clicks Cancel,
    // re-selects a reason, and waits for the forward-framing stakes screen. Live-measured
    // (normal mode, chromium-desktop, no slowMo): that setup alone took 4.5-4.9s wall-clock,
    // and a `waitForSelector` watcher confirmed the DashboardLoader spinner text DID appear
    // during it. This cue's own on-screen "good" duration (the 4.2s caption hold + the
    // highlight/assert above) is roughly the SAME order of magnitude as that trailing setup
    // even before accounting for proof mode's slowMo:200 on every click/check in Beat 10's
    // re-interaction (which only lengthens the trailing setup further) — so a
    // representative sample within cue 11's full declared span has a real chance of landing
    // in Beat 10's reload/spinner window instead of in this beat's own correct content,
    // exactly matching the reported desktop capture (a bare loading spinner, nothing related
    // to the "Pausing freezes..." caption). Fix: extend this beat's own on-screen "good" time
    // the SAME sanctioned way Beats 7 and 8 already do in this file (a short explicit dwell
    // after highlight, once the ring itself is proven to draw correctly — demo.ts's own
    // contract) so the good fraction of cue 11's span comfortably exceeds Beat 10's trailing
    // setup instead of trailing it. Sized larger than Beats 7/8's 1.5s because this trailing
    // gap is a full re-navigation + re-interaction (reopen sheet, click Cancel, re-pick a
    // reason), not just a single reload.
    await page.waitForTimeout(3_500);
  });

  // ── Beat 10 — forward framing ───────────────────────────────────────────
  // The OTHER stakes variant: under 2 renewals there is no streak to lose, so the
  // screen pivots to the ladder ahead (StepStakes.tsx — lossFraming = streak >= 2). Same
  // ManageSheet → Cancel → reason → stakes path as Beat 9; the earlier flow never
  // completed an actual cancellation, so the subscription is still active to re-enter.
  // Task-4 fix (round 2): explicit streakEntries=0 — without it the bucket would keep
  // Beat 9's 600 while streakMonths dropped to 1 (no rung earned yet at 1 renewal, the
  // first fires at Lv.2). Same not-currently-screen-visible reasoning as Beat 9's comment
  // above (StepStakes reads streakMonths only; the overlay stack covers the dashboard),
  // but this one IS a genuine data mismatch, not a coincidentally-correct inherited value.
  await setStreak(1, { streakEntries: 0 });
  const cancelButtonAgain = await openManageSheetAndGetCancelButton();
  await cancelButtonAgain.click();
  await expect(page.getByText(/what.{0,3}s making you leave/i).first()).toBeVisible({ timeout: 20_000 });
  await chooseTooExpensiveAndContinue();
  await expect(page.getByText(/just.{0,10}getting started/i).first()).toBeVisible({ timeout: 20_000 });
  // Task-4 fix (round 4, Finding 4): settle wait before demo.step opens. StepStakes' forward-
  // framing screen enters via a Framer Motion transition (MODAL_DURATION_ENTER_S = 0.26s,
  // src/utils/motion/modalPresets.ts — animates opacity + y, so it's a transform, not a layout
  // change: getBoundingClientRect() reflects wherever the element is mid-glide). Playwright's
  // `toBeVisible()` above can resolve as soon as the transition starts (non-zero opacity + a
  // box), not once it's settled — instrumented live: the Headline's measured y varied by ~32px
  // between two otherwise-identical runs (134 vs 166), consistent with catching it at different
  // points in that glide. The caption paints immediately once demo.step opens and holds for
  // several seconds, so if it happens to paint mid-transition it can end up landing on top of
  // wherever the heading is passing through — a genuine, if intermittent, collision, not
  // something a static one-time offset could fix. 400ms (comfortably past the 260ms transition)
  // guarantees the page is geometrically final before the caption ever appears.
  await page.waitForTimeout(400);
  // Task-5 fix (Finding 2, desktop cue-12 heading collision) — the 400ms settle wait above
  // (round 4) fixed WHICH of two candidate positions this transition lands on, but not that
  // BOTH candidates sit dangerously close to (or inside) demo.ts's fixed desktop caption band.
  // Live-measured (normal mode, chromium-desktop, post-settle): the forward-framing Headline
  // ("Your streak is just / getting started") renders at y=166.2 — the round-4 comment above
  // already recorded a 134-166 spread across runs — while THIS cue's own caption band is
  // y:[96, 166.375]. That is a genuine steady-state geometry collision, not just leftover
  // transition jitter: StepStakes' forward-framing ValueCard lists all 6 STREAK_MILESTONES
  // rungs (vs. the loss-framing branch's 3 FeatureRows), making this variant of the modal tall
  // enough to hit ModalContainer's `max-h-[88svh]` cap on chromium-desktop's short 720px
  // viewport — so it renders near the TOP of the (centered, capped) dialog, right where the
  // desktop caption is pinned. The loss-framing beats (cues 9-11 above) don't have this
  // problem: same live probe found their (shorter) Headline at y=191.6, clear of even cue 11's
  // own 2-line caption band (bottom 166.4) by ~25px — confirming this is specific to the
  // forward-framing screen's height, not every StepStakes beat. Because CancellationFlowModal
  // is `position:fixed` (ModalContainer.tsx) and centers independently of page scroll, none of
  // the page-scroll corrections used elsewhere in this file (Beats 1, 11) can reach it. Fixed
  // in e2e/fixtures/demo.ts instead (see its own comment): showCaption now measures a REAL,
  // rendered overlap against any on-screen `[role="dialog"]` heading and falls back to the
  // already-proven compact/mobile-style caption only when one is detected — verified via the
  // same live probe that cues 9-11's non-overlapping headline does NOT trigger the fallback,
  // and mobile (always on the compact style already) takes an entirely different code path.
  await demo.step("A newer member sees the other side of it — the ladder ahead, not the loss", async () => {
    // highlight first — "just...getting started" was already asserted (and the transition
    // settled) before this step opened, on the same screen that also renders "2nd renewal".
    await demo.highlight(page.getByText(/2nd renewal/i).first(), "One renewal from their first +100");
    await expect(page.getByText(/ONE renewal away/i).first()).toBeVisible({ timeout: 20_000 });
  });

  // ── Beat 11 — the legals ────────────────────────────────────────────────
  await page.goto("/terms");
  const clause = page.getByText(/Additional entries may be offered/i).first();
  await expect(clause).toBeVisible({ timeout: 30_000 });
  await demo.smoothScrollTo(clause);

  // Task-4 fix (Finding 4): demo.ts's shared smoothScrollTo (not modified here — it's generic
  // infra every @demo spec uses) puts `clause` on screen via a fixed ~35%-from-top offset, but
  // has no idea §5.2 sits directly below it on THIS page: "Mini Draws have a capped entry
  // threshold based solely on Mini Pack entries sold" (src/app/(site)/terms/page.tsx) directly
  // contradicts this beat's own caption ("free entries, never sold"). The owner decided NOT to
  // change the live terms copy, so the SHOT is re-framed instead: after the human-paced glide
  // settles, nudge the scroll further up (a plain instant scrollBy — the viewer already watched
  // the page glide once, a second glide would be redundant motion) just far enough that §5.2's
  // "entries sold" bullet clears the bottom edge, while keeping `clause` on screen with a
  // margin. Computed from each locator's OWN current bounding box, not a hardcoded pixel
  // guess, so it holds under both the mobile and desktop viewport heights this journey renders
  // under. Grepped unique across the whole terms page (src/app/(site)/terms/page.tsx) — "entries
  // sold" appears exactly once, in §5.2 — so `.first()` cannot resolve to anything else.
  // Round 2 (live proof-mode evidence): a flat 24px top margin left `clause` sitting right
  // under demo.ts's own caption pill, which on mobile is pinned to `top:6px` (showCaption,
  // narrow-viewport branch) and sits at a HIGHER z-index than the highlight ring
  // (2147483647 vs 2147483646) — cue-midpoint frames showed the ring simply not visible,
  // painted but covered by the caption's own near-opaque background. Round 2's fix (a flat
  // `topMargin = 130` cap on the correction) cleared mobile but left desktop broken — this is
  // the HARD LEGAL GATE (task-4 Finding 1, round 3).
  //
  // Root cause, live-measured (not guessed): on chromium-desktop's 1280x720 viewport (the
  // proof-mode video then downscales that to the 800x450 a frame-audit sees — Playwright's
  // default recordVideo size fits the viewport into 800x800 preserving aspect ratio, verified
  // 1280x720 -> 800x450 and 412x839 -> 392x800, matching exactly what round 2's audit saw at
  // each viewport), the initial 35%-from-top glide leaves `clause` only ~252px down the frame
  // (a short viewport has little headroom above the fold to begin with) — so the OLD cap
  // (`clauseBox.y - 130 = 122`) allowed only 122px of further correction where 280px was
  // actually needed, a ~158px shortfall that left "entries sold" fully on screen. The cap
  // can't protect what its own comment claims either way: `scrollBy(0, -delta)` only ever
  // moves `clause` FURTHER from the top as `delta` grows (confirmed: clause ended up at
  // y=532 on desktop under the full, uncapped correction below — nowhere near the caption).
  // On mobile the same cap was already a no-op (164 > the 159.5 actually wanted), which is
  // why mobile read as "already fixed" while desktop silently wasn't — same formula, two very
  // different outcomes, exactly the "same offset, different viewport" trap the brief named.
  //
  // Fix: target the WHOLE §5.2 heading (a stronger bar than just its "entries sold" bullet —
  // "5.2 Entry Limits:" is grepped unique on the page, src/app/(site)/terms/page.tsx), and
  // drop the topMargin cap in favour of the one bound that's actually real — never ask for
  // more upward scroll than the page has above its current position (scrollY can't go
  // negative; the browser would just clamp, silently under-delivering the correction again).
  const soldClause = page.getByText(/entries sold/i).first();
  const sectionHeading = page.getByText(/5\.2 Entry Limits/i).first();
  const [headingBox, currentScrollY] = await Promise.all([
    sectionHeading.boundingBox(),
    page.evaluate(() => window.scrollY),
  ]);
  const viewport = page.viewportSize();
  if (headingBox && viewport && headingBox.y < viewport.height) {
    const bottomMargin = 24;
    const wanted = viewport.height - headingBox.y + bottomMargin;
    const capped = Math.min(wanted, currentScrollY);
    if (capped > 0) {
      await page.evaluate((delta) => window.scrollBy(0, -delta), capped);
    }
  }
  // Regression guard: whatever the correction above computed, the legally-sensitive "sold"
  // wording must be verifiably off-screen before this beat's own caption asserts "never
  // sold" on camera — a hard assertion, not just a frame-audit hope.
  await expect(soldClause).not.toBeInViewport();

  await demo.step("And it's covered in the terms — free entries, never sold", async () => {
    await demo.highlight(clause, "Section 5.1 — additional free entries");
    // This is the CLOSING beat — unlike every earlier one, its cue span isn't padded by a
    // following beat's setup work (there is no Beat 12), so it's just hold+body, and this
    // caption's hold alone (~3.3s) already eats most of that short span. A proof-mode
    // frame-audit confirmed the ring draws correctly (the raw end-of-step screenshot shows
    // it cleanly) but not until near the very end of the cue — after its geometric midpoint.
    // A held final frame is also just the right way to end a demo video, so this dwell is
    // both the fix and the right call: let the last, legally-load-bearing shot linger.
    await page.waitForTimeout(4_000);
  });
}

test.describe("Membership Streak demo @demo", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");
  test.use({ storageState: MEMBER_STATE });
  // Proof mode holds every caption (holdFor: max(1800, 300×words) ms) BEFORE running its
  // body AND adds slowMo:200 to every action, so a recording of this 12-beat journey runs
  // several times longer than a normal pass. Measured (task-4-fix-report.md): the
  // narration sidecar's own cues show beats 1-9 recording in 65s. 1_200_000 (20 minutes)
  // was never real headroom for that — it was purely masking the explainer-modal click
  // hang fixed in this same task, and cost two full render cycles before that hang
  // surfaced. 300_000 (5 minutes) gives ~2x margin over the full 11-beat journey (beats
  // 1-9 at 65s, plus beats 10-11's own captions/holds and the two explainer-dismiss
  // retries `openManageSheetAndGetCancelButton` now performs) while still failing in
  // minutes, not tens of minutes, if a real hang regresses. Same 300s budget as normal
  // mode below (proof mode's slowdown is bounded and known, not open-ended, so it doesn't
  // need a separate, larger number) — one constant covers both.
  test.setTimeout(300_000);

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
