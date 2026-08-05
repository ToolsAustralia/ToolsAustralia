"use client";

/**
 * The two indicators the site header can carry, and the one rule that keeps them honest:
 * **a dot must mean something a person can act on.**
 *
 * There are exactly two, and they are different in kind — which is why they look different
 * and behave differently rather than sharing one implementation:
 *
 *   NEWS   `discountIsNew` — "there is a surface here you have not seen".
 *          Neutral gold. One-time. Clears permanently once they arrive at `/discount`.
 *
 *   STATUS `giveawayIsLive` — "a Major Draw is running right now".
 *          Brand red, pulsing. NOT dismissible, because it is not an announcement: it is a
 *          fact about the world that stops being true on its own. A dismissible status dot
 *          would let a member turn off the one signal that the thing they joined for is
 *          happening.
 *
 * The hamburger inherits `anyOnMobile` — the button is a container, not a subject, so it
 * shows a dot whenever something behind it does, and never carries one of its own.
 *
 * WHY A HOOK RATHER THAN LOGIC IN Header.tsx: the header is ~1,900 lines and renders both
 * navs. Two copies of "should this dot show" is two places for them to disagree, and the
 * mobile drawer disagreeing with the desktop row is precisely the bug a member would report
 * as "the badge is stuck".
 *
 * @module hooks/useNavNudges
 */

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import {
  hasSeenDiscountNavNudge,
  markDiscountNavNudgeSeen,
} from "@/utils/rewards-widget-spotlight-storage";

export interface NavNudges {
  /** Show the "new" dot on Discounts. */
  discountIsNew: boolean;
  /** Show the live dot on Giveaways. */
  giveawayIsLive: boolean;
  /** Either of the above — for the mobile hamburger, which stands in for both. */
  anyOnMobile: boolean;
  /** Call from the Discounts nav item's onClick, in BOTH navs. */
  markDiscountSeen: () => void;
}

export function useNavNudges(): NavNudges {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { data: currentDraw } = useCurrentMajorDraw();

  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  // localStorage does not exist on the server, and reading it during render would
  // hydrate-mismatch. So the first paint never shows the dot — which is also the right
  // default: a badge that flashes in and then vanishes is worse than one that arrives a beat
  // late.
  const [discountIsNew, setDiscountIsNew] = useState(false);

  useEffect(() => {
    setDiscountIsNew(!hasSeenDiscountNavNudge(userId));
  }, [userId]);

  /**
   * Resolve on ARRIVAL, not on click.
   *
   * The click handler is a convenience for the common path; this is the guarantee. A member
   * who reaches `/discount` from the footer, a promo link or a bookmark has seen the feature
   * just as surely as one who used the nav, and leaving the badge lit for them would make it
   * a permanent decoration.
   */
  useEffect(() => {
    if (pathname !== "/discount") return;
    markDiscountNavNudgeSeen(userId);
    setDiscountIsNew(false);
  }, [pathname, userId]);

  const markDiscountSeen = useCallback(() => {
    markDiscountNavNudgeSeen(userId);
    setDiscountIsNew(false);
  }, [userId]);

  // "Active" only. A draw that is `frozen` (the 30-minute pre-draw window) or `completed` is
  // not something a member can still act on, and a live dot pointing at a closed gate is a
  // worse lie than no dot.
  const giveawayIsLive = currentDraw?.status === "active";

  return {
    discountIsNew,
    giveawayIsLive,
    anyOnMobile: discountIsNew || giveawayIsLive,
    markDiscountSeen,
  };
}
