"use client";
import React, { useState, useEffect } from "react";
import { useFacebookAdsHealthSettings, useFacebookAdsHealthSettingsUpdate } from "@/hooks/queries/admin/useFacebookAdsHealth";

interface Props {
  open: boolean;
  onClose: () => void;
}

const FIELDS: Array<{ key: string; label: string; min: number; max: number; step: number }> = [
  { key: "breakevenRoas", label: "Breakeven ROAS", min: 0, max: 10, step: 0.05 },
  { key: "targetCpaAud", label: "Target CPA (AUD)", min: 1, max: 10000, step: 1 },
  { key: "zeroConvSpendMultiplier", label: "Zero-conv spend multiplier", min: 0.5, max: 10, step: 0.1 },
  { key: "roasDropTriggerPct", label: "ROAS-drop trigger %", min: 5, max: 95, step: 1 },
  { key: "postEditWaitHours", label: "Post-edit wait window (hours)", min: 1, max: 168, step: 1 },
];

const DEFAULTS: Record<string, number> = {
  breakevenRoas: 1.0,
  targetCpaAud: 40,
  zeroConvSpendMultiplier: 2.0,
  roasDropTriggerPct: 25,
  postEditWaitHours: 72,
};

export function FacebookAdsHealthSettingsModal({ open, onClose }: Props) {
  const { data } = useFacebookAdsHealthSettings();
  const update = useFacebookAdsHealthSettingsUpdate();
  const [form, setForm] = useState<Record<string, number>>({});

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-[420px] max-w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold mb-3">Ads Health — Tunable Thresholds</h3>
        {FIELDS.map((f) => (
          <label key={f.key} className="block mb-3 text-xs">
            <span className="block mb-1 text-zinc-600 dark:text-zinc-300">{f.label}</span>
            <input
              type="number"
              min={f.min}
              max={f.max}
              step={f.step}
              value={form[f.key] ?? ""}
              onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
              className="w-full border rounded px-2 py-1 bg-white dark:bg-zinc-800"
            />
          </label>
        ))}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setForm(DEFAULTS)} className="px-3 py-1.5 text-xs border rounded">Restore defaults</button>
          <button onClick={onClose} className="px-3 py-1.5 text-xs border rounded">Cancel</button>
          <button
            onClick={() => update.mutate(form, { onSuccess: onClose })}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded"
            disabled={update.isPending}
          >Save</button>
        </div>
      </div>
    </div>
  );
}
