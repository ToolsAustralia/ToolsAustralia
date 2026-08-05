"use client";

/**
 * `/discount` — the public partner-discount catalogue.
 *
 * WHY IT IS PUBLIC, AND WHY EVERYTHING READS IN THE CLEAR
 * The discount IS the hook. A visitor who cannot see what the 1,833 offers actually are has
 * been asked to buy a membership on trust; a visitor who can read "Free wheel alignment —
 * BROWN'S TYRE SERVICE" has been shown the product. So nothing about an offer is withheld,
 * signed out included. What a membership buys is the ability to **redeem** — and the list
 * is stacked by the access level each offer needs, so the member scrolls and physically
 * hits the seam where their access stops.
 *
 * SISTER SURFACE: `/my-account/rewards/catalogue` answers "what can I use right now" for a
 * signed-in member and defaults to hiding everything else. This page answers "what is in
 * there at all" for anyone, and defaults to showing all of it. They share the generated
 * catalogue and the portal hand-off; they deliberately do not share a default.
 *
 * Payload: the browse table is ~88 KB and is imported by these two routes only — never by a
 * marketing surface (the brand wall takes a ~93-row slice instead).
 */

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { useDashboardState } from "@/hooks/useDashboardState";
import { useDebounce } from "@/hooks/useDebounce";
import { useMemberships } from "@/hooks/useMemberships";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { convertToLocalPlan } from "@/utils/membership/membership-adapters";
import MembershipModal from "@/components/modals/MembershipModal/LazyMembershipModal";
import { usePortalHandoff } from "@/components/sections/rewards/PortalHandoff";
import { buildPartnerPortalOfferUrl } from "@/utils/partner-discounts/portal-offer-url";
import DiscountAccessMeter from "@/components/sections/discount/DiscountAccessMeter";
import DiscountFilters from "@/components/sections/discount/DiscountFilters";
import DiscountOfferList from "@/components/sections/discount/DiscountOfferList";
import DiscountOfferModal from "@/components/sections/discount/DiscountOfferModal";
import DiscountAccessModal from "@/components/sections/discount/DiscountAccessModal";
import {
  ALL_ROWS,
  buildBands,
  filterAndSortRows,
  fmtAu,
  redeemableCount,
  PARTNER_CATALOG_TOTAL,
  type DiscountRow,
  type DiscountSort,
  type DiscountUnlockRoute,
} from "@/utils/partner-discounts/discount-catalogue";

/** Rows before "Show more". 1,833 nodes at once is a needless DOM cost on every filter change. */
const PAGE_SIZE = 24;
const PAGE_STEP = 24;

export default function DiscountPageClient() {
  const router = useRouter();
  const { status } = useSession();
  const dash = useDashboardState();

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string | null>(null);
  const [openOnly, setOpenOnly] = React.useState(false);
  const [sort, setSort] = React.useState<DiscountSort>("access");
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [openRow, setOpenRow] = React.useState<DiscountRow | null>(null);
  const [accessOpen, setAccessOpen] = React.useState(false);
  const debouncedQuery = useDebounce(query, 200);

  const signedIn = status === "authenticated";
  const viewerPct = signedIn ? (dash.partnerAccessPct ?? 0) : 0;
  const sourceLabel = dash.tierLabel ?? (signedIn ? "Member" : "Not signed in");
  const redeemable = redeemableCount(viewerPct, signedIn);

  const { subscriptionPackages, oneTimePackages } = useMemberships();
  const membershipModal = useMembershipModal();
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();

  const sso = usePortalHandoff({
    memberName: dash.user?.firstName,
    tierLabel: dash.subscriptionTierLabel,
    accessPct: viewerPct,
    // Same reasoning as the member catalogue: this page holds the member's filters, scroll
    // position and the offer they tapped, and a same-tab hand-off loses all three.
    openInNewTab: true,
  });

  const filtered = React.useMemo(
    () =>
      filterAndSortRows(ALL_ROWS, {
        query: debouncedQuery,
        category,
        openOnly,
        sort,
        viewerPct,
        signedIn,
      }),
    [debouncedQuery, category, openOnly, sort, viewerPct, signedIn]
  );

  // Reset paging whenever the result set changes underneath the reader.
  React.useEffect(() => setLimit(PAGE_SIZE), [debouncedQuery, category, openOnly, sort]);

  const visible = React.useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const bands = React.useMemo(
    () => buildBands(visible, { viewerPct, signedIn, banded: sort === "access" }),
    [visible, viewerPct, signedIn, sort]
  );

  const reset = React.useCallback(() => {
    setQuery("");
    setCategory(null);
    setOpenOnly(false);
    setLimit(PAGE_SIZE);
  }, []);

  /**
   * A redeemable offer goes to the portal. A cold deep link dead-ends on a login page, so
   * the hand-off warms the session first and lands the member on the offer itself.
   */
  const redeem = React.useCallback(
    (row: DiscountRow) => {
      const url = buildPartnerPortalOfferUrl(row.id);
      if (url) sso.startForOffer(url);
      else sso.start();
      setOpenRow(null);
    },
    [sso]
  );

  const goToLogin = React.useCallback(() => {
    setOpenRow(null);
    router.push("/login?callbackUrl=%2Fdiscount");
  }, [router]);

  /**
   * Buying a route opens the membership modal ON THIS PAGE — no navigation.
   *
   * The member is mid-thought about one specific offer. Sending them to /membership throws
   * away the popup, their filters and their scroll position to re-ask a question they have
   * already answered by tapping the tile. Closing the discount popup first matters: two
   * stacked overlays at the same z-layer would trap focus behind the wrong one.
   *
   * The plan object comes from `useMemberships` (the same catalog the package modals use),
   * matched on the catalog `_id` the route carries. If it has not loaded yet we open the
   * picker rather than a payment step with nothing selected.
   */
  const selectRoute = React.useCallback(
    (route: DiscountUnlockRoute) => {
      setOpenRow(null);
      setAccessOpen(false);
      const pool = route.kind === "membership" ? subscriptionPackages : oneTimePackages;
      const apiPlan = (pool ?? []).find((p) => p._id === route.packageId);
      whenGatesOpenElseGateModal(() => {
        // `useMemberships` yields the API shape (features as strings); the modal wants the
        // local one. Same adapter every other CTA uses — do not hand-roll the mapping.
        if (apiPlan) membershipModal.openModal(convertToLocalPlan(apiPlan));
        else membershipModal.openModalWithPackageSelectionFirst();
      });
    },
    [subscriptionPackages, oneTimePackages, whenGatesOpenElseGateModal, membershipModal]
  );

  return (
    <div className="ta-discount pt-[var(--app-header-h)]" style={{ background: "var(--dc-bg)" }}>
      <div
        className="relative"
        style={{ backgroundImage: "var(--dc-shell-image)" }}
      >
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-[17px] px-4 py-8 sm:px-6 sm:py-11 lg:px-8">
          {/* No visible hero — the meter opens the page. It already states the same fact with
              real numbers ("917 of 1,833 redeemable"), which a headline could only assert.
              The h1 stays for screen readers and search: a public indexed route with no
              heading at all is a genuine regression, and this costs nothing visually. */}
          <h1 className="sr-only">Partner discounts</h1>

          <DiscountAccessMeter
            signedIn={signedIn}
            viewerPct={viewerPct}
            sourceLabel={sourceLabel}
            redeemable={redeemable}
            onOpenAccess={() => setAccessOpen(true)}
          />

          <DiscountFilters
            query={query}
            onQueryChange={setQuery}
            category={category}
            onCategoryChange={setCategory}
            openOnly={openOnly}
            onOpenOnlyChange={setOpenOnly}
            sort={sort}
            onSortChange={setSort}
            signedIn={signedIn}
            resultCount={filtered.length}
            onReset={reset}
          />

          <div className="flex flex-col gap-[9px]">
            {filtered.length === 0 ? (
              <EmptyState onReset={reset} />
            ) : (
              <DiscountOfferList
                bands={bands}
                viewerPct={viewerPct}
                signedIn={signedIn}
                onOpenOffer={setOpenRow}
              />
            )}

            {filtered.length > limit && (
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE_STEP)}
                className="ta-dc-btn mt-1 w-full font-sans font-extrabold"
                style={{
                  height: 50,
                  borderRadius: 14,
                  border: "1px solid var(--dc-ln2)",
                  background: "var(--dc-chip)",
                  color: "var(--dc-tx)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Show {fmtAu(filtered.length - limit)} more
              </button>
            )}

            {/* NEVER claim the catalogue is complete — our snapshot is known to be missing
                offers the vendor's portal carries. Saying so is cheaper than a member
                concluding we do not have a brand we do. */}
            <p
              className="mt-1.5 font-sans font-semibold"
              style={{ fontSize: 11, lineHeight: 1.5, color: "var(--dc-mu2)", textWrap: "pretty" }}
            >
              A slice of our snapshot. The portal has offers our list does not.
            </p>
          </div>
        </div>
      </div>

      {openRow && (
        <DiscountOfferModal
          row={openRow}
          viewerPct={viewerPct}
          signedIn={signedIn}
          sourceLabel={sourceLabel}
          onClose={() => setOpenRow(null)}
          onRedeem={redeem}
          onLogin={goToLogin}
          onSelectRoute={selectRoute}
        />
      )}

      {accessOpen && (
        <DiscountAccessModal
          viewerPct={viewerPct}
          signedIn={signedIn}
          onClose={() => setAccessOpen(false)}
          onOpenPortal={() => {
            setAccessOpen(false);
            sso.start();
          }}
          onSelectRoute={selectRoute}
        />
      )}

      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan}
        membershipModalConfig={{ showPackageSelectionFirst: membershipModal.openWithPackageSelectionFirst }}
        planIsDefaultSelection={membershipModal.openWithPackageSelectionFirst}
      />

      {sso.overlay}
    </div>
  );
}

/**
 * The empty state never says the offer does not exist — our snapshot is incomplete, so
 * "we don't carry it" would be a claim we cannot back. It offers the portal instead.
 */
function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-2.5 text-center"
      style={{
        padding: "40px 26px",
        borderRadius: 17,
        background: "var(--dc-sf)",
        border: "1px solid var(--dc-ln)",
      }}
    >
      <span
        className="font-poppins font-black"
        style={{ fontSize: 15, lineHeight: 1.3, color: "var(--dc-tx)" }}
      >
        Nothing in our list matches that
      </span>
      <span
        className="font-sans font-semibold"
        style={{
          fontSize: 12.5,
          lineHeight: 1.5,
          color: "var(--dc-mu)",
          maxWidth: "48ch",
          textWrap: "pretty",
        }}
      >
        Our snapshot may be missing offers the portal has. Try another category, or search the
        portal.
      </span>
      <div className="mt-1 flex flex-wrap justify-center gap-2.5">
        <button
          type="button"
          onClick={onReset}
          className="ta-dc-btn font-sans font-extrabold"
          style={{
            height: 44,
            padding: "0 18px",
            borderRadius: 13,
            border: "1px solid var(--dc-ln2)",
            background: "var(--dc-chip)",
            color: "var(--dc-tx)",
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          Clear filters
        </button>
        <Link
          href="/my-account/rewards"
          className="ta-dc-btn inline-flex items-center font-sans font-extrabold"
          style={{
            height: 44,
            padding: "0 18px",
            borderRadius: 13,
            border: 0,
            background: "linear-gradient(180deg,#ff2a2a,#ee0000 62%,#c40d0d)",
            color: "#fff",
            fontSize: 12.5,
          }}
        >
          Search the portal
        </Link>
      </div>
      <span className="sr-only">{fmtAu(PARTNER_CATALOG_TOTAL)} offers in the catalogue</span>
    </div>
  );
}
