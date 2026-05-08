"use client";

import React from "react";
import { Trophy, Ticket, Calendar } from "lucide-react";
import InfoGrid, { type InfoGridCell } from "../upsell-shell/InfoGrid";

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

  const cells: InfoGridCell[] = [
    // Cell 1: entries
    {
      icon: <Ticket size={20} strokeWidth={2} className="max-xs:size-4" />,
      title: hasMembershipEntries ? (
        <>
          <span className="text-red-600 font-extrabold">{accumulatedEntries.toLocaleString()}</span>{" "}
          {isPastDue ? "accumulated entries" : "locked-in entries"}
        </>
      ) : (
        <>
          Your <span className="text-red-600 font-extrabold">accumulated</span> entries
        </>
      ),
      desc: hasMembershipEntries
        ? isPastDue
          ? "Held while you sort the bill"
          : "Already in the current draw"
        : "Earned each cycle on your plan",
    },
    // Cell 2: prize shot
    {
      icon: <Trophy size={20} strokeWidth={2} className="max-xs:size-4" />,
      title: (
        <>
          Your shot at the <span className="text-red-600 font-extrabold">{featuredPrizeShortLabel}</span>
        </>
      ),
      desc: <>Or $10,000 cash </>,
    },
    // Cell 3: days / spot
    {
      icon: <Calendar size={20} strokeWidth={2} className="max-xs:size-4" />,
      title: showSpotCell ? (
        <>
          Your spot in{" "}
          {typeof daysUntilDraw === "number" ? (
            <span className="text-red-600 font-extrabold">{daysUntilDraw} days</span>
          ) : (
            <span className="text-red-600 font-extrabold">the draw</span>
          )}
        </>
      ) : (
        <>
          Your spot{" "}
          {typeof daysUntilDraw === "number" ? (
            <>
              in <span className="text-red-600 font-extrabold">{daysUntilDraw} days</span>
            </>
          ) : (
            <>in the draw</>
          )}
        </>
      ),
      desc: showSpotCell
        ? drawCloseText
        : isPastDue
          ? "Settle up to keep it"
          : "Renew to keep it",
    },
  ];

  return <InfoGrid cells={cells} title={titleText} framing="loss" />;
};

export default LoseGrid;
