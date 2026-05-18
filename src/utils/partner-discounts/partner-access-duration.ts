/**
 * Human label for a package's partner-discount access duration.
 *
 * Subscriptions are lifecycle-gated (access lasts while the membership is active),
 * so they never show a fixed day/hour count. One-time / mini / additional packs
 * keep their concrete window.
 */
export function getPartnerAccessDurationLabel(opts: {
  isSubscription: boolean;
  days?: number | null;
  hours?: number | null;
}): { short: string; long: string } | null {
  if (opts.isSubscription) {
    return { short: "While active", long: "Partner access while your membership is active" };
  }
  const hours = opts.hours ?? 0;
  const days = opts.days ?? 0;
  if (days >= 1) {
    const d = Math.round(days);
    return { short: `${d} ${d === 1 ? "day" : "days"}`, long: `${d} ${d === 1 ? "day" : "days"} of partner access` };
  }
  if (hours >= 1) {
    const h = Math.round(hours);
    return { short: `${h} ${h === 1 ? "hour" : "hours"}`, long: `${h} ${h === 1 ? "hour" : "hours"} of partner access` };
  }
  return null; // no partner access window
}
