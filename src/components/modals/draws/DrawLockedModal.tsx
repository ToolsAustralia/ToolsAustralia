"use client";

import React from "react";
import { Lock } from "lucide-react";
import DrawModalShell from "./DrawModalShell";

/**
 * Shown instead of the edit form when a draw's configuration has locked.
 *
 * Every edit entry point on a locked draw routes here — inspector primary, row
 * action and the mobile sheet — through ONE guard in the page container
 * (`UpcomingDraws.openDrawEditor`), so no path can reach the form behind a lock.
 *
 * It explains why config locks and, more usefully, what is STILL editable, so an
 * admin does not conclude the draw is entirely frozen. The lock covers
 * configuration only; the winner and its testimony are recorded after the freeze
 * and stay editable by design.
 */
export default function DrawLockedModal({
  isOpen,
  onClose,
  drawName,
}: {
  isOpen: boolean;
  onClose: () => void;
  drawName: string;
}) {
  return (
    <DrawModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      eyebrow={drawName ? `${drawName} · config locked` : "Config locked"}
      title="This draw is locked"
      secondaryLabel="Got it"
    >
      <div
        className="mb-[12px] flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[var(--info-bg)] text-[var(--info)]"
        aria-hidden
      >
        <Lock className="h-[18px] w-[18px]" />
      </div>

      <p className="text-[13px] leading-[1.6] text-[var(--text2)]">
        Configuration locks automatically the moment entries freeze, 30 minutes before the draw. It keeps the prize,
        dates and description that entrants saw from changing after the entry pool has closed.
      </p>

      <div className="mt-[14px] overflow-hidden rounded-[9px] border border-[var(--line)]">
        <table className="w-full text-[12.5px]">
          <caption className="sr-only">What can and cannot be edited while the draw is locked</caption>
          <thead>
            <tr className="bg-[var(--panel2)] text-left">
              <th scope="col" className="px-[10px] py-[8px] font-semibold text-[var(--text)]">
                Still editable
              </th>
              <th scope="col" className="px-[10px] py-[8px] font-semibold text-[var(--text)]">
                Locked
              </th>
            </tr>
          </thead>
          <tbody className="align-top">
            <tr className="border-t border-[var(--line)]">
              <td className="px-[10px] py-[9px] text-[var(--text2)]">
                <ul className="list-inside list-disc space-y-[3px]">
                  <li>Winner &amp; testimony</li>
                  <li>Winner photo</li>
                  <li>Draw result link</li>
                </ul>
              </td>
              <td className="px-[10px] py-[9px] text-[var(--text2)]">
                <ul className="list-inside list-disc space-y-[3px]">
                  <li>Prize name, value &amp; images</li>
                  <li>Activation, freeze &amp; draw dates</li>
                  <li>Name &amp; description</li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-[10px] text-[11.5px] leading-[1.5] text-[var(--text3)]">
        The lock releases once the draw completes.
      </p>
    </DrawModalShell>
  );
}
