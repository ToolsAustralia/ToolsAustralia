import { ArrowRight, Calendar, MapPin, Trophy } from "lucide-react";
import type { WinnerSummary } from "@/types/winner";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { Reveal } from "./Reveal";
import WinnerRail from "./WinnerRail";
import PrizeImage from "./PrizeImage";
import { auDateParts, fmtNum } from "./format";

function WinnerCard({ w }: { w: WinnerSummary }) {
  const { full } = auDateParts(w.wonOnDate || w.selectedDate);
  // The wall celebrates the people — prefer the winner's own photo, falling
  // back to the draw artwork only when there's no winner photo.
  const img = w.imageUrl || w.prize.images?.[0];
  const winner = formatWinnerName(w.winnerFirstName, w.winnerLastName);
  return (
    <article
      className="shrink-0 snap-start overflow-hidden lp-lift"
      style={{ width: "min(84vw, 332px)", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 20 }}
    >
      <div
        className="relative flex items-center justify-center"
        style={{ height: 300, background: "linear-gradient(180deg,var(--plinth-a),var(--plinth-b))" }}
      >
        <PrizeImage src={img} alt={`${winner} — ${w.prize.name}`} className="h-full w-auto object-contain p-5" />
        <span
          className="absolute right-3.5 top-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{ background: "var(--accent)" }}
        >
          <Trophy size={14} strokeWidth={2.2} style={{ color: "var(--on-accent)" }} />
          <span className="lp-display text-[11px] tracking-wide" style={{ color: "var(--on-accent)" }}>
            Winner
          </span>
        </span>
        <span
          className="absolute left-3.5 bottom-3.5 font-mono text-[10px] tracking-[.12em] uppercase px-2.5 py-1 rounded"
          style={{ background: "rgba(0,0,0,.55)", color: "#e4e4e8" }}
        >
          {w.drawName}
        </span>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="lp-display text-xl" style={{ color: "var(--ink)" }}>
            {winner}
          </span>
          {w.winnerState ? (
            <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
              <MapPin size={14} /> {w.winnerState}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-[14px] leading-snug" style={{ color: "var(--ink-2)" }}>
          {w.prize.name}
        </p>
        <div
          className="mt-4 pt-3 flex items-center gap-2 text-[12px]"
          style={{ borderTop: "1px solid var(--line)", color: "var(--ink-3)" }}
        >
          <Calendar size={14} /> Drawn {full}
        </div>
      </div>
    </article>
  );
}

export default function WinnersWall({
  winners,
  totalWinners,
}: {
  winners: WinnerSummary[];
  totalWinners: number;
}) {
  const list = winners.slice(0, 9);
  if (list.length === 0) return null;

  return (
    <section id="wall" className="py-14 sm:py-24" style={{ background: "var(--bg)" }}>
      <div className="lp-container">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-10 lg:items-center">
          <Reveal className="lg:col-span-4">
            <span className="lp-kicker">The wall</span>
            <h2 className="lp-display lp-italic text-2xl sm:text-4xl lg:text-5xl mt-4" style={{ color: "var(--ink)" }}>
              Real gear.
              <br />
              Real winners.
            </h2>
            <p className="mt-4 text-[15px]" style={{ color: "var(--ink-2)" }}>
              Every winner is announced live and verified at randomdraws.com.au, then shipped their prize free
              Australia-wide — or paid the cash.
            </p>
            <div className="mt-6 flex items-baseline gap-3">
              <span className="lp-display lp-num text-4xl" style={{ color: "var(--accent)" }}>
                {fmtNum(totalWinners)}
              </span>
              <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                winners and counting
              </span>
            </div>
          </Reveal>
          <div className="lg:col-span-8 relative min-w-0">
            <WinnerRail className="lp-noscroll flex gap-4 overflow-x-auto snap-x pb-2" style={{ scrollPadding: 16 }}>
              {list.map((w) => (
                <WinnerCard key={w.id} w={w} />
              ))}
              <div className="shrink-0 w-1" />
            </WinnerRail>
            <div
              className="lp-fadeedge hidden lg:block"
              style={{ right: 0, width: 48, background: "linear-gradient(270deg, var(--bg), transparent)" }}
            />
            <div className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
              <ArrowRight size={15} /> Drag to see more winners
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
