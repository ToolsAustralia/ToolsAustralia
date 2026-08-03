"use client";

/**
 * "What your tier unlocks" — the browsable, filterable partner catalogue.
 *
 * WHY THIS PAGE EXISTS (portal audit, 2026-07-31)
 * The vendor's portal renders locked and unlocked offers identically in every grid,
 * carousel and search result, never states the member's tier, and offers no way to filter
 * by what they can actually use. A Tradie therefore meets a home page that is 68% locked
 * with nothing marked, and can only discover entitlement by clicking offers one at a time.
 *
 * We hold the per-offer access threshold for all 1,833 offers ourselves, so we can answer
 * the question the portal cannot — without waiting on the vendor. This page marks every
 * offer against the member's own access, defaults to showing only what is open to them,
 * and names the tier that would open the rest.
 *
 * EVERY CARD LEADS SOMEWHERE, and where depends on entitlement:
 *   open  + warm portal session → the offer itself (`/products/view_smart/{id}`)
 *   open  + cold session         → the SSO hand-off (a cold deep link dead-ends on a login page)
 *   LOCKED                       → `/membership` carrying `offer_id`
 *
 * That last one turns the page into a conversion surface. A member looking at a locked offer
 * has already told us which offer they want, so the card hands that id to the SAME machinery
 * the portal's own bounce-back uses (`resolvePortalReturn` + `resolvePortalBannerView`): the
 * membership page then names the offer and preselects the cheapest plan that opens it, with
 * every lifecycle state (guest / past-due / paused / active) already handled there.
 */

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Gift, Search, Lock, ArrowLeft, ExternalLink } from "lucide-react";

import { useDashboardState } from "@/hooks/useDashboardState";
import { useDebounce } from "@/hooks/useDebounce";
import DashboardPageHeader from "../../components/DashboardPageHeader";
import DashboardLoader from "@/components/loading/DashboardLoader";
import {
  PARTNER_CATALOG_BROWSE,
  PARTNER_CATALOG_BROWSE_CATEGORIES,
} from "@/generated/partnerCatalogBrowse";
import { formatPartnerOfferName } from "@/utils/partner-discounts/portal-return";
import {
  buildTierUpgradeCopy,
  buildLockedOfferUpgradeHref,
} from "@/utils/partner-discounts/tier-upgrade-copy";
import {
  buildPartnerPortalOfferUrl,
  buildPartnerPortalOfferImageUrl,
  hasPartnerPortalSession,
} from "@/utils/partner-discounts/portal-offer-url";
import { usePortalHandoff } from "@/components/sections/rewards/PortalHandoff";
import { usePartnerCatalogueSpotlightSeen } from "../../components/PartnerCatalogueSpotlight";
import { cn } from "@/utils/cn";

/** Rows rendered before "Show more" — 1,833 nodes at once is a needless DOM cost. */
const PAGE_SIZE = 60;

const fmtAu = (n: number): string => n.toLocaleString("en-AU");

export default function RewardsCataloguePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const dash = useDashboardState();

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<number | null>(null);
  // Defaults ON for anyone with access — the point of the page is "what can I use". But a
  // guest / past-due-with-no-pack sits at 0%, where ON yields an empty page and reads as
  // broken. They get the full catalogue instead, which is the conversion view: every card
  // marked with the membership that opens it. Set once from the resolved tier below.
  const [openOnly, setOpenOnly] = React.useState(true);
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const debouncedQuery = useDebounce(query, 200);

  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) router.push("/login");
  }, [session, status, router]);

  // Arriving here IS the nudge being resolved — clears the Rewards nav dot for good.
  usePartnerCatalogueSpotlightSeen();

  const accessPct = dash.partnerAccessPct ?? 0;

  /**
   * A cold `view_smart` link does NOT trigger SSO — it bounces to a login page and loses the
   * offer (measured; see portal-offer-url.ts). So the row's ACTION depends on the session:
   *
   *   warm (already handed off in this tab) → open the offer directly
   *   cold                                  → run the hand-off, which signs them in
   *
   * Every open row stays clickable either way. An earlier attempt simply withheld the link
   * when cold, which "fixed" the dead-end by making the row silently do nothing — a worse
   * failure, because the member gets no feedback at all and no way to reach the offer.
   *
   * Read after mount, never during render: `sessionStorage` does not exist on the server and
   * reading it in the render body would hydrate-mismatch.
   */
  const [portalWarm, setPortalWarm] = React.useState(false);
  React.useEffect(() => setPortalWarm(hasPartnerPortalSession()), []);

  // At 0% the "only what I can use" default would render an empty page. Flip it once, after
  // the tier resolves, so a guest lands on the full browsable catalogue.
  const zeroAccessDefaultApplied = React.useRef(false);
  React.useEffect(() => {
    if (dash.isLoading || zeroAccessDefaultApplied.current) return;
    zeroAccessDefaultApplied.current = true;
    if (accessPct === 0) setOpenOnly(false);
  }, [dash.isLoading, accessPct]);

  const sso = usePortalHandoff({
    memberName: dash.user?.firstName,
    tierLabel: dash.subscriptionTierLabel,
    accessPct,
  });

  // Prepared once: lower-cased names for matching, display names for rendering.
  const prepared = React.useMemo(
    () =>
      PARTNER_CATALOG_BROWSE.map(([name, catIdx, pct, id, highlight, imageExt]) => ({
        name: formatPartnerOfferName(name),
        // Search covers the value line too, so "cashback" or "4%" finds the right rows.
        haystack: `${name} ${highlight}`.toLowerCase(),
        catIdx,
        pct,
        highlight,
        id,
        href: buildPartnerPortalOfferUrl(id),
        // ONLY where the probe confirmed artwork, and with the extension it found (it varies
        // per offer). Guessing would fire a doomed request through our own image optimiser.
        imageSrc: imageExt ? buildPartnerPortalOfferImageUrl(id, imageExt) : null,
      })),
    []
  );

  const filtered = React.useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return prepared.filter((o) => {
      if (openOnly && o.pct > accessPct) return false;
      if (category !== null && o.catIdx !== category) return false;
      if (q && !o.haystack.includes(q)) return false;
      return true;
    });
  }, [prepared, debouncedQuery, category, openOnly, accessPct]);

  /**
   * How many rows the SAME search would return with the tier filter off.
   *
   * Without this the page lies by omission: "Only show what I can use" is on by default, so
   * searching a brand that sits above the member's tier returns nothing and reads as "we don't
   * carry it" — when in fact we do, and it is precisely the offer worth upselling. Only
   * computed when the filtered set is empty, so the common path costs nothing.
   */
  const aboveTierMatches = React.useMemo(() => {
    if (filtered.length > 0 || !openOnly) return 0;
    const q = debouncedQuery.trim().toLowerCase();
    return prepared.filter(
      (o) => (category === null || o.catIdx === category) && (!q || o.haystack.includes(q))
    ).length;
  }, [filtered.length, openOnly, prepared, debouncedQuery, category]);

  // Reset paging whenever the result set changes underneath the user.
  React.useEffect(() => setLimit(PAGE_SIZE), [debouncedQuery, category, openOnly]);

  const openCount = React.useMemo(() => prepared.filter((o) => o.pct <= accessPct).length, [prepared, accessPct]);

  if (status === "loading" || dash.isLoading) {
    return <DashboardLoader label="Loading the partner catalogue…" />;
  }
  if (!session) {
    return (
      <div className="min-h-screen-svh flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-xl font-semibold text-primary-token dark:text-white">Please sign in to view the catalogue.</p>
        <Link href="/login" className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden pb-8">
      <DashboardPageHeader
        title="Partner catalogue"
        sub="What your access opens"
        icon={Gift}
        stateTheme={dash.stateTheme}
      />

      <div className="space-y-4 px-4 pt-4 sm:px-6">
        <Link
          href="/my-account/rewards"
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-muted-token hover:text-primary-token focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Rewards
        </Link>

        <section className="rounded-[1.1rem] border border-token bg-surface p-4 shadow-sm">
          <div className="font-poppins text-[15px] font-extrabold text-primary-token dark:text-white">
            {/* "0 of 1,833 offers open at your 0%" is technically true and useless. For someone
                with no access the honest, useful framing is the size of the prize. */}
            {accessPct > 0
              ? `${fmtAu(openCount)} of ${fmtAu(prepared.length)} offers open at your ${accessPct}%`
              : `${fmtAu(prepared.length)} partner offers — a membership or pack opens them`}
          </div>
          {/* NOT "everything below is the real catalogue" — that was false. Our list is the
              curated allowlist, and it is provably missing offers the portal merchandises on
              its own home page (BOGOHO Rewards, Supercheap Auto eGift, CAT Workwear, Choice
              eGift, MyDriver — 5 of 11 sampled, 2026-08-01). Claiming completeness makes an
              empty search read as "we don't carry it" when we simply have not listed it. */}
          <p className="mt-1 text-[11.5px] font-semibold leading-[1.45] text-muted-token">
            Offers above your level are marked with the membership that opens them — the portal
            itself does not mark them. The portal may also carry newer offers than this list.
          </p>

          {/* Search */}
          <div className="relative mt-3.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-token" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search offers"
              aria-label="Search partner offers by name"
              className="w-full rounded-[10px] border border-token bg-transparent py-2.5 pl-9 pr-3 text-[13px] font-semibold text-primary-token placeholder:font-medium placeholder:text-muted-token focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-white"
            />
          </div>

          {/* Open-to-me toggle */}
          <label className="mt-3 flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
              className="h-4 w-4 accent-red-600"
            />
            <span className="text-[12px] font-bold text-primary-token dark:text-white">
              Only show what I can use
            </span>
          </label>

          {/* Category chips */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <CategoryChip active={category === null} onClick={() => setCategory(null)} label="All" />
            {PARTNER_CATALOG_BROWSE_CATEGORIES.map((c, i) => (
              <CategoryChip key={c} active={category === i} onClick={() => setCategory(i)} label={c} />
            ))}
          </div>
        </section>

        <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-token" aria-live="polite">
          {fmtAu(filtered.length)} {filtered.length === 1 ? "offer" : "offers"}
        </p>

        {filtered.length === 0 ? (
          <div className="rounded-[1.1rem] border border-token bg-surface p-6 text-center shadow-sm">
            {aboveTierMatches > 0 ? (
              <>
                {/* We DO carry it — it is just above their level. Saying "no offers match"
                    here would be a lie, and it hides the one upsell that has already proven
                    the member wants it. */}
                <p className="text-[13px] font-bold text-primary-token dark:text-white">
                  {fmtAu(aboveTierMatches)} {aboveTierMatches === 1 ? "offer matches" : "offers match"}, above your{" "}
                  {accessPct}%
                </p>
                <p className="mx-auto mt-1 max-w-[42ch] text-[11.5px] font-semibold text-muted-token">
                  We do carry {aboveTierMatches === 1 ? "it" : "them"} — {aboveTierMatches === 1 ? "it needs" : "they need"} a
                  higher membership to open.
                </p>
                <button
                  type="button"
                  onClick={() => setOpenOnly(false)}
                  className="mt-3 rounded-[10px] bg-red-600 px-4 py-2 text-[12.5px] font-extrabold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  Show {aboveTierMatches === 1 ? "it" : "them"}
                </button>
              </>
            ) : (
              <>
                {/* Must NOT say "nothing in the catalogue" — our list is a subset of what the
                    portal actually carries, so that would be a flat untruth for anyone who
                    just saw the offer over there. Send them to search the portal instead. */}
                <p className="text-[13px] font-bold text-primary-token dark:text-white">
                  Nothing in our list matches that.
                </p>
                <p className="mx-auto mt-1 max-w-[44ch] text-[11.5px] font-semibold text-muted-token">
                  The portal carries some offers we haven&apos;t listed here yet — it&apos;s worth
                  searching for it there too.
                </p>
                <button
                  type="button"
                  onClick={sso.start}
                  className="mt-3 rounded-[10px] border border-token px-4 py-2 text-[12.5px] font-extrabold text-primary-token focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-white"
                >
                  Search the partner portal
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* 2 up on a phone, 4 on desktop. `items-stretch` + `h-full` on the card keeps
                every tile in a row the same height whatever the name/value length. */}
            <ul className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
              {filtered.slice(0, limit).map((o, i) => (
                <OfferRow
                  key={`${o.name}-${o.pct}-${i}`}
                  name={o.name}
                  category={PARTNER_CATALOG_BROWSE_CATEGORIES[o.catIdx]}
                  highlight={o.highlight}
                  pct={o.pct}
                  accessPct={accessPct}
                  offerId={o.id}
                  href={portalWarm ? o.href : null}
                  onColdOpen={sso.start}
                  imageSrc={o.imageSrc}
                />
              ))}
            </ul>
            {filtered.length > limit && (
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE_SIZE * 2)}
                className="w-full rounded-[10px] border border-token py-3 text-[12.5px] font-extrabold text-primary-token focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-white"
              >
                Show more ({fmtAu(filtered.length - limit)} left)
              </button>
            )}
          </>
        )}
      </div>

      {/* Transit takeover for a cold-session click — same flow as the Rewards card. */}
      {sso.overlay}
    </div>
  );
}

function CategoryChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600",
        active
          ? "border-red-600 bg-red-600 text-white"
          : "border-token text-muted-token hover:text-primary-token dark:hover:text-white"
      )}
    >
      {label}
    </button>
  );
}

/**
 * The badge value, pulled OUT of the vendor's sentence.
 *
 * `highlight` is prose, not a field: median 28 characters, up to 115 ("10% off all our goods
 * including catering packages, platters…"). Truncating that into a badge would produce
 * "10% off all our go…", which is worse than no badge. So we extract the number that carries
 * the value and leave the full sentence for the line underneath.
 *
 * Measured over all 1,833 rows: 1,505 contain a %, 253 a $, 84 neither — and that last group
 * is almost entirely "Buy 1 Get 1 Free" / "Member only offer", so those two get real labels
 * rather than falling through to nothing.
 */
function extractOfferValue(highlight: string): string | null {
  // The QUALIFIER matters and must not be guessed. "4% OFF" and "4% BACK" are different
  // promises: cashback is refunded after the fact, a discount comes off the price. Labelling
  // a cashback offer "OFF" would be a plain misstatement to the member, so cashback keeps its
  // own word and anything ambiguous gets no suffix at all.
  const back = /cash\s*back|cashback/i.test(highlight);
  const suffix = back ? " BACK" : /\b(off|discount)\b/i.test(highlight) ? " OFF" : "";

  const pct = /(\d+(?:\.\d+)?)\s*%/.exec(highlight);
  if (pct) return `${pct[1]}%${suffix}`;
  const dollars = /\$\s?(\d[\d,]*)/.exec(highlight);
  if (dollars) return `$${dollars[1]}${suffix}`;
  if (/buy\s*1\s*get\s*1/i.test(highlight)) return "BOGO";
  if (/\bfree\b/i.test(highlight)) return "FREE";
  return null;
}

/**
 * Card artwork. About half the catalogue has none, so the fallback is a NORMAL state that has
 * to look designed — a tinted monogram panel, not a broken-image slot.
 *
 * `object-contain` rather than `cover`: the artwork is a mix of merchant logos (Lacoste's
 * wordmark is 64×24) and venue photography. `cover` would crop a wordmark to nonsense, so the
 * whole image is always shown and the ground fills the rest.
 */
function OfferMedia({ name, src, open }: { name: string; src: string | null; open: boolean }) {
  const [failed, setFailed] = React.useState(false);
  // First LETTER, not first character. Many names lead with a quantity — "1 Day Noosa
  // Everglades Guided Kayak Tour", "15 Minute Volcanoes Helicopter", "2XU" — and a wall of
  // tiles all reading "1" is worse than no monogram. Skip leading digits and punctuation,
  // then fall back to the raw first character for a genuinely non-alphabetic name.
  const initial =
    (/[A-Za-z]/.exec(name)?.[0] ?? name.replace(/^[^A-Za-z0-9]+/, "").charAt(0) ?? "?").toUpperCase();

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "grid h-full w-full place-items-center bg-gradient-to-br font-poppins text-[30px] font-black",
          open
            ? "from-red-600/[.09] to-red-600/[.02] text-red-600/70 dark:from-red-500/15 dark:to-red-500/[.04] dark:text-red-400/70"
            : "from-black/[.05] to-black/[.01] text-muted-token/60 dark:from-white/[.07] dark:to-white/[.02]"
        )}
      >
        {initial}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={240}
      height={180}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-contain p-3"
    />
  );
}

function OfferRow({
  name,
  category,
  highlight,
  pct,
  accessPct,
  offerId,
  href,
  onColdOpen,
  imageSrc,
}: {
  name: string;
  category: string;
  highlight: string;
  pct: number;
  accessPct: number;
  offerId: string;
  href: string | null;
  onColdOpen: () => void;
  imageSrc: string | null;
}) {
  const open = pct <= accessPct;
  // One shared builder with the vendor-facing banner, so the two can never drift.
  const upgrade = open ? null : buildTierUpgradeCopy(pct, accessPct);
  // An offer the member can use is ALWAYS actionable. With a live portal session it opens the
  // offer itself; without one it runs the hand-off, because a cold deep link would dead-end.
  const linked = open && Boolean(href);
  const actionable = open && !linked;
  const upgradeHref = buildLockedOfferUpgradeHref(offerId);

  const value = highlight ? extractOfferValue(highlight) : null;

  const inner = (
    <>
      {/* Media. Fixed ratio keeps every card the same height in the grid regardless of whether
          the artwork is a wide wordmark, a square logo, or a photo. */}
      <span className="relative block aspect-[4/3] w-full overflow-hidden bg-white dark:bg-white/[.04]">
        <span className={cn("block h-full w-full", !open && "opacity-45 grayscale")}>
          <OfferMedia name={name} src={imageSrc} open={open} />
        </span>

        {/* The badge is the whole point of the card — the number, not the sentence. */}
        {open
          ? value && (
              <span className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-[3px] font-poppins text-[11px] font-black leading-none text-white shadow-sm">
                {value}
              </span>
            )
          : (
              <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-[3px] text-[10px] font-extrabold leading-none text-white backdrop-blur-sm">
                <Lock className="h-2.5 w-2.5" />
                {pct}%
              </span>
            )}

        {/* A locked card is the strongest upsell surface we have: the member has already
            told us which offer they want. Rather than dead-ending, the whole card leads to
            the plan that opens it — the CTA appears on hover/focus so browsing stays calm. */}
        {!open && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/75 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-black">
              Unlock this
            </span>
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <span className="truncate text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted-token">
          {category}
        </span>
        <span className="flex items-start gap-1">
          <span className="line-clamp-2 text-[12.5px] font-bold leading-[1.3] text-primary-token dark:text-white">
            {name}
          </span>
          {open && <ExternalLink className="mt-[3px] h-3 w-3 shrink-0 text-muted-token" />}
        </span>
        {/* Full vendor wording sits under the badge — the badge carries the number, this
            carries the meaning ("Cashback" vs "Discount" vs "off a wrap"). */}
        <span
          className={cn(
            "mt-auto line-clamp-2 text-[11px] font-semibold leading-[1.35]",
            open ? "text-red-600 dark:text-red-400" : "text-muted-token"
          )}
        >
          {open ? highlight : upgrade?.line ?? highlight}
        </span>
      </span>
    </>
  );

  const cls = cn(
    "group flex h-full w-full flex-col overflow-hidden rounded-[14px] border border-token bg-surface text-left shadow-sm",
    "motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2",
    open
      ? "hover:-translate-y-0.5 hover:border-red-600/40 hover:shadow-lg"
      : "opacity-80 hover:opacity-100"
  );

  return (
    <li className="flex">
      {linked ? (
        <a
          href={href as string}
          target="_blank"
          rel="noopener noreferrer"
          className={cls}
          title={`${name} — opens in the partner portal`}
        >
          {inner}
        </a>
      ) : actionable ? (
        // No portal session yet: run the hand-off rather than following a link that would
        // bounce to a login page. The member lands in the portal signed in.
        <button type="button" onClick={onColdOpen} className={cls} title={`${name} — opens the partner portal`}>
          {inner}
        </button>
      ) : (
        // LOCKED → the upgrade funnel, carrying the offer id so /membership can name the
        // offer and preselect the cheapest plan that opens it.
        <Link href={upgradeHref} className={cls} title={`${name} — see the membership that opens this`}>
          {inner}
        </Link>
      )}
    </li>
  );
}
