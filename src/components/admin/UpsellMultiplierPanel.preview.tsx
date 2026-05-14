"use client";

import { upsellPackages } from "@/data/upsellPackages";
import { getPackageById } from "@/data/membershipPackages";

interface Props {
  membership: number;
  oneTime: number;
  additional: number;
}

// Mini pack static data (fixed, no admin knob)
const MINI_ROWS: { trigger: string; upsellName: string; entries: number; price: number }[] = [
  { trigger: "Mini Pack 1",        upsellName: "Mini Pack 1",   entries: 1,   price: 0.5 },
  { trigger: "Mini Pack 2",        upsellName: "Mini Pack 2",   entries: 5,   price: 2.5 },
  { trigger: "Mini Pack 3",        upsellName: "Mini Pack 3",   entries: 10,  price: 5 },
  { trigger: "Tradie Pack (Mini)", upsellName: "Tradie Pack",   entries: 25,  price: 12.5 },
  { trigger: "Foreman Pack (Mini)",upsellName: "Foreman Pack",  entries: 50,  price: 25 },
  { trigger: "Boss Pack (Mini)",   upsellName: "Boss Pack",     entries: 125, price: 62.5 },
  { trigger: "Power Pack (Mini)",  upsellName: "Power Pack",    entries: 250, price: 125 },
  { trigger: "VIP Pack (Mini)",    upsellName: "VIP Pack",      entries: 500, price: 250 },
];

function getBaseEntries(packageId: string): number | null {
  const pkg = getPackageById(packageId);
  if (!pkg) return null;
  if (pkg.type === "subscription") return pkg.entriesPerMonth ?? null;
  return pkg.totalEntries ?? null;
}

function PreviewTable({
  title,
  categoryKey,
  multiplier,
}: {
  title: string;
  categoryKey: "membership" | "one-time" | "additional";
  multiplier: number;
}) {
  const records = upsellPackages.filter((p) => p.upsellCategory === categoryKey);

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Trigger Pack</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Upsell Name</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Base Entries</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">
                Upsell Entries ({multiplier}×)
              </th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Upsell Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((rec) => {
              const triggerPackId = rec.triggersOnPackageIds?.[0] ?? "";
              const triggerPkg = getPackageById(triggerPackId);
              const triggerName = triggerPkg?.name ?? triggerPackId;
              const base = getBaseEntries(rec.baseTemplatePackageId);
              const upsellEntries = base !== null ? multiplier * base : null;
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

function MiniPreviewTable() {
  return (
    <div className="mb-2">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">
        Mini Pack Upsells{" "}
        <span className="ml-1 text-xs font-normal text-slate-500">(no admin multiplier — fixed 1:1 entries)</span>
      </h3>
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Trigger Pack</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Upsell Name</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Upsell Entries</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Upsell Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MINI_ROWS.map((row) => (
              <tr key={row.trigger} className="bg-white hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-700">{row.trigger}</td>
                <td className="px-3 py-2 text-slate-700">{row.upsellName}</td>
                <td className="px-3 py-2 text-right font-medium text-slate-900">
                  {row.entries.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">${row.price.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function UpsellMultiplierPreviewTables({ membership, oneTime, additional }: Props) {
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">Entry Preview</h3>
      <PreviewTable title="Membership Upsells" categoryKey="membership" multiplier={membership} />
      <PreviewTable title="One-Time Upsells" categoryKey="one-time" multiplier={oneTime} />
      <PreviewTable title="Additional (Member) Upsells" categoryKey="additional" multiplier={additional} />
      <MiniPreviewTable />
    </div>
  );
}
