"use client";

import Image from "next/image";
import Link from "next/link";
import { Trophy, MapPin, ShieldCheck, Facebook } from "lucide-react";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { useTilt } from "@/hooks/useTilt";
import { useMajorDrawWinners, type MajorDrawWinner } from "@/hooks/queries/useWinnersQueries";
import { getInitials } from "@/utils/display-name";

const ACCENTS = ["#c8102e", "#d9a520", "#ffd200", "#00c2ed", "#ff7a1a"];

function wonLabel(w: MajorDrawWinner): string {
  const iso = w.drawDate ?? w.selectedDate;
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

/**
 * The wall's own winner card — deliberately NOT the shared `components/cards/WinnerCard`.
 *
 * That one is a NAVIGATIONAL card: a `<Link>` to the promo / mini-draws page, promo-themed via
 * `usePromoTheme()`, with a "1st Prize Winner" badge and an "Explore this promotion" CTA. This
 * wall is a TRUST strip — static, accent-tinted, ending in "Verified draw". Folding the two
 * together would mean four variant props (aspect, accent-vs-theme, link-vs-static,
 * CTA-vs-verified-row) on a 130-line component, and they consume different types
 * (`MajorDrawWinner` here vs `WinnerSummary` there). `cards/RecentWinnerCard` is separate for the
 * same reason and says so in its own docblock.
 *
 * Named `MembershipWinnerCard`, not `WinnerCard`, so a grep for the shared component does not
 * turn up three unrelated things called the same thing.
 */
function MembershipWinnerCard({ w, accent }: { w: MajorDrawWinner; accent: string }) {
  const ref = useTilt<HTMLDivElement>(5);
  const name = `${w.winnerFirstName} ${w.winnerLastName}`.trim();
  const prize = w.selectedPrize?.trim() || w.prize?.name || "Major draw prize";
  return (
    <div ref={ref} className="overflow-hidden rounded-3xl border border-token bg-surface shadow-lg [transform-style:preserve-3d]">
      <div
        className="relative aspect-[4/3] w-full"
        style={{ background: `linear-gradient(150deg, ${accent}, ${accent}99)` }}
      >
        {w.imageUrl ? (
          /*
           * `object-top`, not the default centre crop: these are phone photos of people in a 4:3
           * box, so a centred cover crop takes the top band first and cuts heads off. Pinning the
           * top also moves faces clear of the bottom gradient + name overlay below. This is the
           * only winner card on a 4:3 frame — the shared `cards/WinnerCard` is near-square
           * (`4/4.1`) and the carousel card is portrait, so neither crops hard enough to need it.
           */
          <Image src={w.imageUrl} alt={`${name} — winner`} fill className="object-cover object-top" sizes="(max-width:640px) 100vw, 360px" />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-poppins text-5xl font-black text-white/85">{getInitials(w.winnerFirstName, w.winnerLastName)}</span>
          </div>
        )}
        <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-extrabold text-black">
          <Trophy className="h-3 w-3" /> Winner
        </span>
        <div className="absolute inset-x-3 bottom-3 text-white">
          <strong className="block font-poppins text-lg font-extrabold leading-tight">{name}</strong>
          {w.winnerState && (
            <span className="inline-flex items-center gap-1 text-xs text-white/85">
              <MapPin className="h-3 w-3" /> {w.winnerState}
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="font-poppins text-sm font-bold text-primary-token dark:text-white">{prize}</div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
            <ShieldCheck className="h-3.5 w-3.5" /> Verified draw
          </span>
          <span className="text-muted-token">{wonLabel(w)}</span>
        </div>
      </div>
    </div>
  );
}

export default function MembershipWinnersWall() {
  const { data: winners = [], isLoading } = useMajorDrawWinners();
  if (!isLoading && winners.length === 0) return null;
  const shown = winners.slice(0, 3);

  return (
    <section className="relative overflow-hidden bg-page py-16 sm:py-20">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(720px 480px at 10% 4%, rgba(238,0,0,.06), transparent 60%), radial-gradient(760px 540px at 92% 100%, rgba(255,200,0,.07), transparent 60%)",
        }}
        aria-hidden
      />
      <SectionContainer as="div" className="relative">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">Past winners</span>
          <h2 className="mt-4 font-poppins text-3xl font-extrabold tracking-tight text-primary-token sm:text-4xl lg:text-5xl dark:text-white">
            Real tradies, real gear.
          </h2>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-[360px] animate-pulse rounded-3xl border border-token bg-black/5 dark:bg-white/5" />
              ))
            : shown.map((w, i) => (
                <MembershipWinnerCard key={w.id} w={w} accent={ACCENTS[i % ACCENTS.length]} />
              ))}
        </div>

        <p className="mt-8 flex items-center justify-center gap-2 text-center text-sm text-muted-token">
          <Facebook className="h-4 w-4 text-[#1877f2]" /> Every draw goes out live on the 27th — independent &amp; certified.{" "}
          <Link href="/winners" className="font-semibold text-red-600 hover:underline">
            See all winners
          </Link>
        </p>
      </SectionContainer>
    </section>
  );
}
