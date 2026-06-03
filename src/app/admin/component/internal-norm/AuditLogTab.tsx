"use client";

import { useEffect, useState } from "react";

type AuditRow = {
  _id: string;
  requestId: string;
  registryKey: string;
  tier: string;
  method: string;
  path: string;
  responseStatus: number;
  durationMs: number;
  createdAt: string;
};

type AuditResponse = {
  success: boolean;
  data: AuditRow[];
  nextCursor: string | null;
};

export default function AuditLogTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(next?: string | null) {
    setLoading(true);
    try {
      const url = new URL("/api/admin/internal-norm/audit", window.location.origin);
      if (next) url.searchParams.set("cursor", next);
      const res = await fetch(url.toString());
      const json: AuditResponse = await res.json();
      const data = Array.isArray(json.data) ? json.data : [];
      setRows((prev) => (next ? [...prev, ...data] : data));
      setCursor(json.nextCursor ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Norm audit log</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-neutral-800/60 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Endpoint</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">RequestId</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500 dark:text-neutral-400">
                  No audit log entries yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r._id} className="text-gray-700 dark:text-neutral-200">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">{r.tier}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.registryKey}</td>
                <td className="px-3 py-2">{r.responseStatus}</td>
                <td className="px-3 py-2">{r.durationMs}ms</td>
                <td className="px-3 py-2 font-mono text-xs">{r.requestId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cursor && (
        <button
          onClick={() => load(cursor)}
          disabled={loading}
          className="mt-4 text-sm font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
