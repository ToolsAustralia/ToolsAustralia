"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Sparkles, Clock, CalendarClock, ChevronDown } from "lucide-react";
import AccessRing from "@/components/ui/AccessRing";
import { useLeafTimer } from "@/hooks/useLeafTimer";
import { usePartnerDiscountQueue } from "@/hooks/queries/usePartnerDiscountQueue";
import { derivePlanIdFromPackage, getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { getPackageIconByName } from "@/utils/images/package-icons";
import { inkOn } from "@/utils/membership/tier-visuals";
import { cn } from "@/utils/cn";

type Source = "membership" | "subscription" | "one-time" | "mini-draw" | "upsell";

const SOURCE_LABEL: Record<string, string> = {
  membership: "Membership",
  subscription: "Membership",
  "one-time": "One-time pack",
  "mini-draw": "Mini-draw pack",
  upsell: "Upsell",
};

/** Display name: drop the internal "Additional " prefix + the trailing "(Mini Draw)" /
 *  "(Major Draw)" scope suffix (icon/theme resolution is substring-based, so this is
 *  display-only). Keeps the row short so the tier name doesn't truncate mid-word. */
const cleanName = (n: string | null | undefined) =>
  (n ?? "").replace(/^additional\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();

const fmtDay = (d: Date) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long" });

/** Catalogue % + accent for a package, from its resolved plan id. */
function packMeta(name: string, source: Source) {
  const membershipType = source === "membership" || source === "subscription" ? "subscription" : "one-time";
  const planId = derivePlanIdFromPackage({ name }, membershipType);
  const scheme = getMembershipSectionColorScheme(planId, membershipType === "subscription");
  return { pct: getPartnerCatalogAccessPercentForPlanId(planId), accent: scheme.accentHex, icon: getPackageIconByName(name, membershipType) };
}

/**
 * Partner Discount Queue — the Rewards-tab section that makes the "highest-%
 * pack is always active, the rest queue" model legible: the active pack (tier-
 * themed, live countdown, catalogue-% ring), then an "up next" list ranked by
 * catalogue % with each pack's own duration and when it takes over, and a footer
 * with the total queued access window. Data via `usePartnerDiscountQueue`; the
 * per-item "activates in" / "runs through" dates are derived client-side from the
 * active remainder + cumulative queued durations. The up-next list scrolls in its
 * own bounded box so the section never runs away vertically.
 */
export default function RewardsPartnerQueue() {
  const { data, isLoading } = usePartnerDiscountQueue();
  const now = useLeafTimer(1000);
  // Collapsed by default so the section doesn't push the rest of the page down.
  const [open, setOpen] = useState(false);

  const model = useMemo(() => {
    if (!data) return null;
    const { activePeriod, queuedItems, totalQueuedDays, summary } = data;
    const activeDays = Math.max(0, Math.round(activePeriod.daysRemaining));

    // Queued items arrive highest-% first (= activation order); accumulate the
    // days before each one's turn, and the date each takes over.
    let cum = activeDays;
    const upNext = queuedItems.map((it) => {
      const meta = packMeta(it.packageName, it.packageType);
      const activatesInDays = cum;
      const activationDate = new Date(now + cum * 86_400_000);
      cum += Math.max(0, Math.round(it.daysOfAccess));
      return {
        name: cleanName(it.packageName),
        durationDays: Math.max(0, Math.round(it.daysOfAccess)),
        pct: meta.pct,
        accent: meta.accent,
        icon: meta.icon,
        activatesInDays,
        activationDate,
      };
    });

    const active = activePeriod.isActive && activePeriod.packageName
      ? { ...packMeta(activePeriod.packageName, (activePeriod.source ?? "one-time") as Source), name: cleanName(activePeriod.packageName), source: (activePeriod.source ?? "one-time") as Source, endsAt: activePeriod.endsAt, ongoing: summary.isActiveSubscription }
      : null;

    const totalQueued = Math.max(0, Math.round(totalQueuedDays));
    const accessThrough = new Date(now + cum * 86_400_000);
    return { active, upNext, totalQueued, accessThrough, show: !!active || upNext.length > 0 };
  }, [data, now]);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-3xl border border-token bg-black/[.04] dark:bg-white/[.05]" />;
  }
  if (!model?.show) return null;

  const { active, upNext, totalQueued, accessThrough } = model;

  return (
    <section className="overflow-hidden rounded-3xl border border-token bg-surface shadow-sm">
      {/* Collapsible header — glanceable summary + chevron (collapsed by default). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-black/[.02] sm:px-5 dark:hover:bg-white/[.04]"
      >
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Partner discount queue</div>
          <div className="mt-0.5 truncate text-[13px] font-semibold">
            {active ? (
              <><span className="text-primary-token dark:text-white">{active.name}</span><span className="text-muted-token"> · {active.pct}% active</span></>
            ) : (
              <span className="text-muted-token">No pack active</span>
            )}
            {upNext.length > 0 && <span className="text-muted-token"> · {upNext.length} queued</span>}
          </div>
        </div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-token transition-transform", open && "rotate-180")} />
      </button>

      {open && (
      <div className="space-y-4 border-t border-token p-4 sm:p-5">
        {/* Active pack — tier-themed, live countdown, catalogue-% ring */}
        {active && (() => {
          const ink = inkOn(active.accent);
          const soft = ink === "#0a0a0a" ? "rgba(0,0,0,.62)" : "rgba(255,255,255,.82)";
          const ms = active.endsAt ? Math.max(0, new Date(active.endsAt).getTime() - now) : 0;
          const d = Math.floor(ms / 86_400_000);
          const h = Math.floor((ms / 3_600_000) % 24);
          const mnt = Math.floor((ms / 60_000) % 60);
          return (
            <div className="relative overflow-hidden rounded-2xl p-4" style={{ background: `linear-gradient(150deg, ${active.accent}, ${active.accent}cc 55%, ${active.accent})`, color: ink }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: soft }}>
                    <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: ink }} /><span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: ink }} /></span>
                    Active now
                  </span>
                  <div className="mt-1.5 truncate font-poppins text-[19px] font-extrabold leading-tight">{active.name}</div>
                  <div className="mt-0.5 text-[12px] font-semibold" style={{ color: soft }}>
                    {active.pct}% catalogue · {SOURCE_LABEL[active.source] ?? "Pack"}
                  </div>
                </div>
                <AccessRing percent={active.pct} size={58} stroke={7} color={ink} trackColor={ink === "#0a0a0a" ? "rgba(0,0,0,.14)" : "rgba(255,255,255,.22)"}>
                  <span className="num font-poppins text-sm font-extrabold" style={{ color: ink }}>{active.pct}%</span>
                </AccessRing>
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: soft }}>
                <Clock className="h-[15px] w-[15px]" />
                {active.ongoing ? (
                  <span>Ongoing while your membership is active</span>
                ) : active.endsAt ? (
                  <span><b className="num" style={{ color: ink }}>{d}d {h}h {mnt}m</b> left · ends {fmtDay(active.endsAt)}</span>
                ) : null}
              </div>
            </div>
          );
        })()}

        {/* Explainer */}
        <div className="flex items-start gap-2.5 rounded-2xl bg-black/[.03] px-3.5 py-3 dark:bg-white/[.05]">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-[12px] font-medium leading-[1.5] text-muted-token">
            <b className="text-primary-token dark:text-white">Your highest-percentage pack is always active.</b> Buy a bigger one and it takes over instantly — the rest wait their turn, no days lost.
          </p>
        </div>

        {/* Up next — ranked by catalogue %, own-scroll box */}
        {upNext.length > 0 && (
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-token">Up next · highest % first</div>
            <ul className="max-h-[248px] space-y-2 overflow-y-auto pr-1">
              {upNext.map((it, i) => (
                <li key={i} className="flex items-center gap-3 rounded-2xl border border-token bg-page px-3 py-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/[.06] text-[11px] font-black text-muted-token dark:bg-white/[.08]">{i + 1}</span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl" style={{ background: `${it.accent}1f`, border: `1px solid ${it.accent}55` }}>
                    {it.icon ? <Image src={it.icon} alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" /> : <Sparkles className="h-4 w-4" style={{ color: it.accent }} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-extrabold text-primary-token dark:text-white">{it.name}</span>
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-black" style={{ background: it.accent, color: inkOn(it.accent) }}>{it.pct}%</span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-semibold text-muted-token">
                      Activates in ~{it.activatesInDays}d · {fmtDay(it.activationDate)}
                    </div>
                  </div>
                  <span className="num shrink-0 text-[13px] font-black text-amber-600 dark:text-amber-400">{it.durationDays}d</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer — total queued window */}
        <div className="flex items-center gap-2 border-t border-token pt-3 text-[12px] font-semibold text-muted-token">
          <CalendarClock className="h-[15px] w-[15px] shrink-0 text-muted-token" />
          <span><b className="num text-primary-token dark:text-white">{totalQueued} {totalQueued === 1 ? "day" : "days"}</b> queued · access runs through <b className="text-primary-token dark:text-white">{fmtDay(accessThrough)}</b></span>
        </div>
      </div>
      )}
    </section>
  );
}
