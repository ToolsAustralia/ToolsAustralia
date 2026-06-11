import type { WinnerSummary } from "@/types/winner";
import PromoTrustBar from "@/components/sections/promo/PromoTrustBar";
import { Reveal } from "./Reveal";
import FeaturedDraw from "./FeaturedDraw";
import { fmtNum } from "./format";

interface HeroStats {
  majorCompleted: number;
  miniWins: number;
  allWinners: number;
}

function HeroMetric({ n, label, last }: { n: string; label: string; last?: boolean }) {
  return (
    <div className="flex items-center gap-5 sm:gap-6">
      <div>
        <div className="lp-display lp-num text-2xl sm:text-4xl" style={{ color: "var(--ink)" }}>
          <span style={{ color: "var(--accent)" }}>{n}</span>
        </div>
        <div className="font-mono text-[10px] tracking-[.16em] uppercase mt-1" style={{ color: "var(--ink-3)" }}>
          {label}
        </div>
      </div>
      {last ? null : <span style={{ width: 1, height: 38, background: "var(--line-2)" }} />}
    </div>
  );
}

export default function ResultsHero({
  featuredMajors,
  stats,
}: {
  featuredMajors: WinnerSummary[];
  stats: HeroStats;
}) {
  return (
    <section className="relative overflow-hidden" style={{ background: "var(--bg)" }}>
      <div className="ta-hero-bg" />
      <div className="lp-glow" style={{ width: 520, height: 340, right: -140, top: -140, opacity: 0.16 }} />
      <div className="lp-container relative z-10 pt-12 sm:pt-20 pb-12 sm:pb-16">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className={featuredMajors.length > 0 ? "lg:col-span-6" : "lg:col-span-12"}>
            <Reveal>
              <span className="lp-kicker">Verified results · Drawn live</span>
              <h1 className="lp-display lp-italic text-3xl sm:text-6xl lg:text-7xl mt-5" style={{ color: "var(--ink)" }}>
                Every draw.
                <br />
                Every winner.
                <br />
                <span style={{ color: "var(--accent)" }}>On the record.</span>
              </h1>
              <p className="mt-6 text-base sm:text-lg max-w-lg" style={{ color: "var(--ink-2)" }}>
                Every monthly major draw is streamed live and certified by randomdraws.com.au. Browse the full
                history below — real names, real prizes, real verification.
              </p>
            </Reveal>
            <Reveal className="mt-9 flex flex-wrap items-center gap-x-5 sm:gap-x-6 gap-y-4">
              <HeroMetric n={fmtNum(stats.majorCompleted)} label="Major draws" />
              <HeroMetric n={fmtNum(stats.miniWins)} label="Mini wins" />
              <HeroMetric n={fmtNum(stats.allWinners)} label="All winners" last />
            </Reveal>
          </div>
          {featuredMajors.length > 0 ? (
            <Reveal className="lg:col-span-6">
              <FeaturedDraw winners={featuredMajors} />
            </Reveal>
          ) : null}
        </div>

      </div>

      {/* Full-width trust bar — reused from the promotions page (certification +
          live-draw urgency), spanning edge-to-edge below the hero content. */}
      <div className="relative z-10">
        <PromoTrustBar />
      </div>
    </section>
  );
}
