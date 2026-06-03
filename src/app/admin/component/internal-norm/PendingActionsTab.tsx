"use client";

import { useEffect, useState } from "react";

type AffectedEntity = { type: string; id: string };

type PendingRow = {
  _id: string;
  registryKey: string;
  plan: {
    summary?: string;
    affectedEntities?: AffectedEntity[];
    warnings?: string[];
  };
  reasonText?: string;
  createdAt: string;
  expiresAt: string;
};

type PendingResponse = {
  success: boolean;
  data: PendingRow[];
};

export default function PendingActionsTab() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/internal-norm/pending");
      const json: PendingResponse = await res.json();
      setRows(Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function resolve(id: string, decision: "approve" | "deny", note?: string) {
    await fetch(`/api/admin/internal-norm/pending/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
    void reload();
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Norm pending actions</h2>
      {rows.length === 0 && !loading && (
        <p className="text-sm text-gray-500 dark:text-neutral-400">No pending actions.</p>
      )}
      {rows.map((r) => (
        <div
          key={r._id}
          className="border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 rounded-lg p-4 mb-3"
        >
          <div className="font-mono text-xs text-gray-500 dark:text-neutral-400">{r.registryKey}</div>
          <div className="font-semibold text-gray-900 dark:text-white mt-1">
            {r.plan.summary ?? "(no summary)"}
          </div>
          {r.plan.affectedEntities && r.plan.affectedEntities.length > 0 && (
            <ul className="text-xs text-gray-600 dark:text-neutral-300 mt-2">
              {r.plan.affectedEntities.map((e, i) => (
                <li key={i} className="font-mono">
                  {e.type}: {e.id}
                </li>
              ))}
            </ul>
          )}
          {r.plan.warnings?.length ? (
            <ul className="text-amber-600 dark:text-amber-400 text-sm mt-2">
              {r.plan.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          ) : null}
          {r.reasonText && (
            <p className="italic text-sm text-gray-700 dark:text-neutral-300 mt-2">
              Norm: {r.reasonText}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => resolve(r._id, "approve")}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded"
            >
              Approve
            </button>
            <button
              onClick={() => {
                const note = window.prompt("Reason for denial?") || undefined;
                void resolve(r._id, "deny", note);
              }}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded"
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
