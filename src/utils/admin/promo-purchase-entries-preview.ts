import { getPackageById, type StaticMembershipPackage } from "@/data/membershipPackages";
import { miniDrawPackages, type MiniDrawPackage } from "@/data/miniDrawPackages";

export interface PromoMultiplierSnapshot {
  membershipPackages: number;
  oneTimePackages: number;
  miniPackages: number;
}

export interface PreviewRow {
  packageId: string;
  displayName: string;
  baseEntries: number;
  multipliedEntries: number;
}

function baseEntriesFor(pkg: StaticMembershipPackage): number {
  return pkg.type === "subscription"
    ? (pkg.entriesPerMonth ?? 0)
    : (pkg.totalEntries ?? 0);
}

function rowFromMembership(id: string, mult: number): PreviewRow | null {
  const pkg = getPackageById(id);
  if (!pkg) return null;
  const base = baseEntriesFor(pkg);
  return {
    packageId: id,
    displayName: pkg.name,
    baseEntries: base,
    multipliedEntries: base * mult,
  };
}

function rowFromMini(pkg: MiniDrawPackage, mult: number): PreviewRow {
  return {
    packageId: pkg._id,
    displayName: pkg.displayName ?? pkg.name,
    baseEntries: pkg.entries,
    multipliedEntries: pkg.entries * mult,
  };
}

const SUBSCRIPTION_IDS = [
  "tradie-subscription",
  "foreman-subscription",
  "boss-subscription",
] as const;

const REGULAR_ONE_TIME_IDS = [
  "apprentice-pack",
  "tradie-pack",
  "foreman-pack",
  "boss-pack",
  "power-pack",
  "vip-pack",
] as const;

const ADDITIONAL_ONE_TIME_IDS = [
  "additional-tradie-pack",
  "additional-foreman-pack",
  "additional-boss-pack",
  "additional-power-pack",
  "additional-vip-pack",
] as const;

/**
 * Computes the live preview rows for a promo configuration.
 * Each section uses the appropriate multiplier from the snapshot.
 *
 * - membership: subscription packs (Tradie, Foreman, Boss)
 * - oneTime: regular one-time packs + additional (member-only) one-time packs
 * - mini: active mini draw packages (packs 1–3 + additional-*-pack-mini variants)
 */
export function getPromoPreviewRows(snapshot: PromoMultiplierSnapshot): {
  membership: PreviewRow[];
  oneTime: PreviewRow[];
  mini: PreviewRow[];
} {
  return {
    membership: SUBSCRIPTION_IDS.map((id) =>
      rowFromMembership(id, snapshot.membershipPackages)
    ).filter((r): r is PreviewRow => r !== null),

    oneTime: [...REGULAR_ONE_TIME_IDS, ...ADDITIONAL_ONE_TIME_IDS]
      .map((id) => rowFromMembership(id, snapshot.oneTimePackages))
      .filter((r): r is PreviewRow => r !== null),

    mini: miniDrawPackages
      .filter((p) => p.isActive)
      .map((p) => rowFromMini(p, snapshot.miniPackages)),
  };
}
