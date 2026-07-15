/**
 * Dashboard feature-visibility switches.
 *
 * Coming-soon UI is fully built in the codebase but mounted behind these
 * switches so it does not render for users yet. Flip one to `true` (in a later
 * session, once the backing data/endpoint lands) to surface the finished UI.
 *
 * Keep OFF by default. This is a small visibility map, NOT flag infrastructure —
 * see docs/config-and-data/ and the spec
 * docs/superpowers/specs/2026-07-02-user-dashboard-revamp-foundation-home-design.md.
 */
export const DASHBOARD_FEATURES = {
  /** AI support assistant ("Ask Cobber") — Support overlay sub-project. LIVE: the
   *  dashboard "Start a chat" card opens the Cobber support-chat panel
   *  (SupportChatWidget). On /my-account the floating bubble is suppressed so this
   *  card is the single Cobber entry point. */
  cobberSupport: true,
  /** Loyalty milestone-progress bars — BUILT, dark until streak launch: driven by
   *  the real streak counter (subscription.streakMonths) + the single MILESTONES
   *  config (streakMilestones.ts). Flip with loyaltyStreak (launch runbook step 4). */
  milestoneProgress: false,
  /** Personal "your wins" history — only a global winners endpoint exists today. */
  personalWins: false,
  /** Full purchase history — only the last-10 `recentOrders` are returned today. */
  orderHistory: false,
  /** Loyalty streak card — BUILT, dark until streak launch: the Membership Streak
   *  medallion card (Build Kit, claudeDesign/Membership milestone streak design),
   *  real counter + real ladder. MUST stay false until reward grants are ACTIVE:
   *  the card/toast promise "+N free entries, automatic", so showing it while the
   *  rungs are still `isActive:false` asserts grants that never happen — and any
   *  rung crossed during such a window would be marker-stamped at seed time and
   *  never paid. Launch runbook (in order, after this branch deploys):
   *    1. npx tsx scripts/backfill-membership-streaks.ts --live --roundup-incomplete
   *    2. npm run seed:streak-rewards            (index + rungs dark + markers)
   *    3. npx tsx scripts/seed-streak-milestone-rewards.ts --live --activate
   *    4. flip loyaltyStreak + milestoneProgress to true (this file) and deploy.
   *  (To preview locally, flip to true in your working copy only.) */
  loyaltyStreak: false,
} as const;

export type DashboardFeature = keyof typeof DASHBOARD_FEATURES;

/** Whether a coming-soon dashboard feature is enabled. */
export const isDashboardFeatureOn = (feature: DashboardFeature): boolean =>
  DASHBOARD_FEATURES[feature];
