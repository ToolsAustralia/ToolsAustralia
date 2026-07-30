"use client";

import React from "react";
import { Users } from "lucide-react";

/**
 * Top entrants + a way into the full participants list.
 *
 * The top-3 read is only correct because the participants route now sorts
 * BEFORE paginating — before that fix, `?limit=3` returned the first three in
 * insertion order. See docs/admin/api.md (2026-07-30).
 */
export interface TopEntrant {
  userId: string;
  name: string;
  entries: number;
}

export default function EntryPoolCard({
  entrants,
  isLoading,
  onViewParticipants,
  onOpenEntrant,
}: {
  entrants: TopEntrant[];
  isLoading: boolean;
  onViewParticipants: () => void;
  /** Opens the admin user modal — same drill-through the participants list has. */
  onOpenEntrant?: (userId: string) => void;
}) {
  return (
    <section className="flex flex-col rounded-[11px] border border-[var(--line)] bg-[var(--panel)] p-[14px] shadow-[var(--shadow)]">
      <h3 className="font-poppins text-[15px] font-bold text-[var(--text)]">Entry pool</h3>

      <div className="mt-[12px] flex flex-col gap-[8px]">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-[10px]" aria-busy="true">
              <div className="admin-draws-skeleton h-[30px] w-[30px] rounded-full" />
              <div className="admin-draws-skeleton h-[13px] flex-1 rounded-[5px]" />
              <div className="admin-draws-skeleton h-[13px] w-[46px] rounded-[5px]" />
            </div>
          ))
        ) : entrants.length === 0 ? (
          <p className="text-[12.5px] leading-[1.6] text-[var(--text3)]">
            No entries in this draw yet. Entrants appear here as soon as the first purchase lands.
          </p>
        ) : (
          entrants.map((entrant, index) => {
            const initials = entrant.name
              .split(" ")
              .map((part) => part[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase();

            const content = (
              <>
                <span
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)] ring-1 ring-[var(--avatarRing)]"
                  aria-hidden
                >
                  {initials || index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--text)]">
                  {entrant.name}
                </span>
                <span data-figure className="shrink-0 text-[12px] font-semibold text-[var(--text2)]">
                  {entrant.entries.toLocaleString()}
                </span>
              </>
            );

            return onOpenEntrant ? (
              <button
                key={entrant.userId}
                type="button"
                onClick={() => onOpenEntrant(entrant.userId)}
                className="flex min-h-[var(--m-btn-sm)] items-center gap-[10px] rounded-[7px] px-[4px] text-left hover:bg-[var(--hover)]"
              >
                {content}
              </button>
            ) : (
              <div key={entrant.userId} className="flex items-center gap-[10px] px-[4px]">
                {content}
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={onViewParticipants}
        className="mt-[12px] flex h-[var(--m-btn-h)] w-full items-center justify-center gap-[7px] rounded-[9px] border border-[var(--line)] bg-[var(--panel)] text-[12.5px] font-semibold text-[var(--text)] hover:border-[var(--accent-line)] hover:text-[var(--accent)]"
      >
        <Users className="h-[15px] w-[15px]" />
        View participants
      </button>
    </section>
  );
}
