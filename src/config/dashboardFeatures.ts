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
  /** AI support assistant ("Ask Cobber") — Support overlay sub-project. */
  cobberSupport: false,
  /** Loyalty milestone-progress bars — no customer-facing milestone-progress read yet. */
  milestoneProgress: false,
  /** Personal "your wins" history — only a global winners endpoint exists today. */
  personalWins: false,
  /** Full purchase history — only the last-10 `recentOrders` are returned today. */
  orderHistory: false,
} as const;

export type DashboardFeature = keyof typeof DASHBOARD_FEATURES;

/** Whether a coming-soon dashboard feature is enabled. */
export const isDashboardFeatureOn = (feature: DashboardFeature): boolean =>
  DASHBOARD_FEATURES[feature];
