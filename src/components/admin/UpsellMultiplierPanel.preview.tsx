"use client";

import { upsellPackages } from "@/data/upsellPackages";
import { getPackageById } from "@/data/membershipPackages";

interface Props {
  /** Admin-selected upsell category multipliers (in-form values). */
  membership: number;
  oneTime: number;
  additional: number;
  /** Active promo multipliers per category. `null` means no active promo for that category. */
  activeMembershipPromo: number | null;
  activeOneTimePromo: number | null;
  activeMiniPromo: number | null;
}

/**
 * Universal upsell entry formula (stacking):
 *   upsellEntries = activePromo × upsellCategoryMultiplier × baseEntries
 *
 * Notes:
 *   - When no active promo for a category, treat the promo factor as 1×.
 *   - Mini upsells: category multiplier is fixed at 1, so result = activePromo × base.
 *   - Additional upsells: a subscriber's purchase routes through the membership-packages
 *     promo (see getEffectivePromoType). Preview uses the membership promo here. An
 *     entrant (no subscription) would instead see the one-time promo — flagged below.
 */
function stackedEntries(base: number | null, promo: number | null, categoryMult: number): number | null {
  if (base == null) return null;
  const p = promo == null || !Number.isFinite(promo) || promo < 1 ? 1 : promo;
  return p * categoryMult * base;
}

function getBaseEntries(packageId: string): number | null {
  const pkg = getPackageById(packageId);
  if (!pkg) return null;
  if (pkg.type === "subscription") return pkg.entriesPerMonth ?? null;
  return pkg.totalEntries ?? null;
}

// Mini pack static data (fixed, no admin knob — but stacks with active mini promo)
const MINI_ROWS: { trigger: string; upsellName: string; entries: number; price: number }[] = [
  { trigger: "Mini Pack 1",         upsellName: "Mini Pack 1",   entries: 1,   price: 0.5 },
  { trigger: "Mini Pack 2",         upsellName: "Mini Pack 2",   entries: 5,   price: 2.5 },
  { trigger: "Mini Pack 3",         upsellName: "Mini Pack 3",   entries: 10,  price: 5 },
  { trigger: "Tradie Pack (Mini)",  upsellName: "Tradie Pack",   entries: 25,  price: 12.5 },
  { trigger: "Foreman Pack (Mini)", upsellName: "Foreman Pack",  entries: 50,  price: 25 },
  { trigger: "Boss Pack (Mini)",    upsellName: "Boss Pack",     entries: 125, price: 62.5 },
  { trigger: "Power Pack (Mini)",   upsellName: "Power Pack",    entries: 250, price: 125 },
  { trigger: "VIP Pack (Mini)",     upsellName: "VIP Pack",      entries: 500, price: 250 },
];

function HeaderCell({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`px-3 py-2 font-medium text-slate-600 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function PreviewTable({
  title,
  subtitle,
  categoryKey,
  multiplier,
  activePromo,
}: {
  title: string;
  subtitle?: string;
  categoryKey: "membership" | "one-time" | "additional";
  multiplier: number;
  activePromo: number | null;
}) {
  const records = upsellPackages.filter((p) => p.upsellCategory === categoryKey);
  const effective = activePromo && activePromo > 1 ? activePromo * multiplier : multiplier;
  const stackingLabel = activePromo && activePromo > 1
    ? `${activePromo}× promo × ${multiplier}× = ${effective}× effective`
    : `${multiplier}× (no active promo)`;

  return (
    <div className="mb-6">
      <h3 className="mb-1 text-sm font-semibold text-slate-700">{title}</h3>
      {subtitle && <p className="mb-2 text-xs text-slate-500">{subtitle}</p>}
      <p className="mb-2 text-[11px] text-slate-500">Effective per entry: {stackingLabel}</p>
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <HeaderCell>Trigger Pack</HeaderCell>
              <HeaderCell>Upsell Name</HeaderCell>
              <HeaderCell align="right">Base Entries</HeaderCell>
              <HeaderCell align="right">Upsell Entries</HeaderCell>
              <HeaderCell align="right">Upsell Price</HeaderCell>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((rec) => {
              const triggerPackId = rec.triggersOnPackageIds?.[0] ?? "";
              const triggerPkg = getPackageById(triggerPackId);
              const triggerName = triggerPkg?.name ?? triggerPackId;
              const base = getBaseEntries(rec.baseTemplatePackageId);
              const upsellEntries = stackedEntries(base, activePromo, multiplier);
              return (
                <tr key={rec.id} className="bg-white hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-700">{triggerName}</td>
                  <td className="px-3 py-2 text-slate-700">{rec.name}</td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {base !== null ? base.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900">
                    {upsellEntries !== null ? upsellEntries.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    ${rec.discountedPrice.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniPreviewTable({ activePromo }: { activePromo: number | null }) {
  const effectiveLabel =
    activePromo && activePromo > 1
      ? `${activePromo}× promo × 1× (fixed) = ${activePromo}× effective`
      : "1× (no active promo; same entries as trigger)";
  return (
    <div className="mb-2">
      <h3 className="mb-1 text-sm font-semibold text-slate-700">
        Mini Pack Upsells{" "}
        <span className="ml-1 text-xs font-normal text-slate-500">
          (no admin knob — fixed 1× upsell multiplier; still stacks with active mini promo)
        </span>
      </h3>
      <p className="mb-2 text-[11px] text-slate-500">Effective per entry: {effectiveLabel}</p>
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <HeaderCell>Trigger Pack</HeaderCell>
              <HeaderCell>Upsell Name</HeaderCell>
              <HeaderCell align="right">Trigger Entries</HeaderCell>
              <HeaderCell align="right">Upsell Entries</HeaderCell>
              <HeaderCell align="right">Upsell Price</HeaderCell>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MINI_ROWS.map((row) => {
              const upsellEntries = stackedEntries(row.entries, activePromo, 1) ?? row.entries;
              return (
                <tr key={row.trigger} className="bg-white hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-700">{row.trigger}</td>
                  <td className="px-3 py-2 text-slate-700">{row.upsellName}</td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {row.entries.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900">
                    {upsellEntries.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">${row.price.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function UpsellMultiplierPreviewTables({
  membership,
  oneTime,
  additional,
  activeMembershipPromo,
  activeOneTimePromo,
  activeMiniPromo,
}: Props) {
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">Entry Preview</h3>
      <p className="mb-4 text-xs text-slate-500">
        Formula: <code className="rounded bg-slate-100 px-1 py-0.5">activePromo × upsellCategoryMultiplier × baseEntries</code>.
        When no active promo applies, the promo factor is <strong>1</strong>.
      </p>
      <PreviewTable
        title="Membership Upsells"
        categoryKey="membership"
        multiplier={membership}
        activePromo={activeMembershipPromo}
      />
      <PreviewTable
        title="One-Time Upsells"
        categoryKey="one-time"
        multiplier={oneTime}
        activePromo={activeOneTimePromo}
      />
      <PreviewTable
        title="Additional (Member) Upsells"
        subtitle="Preview assumes a subscriber (uses membership promo). An entrant without a subscription would see the one-time promo apply instead."
        categoryKey="additional"
        multiplier={additional}
        activePromo={activeMembershipPromo}
      />
      <MiniPreviewTable activePromo={activeMiniPromo} />
    </div>
  );
}
