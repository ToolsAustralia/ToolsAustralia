"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  registryKey: string;
  tier: string;
  requiredPermission: string;
  normHasPermission: boolean;
  path: string;
  method: string;
  summary: string;
  disabled: boolean;
  wired: boolean;
  legacyAdminCheck?: boolean;
};

type EndpointsResponse = {
  success: boolean;
  data: Row[];
};

export default function EndpointsTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/internal-norm/endpoints");
      const json: EndpointsResponse = await res.json();
      setRows(Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function toggle(key: string, disabled: boolean) {
    await fetch(`/api/admin/internal-norm/endpoints/${encodeURIComponent(key)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ disabled }),
    });
    void reload();
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Norm endpoint registry</h2>
      <p className="text-sm text-gray-600 dark:text-neutral-400 mb-4">
        To grant Norm a new capability, edit the{" "}
        <Link href="/admin/team" className="underline text-red-600 dark:text-red-400">
          Norm role
        </Link>{" "}
        in Team → Roles and add the matching permission.
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-neutral-800/60 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
            <tr>
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Path</th>
              <th className="px-3 py-2">Required permission</th>
              <th className="px-3 py-2">Norm has it?</th>
              <th className="px-3 py-2">Wired</th>
              <th className="px-3 py-2">Disabled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500 dark:text-neutral-400">
                  No registry entries.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.registryKey}
                className={`text-gray-700 dark:text-neutral-200 ${r.disabled ? "opacity-50" : ""}`}
              >
                <td className="px-3 py-2 font-mono text-xs">{r.registryKey}</td>
                <td className="px-3 py-2">{r.tier}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.method} {r.path}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.requiredPermission}
                  {r.legacyAdminCheck && (
                    <span
                      className="ml-2 text-amber-600 dark:text-amber-400"
                      title="Underlying admin route still uses legacy requireAdminUser"
                    >
                      ⚠ legacy
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.normHasPermission ? (
                    <span className="text-green-600 dark:text-green-400">✓</span>
                  ) : (
                    <span
                      className="text-red-600 dark:text-red-400"
                      title="Norm role does not grant this permission — calls will 403"
                    >
                      ✗
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{r.wired ? "✓" : "—"}</td>
                <td className="px-3 py-2">
                  <label className="inline-flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.disabled}
                      onChange={(e) => toggle(r.registryKey, e.target.checked)}
                    />
                    <span className="text-xs">{r.disabled ? "Disabled" : "Enabled"}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
