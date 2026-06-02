/**
 * Map a membership package id to its `brand-tier` hex for admin overview UI
 * (donut segments, KPI breakdown dots). Uses the brand-tier Tailwind tokens
 * (tradie → makita teal, foreman → dewalt yellow, boss → red) so the admin
 * surfaces stay faithful to the design (spec D4). Falls back to neutral slate.
 */
export function tierColorByPackageId(packageId: string): string {
  if (packageId.includes("tradie")) return "#00c2ed"; // makita teal
  if (packageId.includes("foreman")) return "#ffd200"; // dewalt yellow
  if (packageId.includes("boss")) return "#ee0000"; // boss red
  return "#94a3b8"; // neutral slate fallback
}
