import Link from "next/link";
import { Gift, MapPin, ShieldCheck, Trophy } from "lucide-react";
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
 * Link behaviour:
 *  - `href` set (e.g. the Latest Winners carousel → promotion / mini-draws):
 *    the whole tile is that (internal) link — no "Verify" chip.
 *  - no `href` but the winner has a randomdraws result link (`/winners`,
 *    the draw-results wall): the tile becomes that external verify link and
 *    shows a small "Verify" affordance.
 *  - neither: a static, non-interactive tile.
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

  // An explicit href (navigational) takes priority over the verify link; the
  // "Verify" chip only shows when the tile IS the randomdraws result link.
  const showVerify = !href && !!w.drawResultUrl;
  const linkHref = href ?? w.drawResultUrl;

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
              <MapPin size={12} /> {w.winnerState}
            </div>
          ) : null}
        </div>
      </div>
      <div className="lw-body">
        <div className="lw-prize">
          <span className="lw-prize-ic">{isMajor ? <Trophy size={14} /> : <Gift size={14} />}</span>
          <span>
            {prizeText}
            <i className="lw-sub">{isMajor ? "Major draw" : "Mini draw"}</i>
          </span>
        </div>
        {showVerify ? (
          <span className="lw-verify">
            <ShieldCheck size={13} /> Verify
          </span>
        ) : null}
      </div>
    </>
  );

  if (!linkHref) {
    return <article className="lw-tile">{inner}</article>;
  }

  // External result links (randomdraws verification) open in a new tab; the
  // internal navigation links (promotion / mini-draws) use client-side routing.
  if (/^https?:\/\//i.test(linkHref)) {
    return (
      <a
        href={linkHref}
        target="_blank"
        rel="noopener noreferrer"
        className="lw-tile"
        aria-label={`${name} — ${prizeText}. Verify draw on randomdraws.com.au`}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link href={linkHref} className="lw-tile" aria-label={`${name} — ${prizeText}`}>
      {inner}
    </Link>
  );
}
