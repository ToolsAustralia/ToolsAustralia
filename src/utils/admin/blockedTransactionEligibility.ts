import type { EligibilityKind, EligibilityPreview } from "@/services/allowlist/types";

/**
 * Maps a blocked-transaction row's `(alreadyAllowlisted, preview)` pair to a
 * single `EligibilityKind`. The badge in the admin table uses this; the
 * `listBlocked` post-join filter uses this. Keeping one mapper guarantees
 * the filter and the badge can never disagree.
 */
export function computeEligibilityKind(args: {
  alreadyAllowlisted: boolean;
  preview: EligibilityPreview;
}): EligibilityKind {
  if (args.alreadyAllowlisted) return "already_allowlisted";
  if (args.preview.eligible) return "auto_eligible";
  if (args.preview.reason === "filter_fraud_signal") return "fraud_signal";
  if (args.preview.reason === "filter_permanent_issue") return "permanent_issue";
  return "not_member";
}
