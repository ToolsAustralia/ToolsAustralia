"use client";

import {
  getPromoPreviewRows,
  type PromoMultiplierSnapshot,
  type PreviewRow,
} from "@/utils/admin/promo-purchase-entries-preview";

export function PromoPurchaseEntriesPreview({
  snapshot,
}: {
  snapshot: PromoMultiplierSnapshot;
}) {
  const { membership, oneTime, mini } = getPromoPreviewRows(snapshot);

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-700">
          Live preview — entries per purchase
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          What each package will award once this multiplier is active. Hover a multiplier
          button to preview it before clicking.
        </p>
      </div>

      <PreviewSection
        title={`Membership (×${snapshot.membershipPackages})`}
        rows={membership}
      />
      <PreviewSection
        title={`One-Time + Additional (×${snapshot.oneTimePackages})`}
        rows={oneTime}
      />
      <PreviewSection
        title={`Mini (×${snapshot.miniPackages})`}
        rows={mini}
        miniNote
      />
    </div>
  );
}

function PreviewSection({
  title,
  rows,
  miniNote,
}: {
  title: string;
  rows: PreviewRow[];
  miniNote?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.packageId} className="border-t border-slate-200">
              <td className="py-1 pr-2 text-slate-700">{r.displayName}</td>
              <td className="py-1 text-right tabular-nums text-slate-500">
                {r.baseEntries.toLocaleString()}
              </td>
              <td className="px-2 py-1 text-slate-400">→</td>
              <td className="py-1 text-right tabular-nums font-medium text-slate-900">
                {r.multipliedEntries.toLocaleString()} entries
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {miniNote && (
        <p className="mt-1 text-[10px] text-slate-400">
          Mini upsells are immune to this multiplier — they always award the base entries.
        </p>
      )}
    </div>
  );
}
