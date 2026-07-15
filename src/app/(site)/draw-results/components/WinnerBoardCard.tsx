import Link from "next/link";
import { MapPin } from "lucide-react";
import type { WinnerSummary } from "@/types/winner";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { auDateParts } from "./format";

/**
 * WinnerBoardCard — a single tile in the Winners Board grid.
 *
 * A faithful port of the standalone "Winners Board" design onto real winner
 * data: a photo (winner's own, falling back to the prize art, then to an
 * initials monogram) with the name + state overlaid on a bottom scrim, a
 * month pill, an accent top stripe, and the prize + draw-type sub-line below.
 *
 * Link behaviour: when `href` is set (e.g. the Latest Winners section →
 * promotion / mini-draws) the whole tile is that link; otherwise the tile is
 * static (the `/winners` + draw-results boards).
 *
 * Styling lives in draw-results.css (`.lw-*`, scoped under `.ta-results`), so
 * every host must render this inside a `.ta-results` root.
 */
export default function WinnerBoardCard({ w, href }: { w: WinnerSummary; href?: string }) {
  const name = formatWinnerName(w.winnerFirstName, w.winnerLastName);
  const { mon, yr, full } = auDateParts(w.wonOnDate || w.selectedDate);
  const when = mon && yr ? `${mon} ${yr}` : full;
  const img = w.imageUrl || w.prize.images?.[0];
  const isMajor = w.drawType === "major";
  const prizeText = w.selectedPrize || w.prize.name;
  const initials =
    [w.winnerFirstName, w.winnerLastName]
      .map((s) => s?.trim()?.charAt(0))
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase() || "TA";

  const inner = (
    <>
      <div className="lw-photo">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary art / winner photo
          <img src={img} alt={`${name}${prizeText ? ` — ${prizeText}` : ""}`} loading="lazy" />
        ) : (
          <span className="lw-monogram" aria-hidden="true">
            {initials}
          </span>
        )}
        {when ? <span className="lw-when">{when}</span> : null}
        <span className="lw-scrim" />
        <div className="lw-nameplate">
          <div className="lw-name">{name}</div>
          {w.winnerState ? (
            <div className="lw-loc">
              <MapPin size={11} /> {w.winnerState}
            </div>
          ) : null}
        </div>
      </div>
      <div className="lw-body">
        <div className="lw-prize">{prizeText}</div>
        <div className="lw-sub">{isMajor ? "Major draw" : "Mini draw"}</div>
      </div>
    </>
  );

  if (!href) {
    return <article className="lw-tile">{inner}</article>;
  }

  // External links open in a new tab; internal paths use client-side routing.
  if (/^https?:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="lw-tile" aria-label={`${name} — ${prizeText}`}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className="lw-tile" aria-label={`${name} — ${prizeText}`}>
      {inner}
    </Link>
  );
}
