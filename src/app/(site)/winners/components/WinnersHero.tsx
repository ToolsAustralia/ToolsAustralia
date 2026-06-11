import { Reveal } from "../../draw-results/components/Reveal";
import { fmtNum } from "../../draw-results/components/format";

interface WinnerStats {
  total: number;
  major: number;
  mini: number;
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

export default function WinnersHero({ stats }: { stats: WinnerStats }) {
  return (
    <section className="relative overflow-hidden" style={{ background: "var(--bg)" }}>
      <div className="ta-hero-bg" />
      <div className="lp-glow" style={{ width: 520, height: 340, right: -140, top: -140, opacity: 0.16 }} />
      <div className="lp-container relative z-10 pt-12 sm:pt-20 pb-12 sm:pb-16">
        <Reveal className="max-w-3xl">
          <span className="lp-kicker">Winners hall of fame</span>
          <h1 className="lp-display lp-italic text-3xl sm:text-6xl lg:text-7xl mt-5" style={{ color: "var(--ink)" }}>
            Real wins.
            <br />
            <span style={{ color: "var(--accent)" }}>Real tradies.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg max-w-xl" style={{ color: "var(--ink-2)" }}>
            Every name here started with a single entry. Real names, real prizes, and the stories — drawn live and independently certified by
            randomdraws.com.au.
          </p>
        </Reveal>
        <Reveal className="mt-9 flex flex-wrap items-center gap-x-5 sm:gap-x-6 gap-y-4">
          <HeroMetric n={fmtNum(stats.total)} label="Winners" />
          <HeroMetric n={fmtNum(stats.major)} label="Major wins" />
          <HeroMetric n={fmtNum(stats.mini)} label="Mini wins" last />
        </Reveal>
      </div>
    </section>
  );
}
