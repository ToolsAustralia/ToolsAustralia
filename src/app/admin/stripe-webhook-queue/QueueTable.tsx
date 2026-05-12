"use client";

import { useEffect, useState } from "react";

type Row = {
  _id: string;
  eventId: string;
  type: string;
  status: "queued" | "processing" | "succeeded" | "dead";
  attempts: number;
  nextAttemptAt: string;
  claimedAt: string | null;
  lastError: string | null;
  enqueuedAt: string;
  processedAt: string | null;
};

const STATUSES = ["", "queued", "processing", "succeeded", "dead"] as const;

export default function QueueTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  async function fetchRows() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/stripe-webhook-queue?${params.toString()}`);
      const data = (await res.json()) as { rows: Row[]; total: number };
      setRows(data.rows);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchRows();
    // status is the only dep — fetchRows is defined inline and closes over status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleReplay(_id: string) {
    setReplayingId(_id);
    try {
      await fetch("/api/admin/stripe-webhook-queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ _id }),
      });
      // Optimistic refresh after a brief delay so the worker has time to run.
      setTimeout(() => void fetchRows(), 1500);
    } finally {
      setReplayingId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm">
          Status:{" "}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || "all"}
              </option>
            ))}
          </select>
        </label>
        <span className="text-sm text-gray-600">{total} total</span>
        <button
          onClick={() => void fetchRows()}
          className="rounded bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200"
        >
          Refresh
        </button>
        {loading && <span className="text-sm text-gray-500">Loading…</span>}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Event ID</th>
            <th className="p-2">Type</th>
            <th className="p-2">Status</th>
            <th className="p-2">Attempts</th>
            <th className="p-2">Next attempt</th>
            <th className="p-2">Last error</th>
            <th className="p-2">Enqueued</th>
            <th className="p-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._id} className="border-b align-top">
              <td className="p-2 font-mono text-xs">{row.eventId}</td>
              <td className="p-2 font-mono text-xs">{row.type}</td>
              <td className="p-2">{row.status}</td>
              <td className="p-2">{row.attempts}</td>
              <td className="p-2 font-mono text-xs">{new Date(row.nextAttemptAt).toLocaleString()}</td>
              <td className="p-2 max-w-md truncate text-xs text-red-700">{row.lastError ?? ""}</td>
              <td className="p-2 font-mono text-xs">{new Date(row.enqueuedAt).toLocaleString()}</td>
              <td className="p-2">
                <button
                  disabled={replayingId === row._id}
                  onClick={() => void handleReplay(row._id)}
                  className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {replayingId === row._id ? "Replaying…" : "Replay"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
