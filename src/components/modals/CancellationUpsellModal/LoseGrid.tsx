"use client";

import React from "react";
import { Trophy, Ticket, Calendar } from "lucide-react";

interface LoseGridProps {
  isPastDue: boolean;
  hasMembershipEntries: boolean;
  accumulatedEntries: number;
  /** Pretty short prize label, e.g. "Milwaukee Combo + $5k cash". */
  featuredPrizeShortLabel: string;
  /** Days remaining until the draw closes. Optional — controls 3rd cell copy. */
  daysUntilDraw: number | undefined;
  /** Pretty draw close label fallback text, e.g. "Draw closes Fri 26 Dec". */
  drawCloseText: string;
  /** TRUE only when not past-due AND has membership entries — affects 3rd cell. */
  showSpotCell: boolean;
}

const LoseGrid: React.FC<LoseGridProps> = ({
  isPastDue,
  hasMembershipEntries,
  accumulatedEntries,
  featuredPrizeShortLabel,
  daysUntilDraw,
  drawCloseText,
  showSpotCell,
}) => {
  const titleText = isPastDue ? "Settle up & you keep" : "Cancel now & you walk away from";

  return (
    <div className="bg-white px-4 pt-3 pb-3 max-xs:px-3 max-xs:pt-2.5 max-xs:pb-2.5">
      <div className="text-center font-extrabold text-2xs tracking-[0.18em] uppercase text-neutral-600 mb-2.5 relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:w-7 before:h-px before:bg-neutral-200 before:[transform:translateX(calc(-100%-130px))] after:content-[''] after:absolute after:top-1/2 after:right-1/2 after:w-7 after:h-px after:bg-neutral-200 after:[transform:translateX(calc(100%+130px))] max-xs:text-[9px] max-xs:mb-2 max-xs:before:hidden max-xs:after:hidden">
        {titleText}
      </div>

      <div className="grid grid-cols-3 gap-0 items-stretch">
        {/* Cell 1: entries */}
        <div className="text-center px-2 pt-0.5 relative flex flex-col items-center max-xs:px-1">
          <div className="w-[34px] h-[34px] rounded-lg bg-gradient-to-b from-[#fff5f5] to-[#fef2f2] border border-red-100 text-red-700 inline-flex items-center justify-center mb-1.5 max-xs:w-7 max-xs:h-7 max-xs:rounded-md max-xs:mb-1">
            <Ticket size={20} strokeWidth={2} className="max-xs:size-4" />
          </div>
          <div className="font-extrabold text-xs text-neutral-950 mb-0.5 leading-[1.25] flex-1 max-xs:text-[11px] max-xs:mb-px" data-cell-num>
            {hasMembershipEntries ? (
              <>
                <span className="text-red-600 font-extrabold">{accumulatedEntries.toLocaleString()}</span>{" "}
                {isPastDue ? "accumulated entries" : "locked-in entries"}
              </>
            ) : (
              <>
                Your <span className="text-red-600 font-extrabold">accumulated</span> entries
              </>
            )}
          </div>
          <div className="text-2xs text-neutral-600 leading-[1.35] max-xs:text-[9px] max-xs:leading-[1.3]" data-cell-desc>
            {hasMembershipEntries
              ? isPastDue
                ? "Held while you sort the bill"
                : "Already in the current draw"
              : "Earned each cycle on your plan"}
          </div>
        </div>

        {/* Cell 2: prize shot — separator on left */}
        <div className="text-center px-2 pt-0.5 relative flex flex-col items-center before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-1.5 before:w-px before:bg-neutral-200 max-xs:px-1 max-xs:before:top-1 max-xs:before:bottom-1">
          <div className="w-[34px] h-[34px] rounded-lg bg-gradient-to-b from-[#fff5f5] to-[#fef2f2] border border-red-100 text-red-700 inline-flex items-center justify-center mb-1.5 max-xs:w-7 max-xs:h-7 max-xs:rounded-md max-xs:mb-1">
            <Trophy size={20} strokeWidth={2} className="max-xs:size-4" />
          </div>
          <div className="font-extrabold text-xs text-neutral-950 mb-0.5 leading-[1.25] flex-1 max-xs:text-[11px] max-xs:mb-px" data-cell-num>
            Your shot at the <span className="text-red-600 font-extrabold">{featuredPrizeShortLabel}</span>
          </div>
          <div className="text-2xs text-neutral-600 leading-[1.35] max-xs:text-[9px] max-xs:leading-[1.3]" data-cell-desc>Or $10,000 cash </div>
        </div>

        {/* Cell 3: days / spot — separator on left, two variants */}
        <div className="text-center px-2 pt-0.5 relative flex flex-col items-center before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-1.5 before:w-px before:bg-neutral-200 max-xs:px-1 max-xs:before:top-1 max-xs:before:bottom-1">
          <div className="w-[34px] h-[34px] rounded-lg bg-gradient-to-b from-[#fff5f5] to-[#fef2f2] border border-red-100 text-red-700 inline-flex items-center justify-center mb-1.5 max-xs:w-7 max-xs:h-7 max-xs:rounded-md max-xs:mb-1">
            <Calendar size={20} strokeWidth={2} className="max-xs:size-4" />
          </div>
          {showSpotCell ? (
            <>
              <div className="font-extrabold text-xs text-neutral-950 mb-0.5 leading-[1.25] flex-1 max-xs:text-[11px] max-xs:mb-px" data-cell-num>
                Your spot in {typeof daysUntilDraw === "number" ? <span className="text-red-600 font-extrabold">{daysUntilDraw} days</span> : <span className="text-red-600 font-extrabold">the draw</span>}
              </div>
              <div className="text-2xs text-neutral-600 leading-[1.35] max-xs:text-[9px] max-xs:leading-[1.3]" data-cell-desc>{drawCloseText}</div>
            </>
          ) : (
            <>
              <div className="font-extrabold text-xs text-neutral-950 mb-0.5 leading-[1.25] flex-1 max-xs:text-[11px] max-xs:mb-px" data-cell-num>
                Your spot {typeof daysUntilDraw === "number" ? <>in <span className="text-red-600 font-extrabold">{daysUntilDraw} days</span></> : <>in the draw</>}
              </div>
              <div className="text-2xs text-neutral-600 leading-[1.35] max-xs:text-[9px] max-xs:leading-[1.3]" data-cell-desc>
                {isPastDue ? "Settle up to keep it" : "Renew to keep it"}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoseGrid;
