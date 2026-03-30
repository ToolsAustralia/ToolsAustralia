"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Search, Sparkles, Trophy } from "lucide-react";
import WinnerCard, { type WinnerCardData } from "@/components/cards/WinnerCard";
import WinnerFilterToggle from "@/components/filters/WinnerFilterToggle";
import WinnerTestimonySection from "@/components/sections/WinnerTestimonySection";
import MetallicButton from "@/components/ui/MetallicButton";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { getWinnerSearchableContent, hasWinnerTestimony } from "@/utils/winners";

type Winner = WinnerCardData;
type FilterType = "all" | "major" | "mini";

function getContrastText(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

export default function WinnersPageClient() {
  const theme = usePromoTheme();
  const themeTextColor = getContrastText(theme.primary);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchWinners = async () => {
      try {
        setError(null);
        const response = await fetch("/api/winners/all?limit=100");
        const data = await response.json();

        if (!response.ok || !data.success || !Array.isArray(data.winners)) {
          throw new Error(data.error || "Failed to fetch winners");
        }

        setWinners(data.winners);
      } catch (fetchError) {
        console.error("Error fetching winners:", fetchError);
        setError("We couldn't load the winners right now. Please try again shortly.");
      } finally {
        setLoading(false);
      }
    };

    fetchWinners();
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredWinners = useMemo(() => {
    let filtered = winners;
    if (filter !== "all") {
      filtered = filtered.filter((winner) => winner.drawType === filter);
    }

    if (normalizedQuery) {
      filtered = filtered.filter(
        (winner) =>
          formatWinnerName(winner.winnerFirstName, winner.winnerLastName)
            .toLowerCase()
            .includes(normalizedQuery) || getWinnerSearchableContent(winner).includes(normalizedQuery)
      );
    }

    return filtered;
  }, [filter, normalizedQuery, winners]);

  const filteredWinnerStories = useMemo(
    () => filteredWinners.filter((winner) => hasWinnerTestimony(winner)),
    [filteredWinners]
  );
  const majorWinnerCount = useMemo(
    () => winners.filter((winner) => winner.drawType === "major").length,
    [winners]
  );
  const miniWinnerCount = useMemo(
    () => winners.filter((winner) => winner.drawType === "mini").length,
    [winners]
  );
  const totalWinnerStories = useMemo(
    () => winners.filter((winner) => hasWinnerTestimony(winner)).length,
    [winners]
  );

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-10 sm:py-14 lg:py-20">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at top, ${theme.shadowRgba.replace(/,\s*[\d.]+\)/, ", 0.22)")}, transparent 32%)`,
          }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-90"
          style={{
            background: `radial-gradient(circle at center, ${theme.primaryLight}24, transparent 42%)`,
          }}
        />

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,420px)] lg:items-end">
            <div>
              <div className="mx-auto mb-3 h-1 w-20 rounded-full sm:mx-0" style={{ background: theme.gradient }} />
              <span
                className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur"
                style={{ borderColor: theme.borderRgba, backgroundColor: "rgba(2,6,23,0.55)" }}
              >
                <Sparkles className="h-3.5 w-3.5" style={{ color: theme.primaryLight }} />
                Winners Hall of Fame
              </span>
              <div className="mt-5 flex items-start gap-4">
                <div
                  className="hidden rounded-[24px] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.35)] sm:inline-flex"
                  style={{ background: theme.gradient }}
                >
                  <Trophy className="h-9 w-9" style={{ color: themeTextColor }} />
                </div>
                <div>
                  <h1 className="text-4xl font-bold leading-tight text-white font-['Poppins'] sm:text-5xl lg:text-6xl">
                    Real Wins, Real People
                  </h1>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 sm:text-base lg:text-lg">
                    Proof from every draw—names, prizes, and the stories that show your entries land
                    in real workshops.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total Winners", value: loading ? "--" : winners.length },
                { label: "Major", value: loading ? "--" : majorWinnerCount },
                { label: "Mini", value: loading ? "--" : miniWinnerCount },
                { label: "Stories", value: loading ? "--" : totalWinnerStories },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[24px] border bg-white/[0.06] p-4 text-white backdrop-blur"
                  style={{ borderColor: theme.borderRgba }}
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {stat.label}
                  </span>
                  <span className="mt-3 block text-3xl font-bold font-['Poppins']">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="sticky top-[60px] z-30 border-b bg-white/92 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/92 sm:top-[70px]"
        style={{ borderBottomColor: theme.borderRgba.replace("0.4)", "0.2)") }}
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <WinnerFilterToggle
                selectedFilter={filter}
                onFilterChange={setFilter}
                className="w-full sm:w-auto"
              />
              <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Showing{" "}
                <span className="font-semibold text-slate-950 dark:text-white">
                  {filteredWinners.length}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-950 dark:text-white">{winners.length}</span>{" "}
                winners
              </div>
            </div>

            <div
              className="group relative w-full lg:max-w-md"
              style={
                {
                  ["--winner-focus" as string]: theme.primary,
                  ["--winner-focus-ring" as string]: theme.shadowRgba.replace(/,\s*[\d.]+\)/, ", 0.12)"),
                } as CSSProperties
              }
            >
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[color:var(--winner-focus)] dark:text-slate-500" />
              <input
                type="text"
                aria-label="Search winners"
                placeholder="Search winners, prizes, locations, draws…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-950 transition-all duration-200 placeholder:text-slate-400 focus:border-[color:var(--winner-focus)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[color:var(--winner-focus-ring)] dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl bg-slate-50/90 px-4 py-8 dark:bg-slate-950/50 sm:px-6 lg:px-8 lg:py-12">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 md:gap-6 lg:grid-cols-3 lg:gap-8">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-white animate-pulse dark:border-slate-700/80 dark:bg-slate-900"
                style={{ borderColor: `${theme.borderRgba.replace("0.4)", "0.18)")}` }}
              >
                <div className="h-1.5" style={{ background: theme.gradient, opacity: 0.45 }} />
                <div className="h-56 bg-slate-200 sm:h-60 lg:h-64 dark:bg-slate-800" />
                <div className="space-y-3 p-5 sm:p-6">
                  <div className="h-4 w-3/4 rounded-lg bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-1/2 rounded-lg bg-slate-200 dark:bg-slate-700" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div
            className="rounded-[24px] border bg-slate-50 px-6 py-12 text-center dark:bg-slate-900/60"
            style={{ borderColor: theme.borderRgba }}
          >
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white"
              style={{ background: theme.gradient }}
            >
              <Trophy className="h-8 w-8" style={{ color: themeTextColor }} />
            </div>
            <h3 className="mt-5 text-2xl font-bold text-slate-950 font-['Poppins'] dark:text-white">
              Winners temporarily unavailable
            </h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600 dark:text-slate-400 sm:text-base">
              {error}
            </p>
          </div>
        ) : filteredWinners.length > 0 ? (
          <>
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-3 h-1 w-20 rounded-full" style={{ background: theme.gradient }} />
                <h2 className="text-3xl font-bold tracking-tight text-slate-950 font-['Poppins'] dark:text-white">
                  Every Card Is Proof
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-400 sm:text-base">
                  Same premium treatment as our homepage winners—clear draws, dates, and next steps.
                </p>
              </div>

              {filteredWinnerStories.length > 0 && (
                <div
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm dark:text-slate-100"
                  style={{
                    borderColor: theme.borderRgba,
                    background: `linear-gradient(135deg, ${theme.primary}14, ${theme.primaryLight}0f)`,
                  }}
                >
                  <Sparkles className="h-4 w-4 shrink-0" style={{ color: theme.primary }} />
                  <span>
                    {filteredWinnerStories.length} stor
                    {filteredWinnerStories.length === 1 ? "y" : "ies"} in this view
                  </span>
                </div>
              )}
            </div>

            {filteredWinners.length === 1 && !normalizedQuery && filter === "all" && (
              <div
                className="mb-8 rounded-[24px] border px-5 py-4 text-center dark:bg-slate-900/40"
                style={{ borderColor: theme.borderRgba, background: `linear-gradient(135deg, ${theme.primary}08, transparent)` }}
              >
                <div
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-white shadow-md"
                  style={{ background: theme.gradient, borderColor: theme.borderRgba, color: themeTextColor }}
                >
                  <Sparkles className="h-4 w-4" />
                  Our first winner
                </div>
                <p className="mx-auto mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
                  We&apos;re thrilled to celebrate our first winner—the start of a bigger proof wall for
                  the brand.
                </p>
              </div>
            )}

            <div
              className={`grid gap-4 sm:gap-6 lg:gap-8 ${
                filteredWinners.length === 1 && !normalizedQuery && filter === "all"
                  ? "grid-cols-1 max-w-2xl mx-auto"
                  : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              }`}
            >
              {filteredWinners.map((winner) => (
                <WinnerCard key={winner.id} winner={winner} />
              ))}
            </div>
          </>
        ) : filter === "mini" ? (
          <div className="py-16 text-center">
            <div
              className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full border shadow-lg"
              style={{ background: theme.gradient, borderColor: theme.borderRgba }}
            >
              <Trophy className="h-10 w-10" style={{ color: themeTextColor }} />
            </div>
            <h3 className="mb-3 text-2xl font-bold text-slate-950 font-['Poppins'] dark:text-white sm:text-3xl">
              Be our first mini draw winner
            </h3>
            <p className="mx-auto mb-8 max-w-md text-base text-slate-600 dark:text-slate-400 sm:text-lg">
              No mini draw winners yet—you could be the first. Jump into mini draws and stack your
              entries.
            </p>
            <MetallicButton href="/mini-draws" variant="primary" size="md" borderRadius="lg">
              Explore mini draws
            </MetallicButton>
          </div>
        ) : (
          <div className="py-16 text-center">
            <div
              className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full border bg-white shadow-md dark:bg-slate-900"
              style={{ borderColor: theme.borderRgba }}
            >
              <Trophy className="h-10 w-10 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="mb-2 text-2xl font-bold text-slate-950 font-['Poppins'] dark:text-white">
              No winners in this view
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              {normalizedQuery || filter !== "all"
                ? "Try a different search or filter—or clear filters to see everyone."
                : "Check back soon for new draws and winners."}
            </p>
          </div>
        )}
      </section>

      {!loading && !error && filteredWinners.length > 0 && (
        <WinnerTestimonySection winners={filteredWinners} />
      )}
    </>
  );
}
