import DashboardLoader from "@/components/loading/DashboardLoader";

/**
 * Route-level loading UI for every `/promotions` page — the SAME branded loader the
 * member / admin / affiliate dashboards use, rather than a blank frame while the RSC
 * payload arrives.
 *
 * Sitting at the `promotions` segment means it covers the showroom AND its children
 * (`[slug]`, and the per-toolset routes), including navigation BETWEEN them.
 *
 * An explicit label is required: with none, `DashboardLoader` cycles its
 * dashboard-flavoured lines ("Counting your entries"), which read as nonsense to a
 * visitor arriving from an ad. Theme follows `html.dark`, so it matches whatever the
 * promotions guest theme toggle is set to.
 */
export default function PromotionsLoading() {
  return <DashboardLoader label="Loading the giveaway…" />;
}
