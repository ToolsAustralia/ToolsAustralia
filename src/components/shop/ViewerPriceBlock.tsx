"use client";

import { useUserContext } from "@/contexts/UserContext";
import { PriceBlock, type PriceBlockProps } from "@/components/shop/PriceBlock";

/**
 * `PriceBlock` for the signed-in viewer, on a page that cannot read the session.
 *
 * The product page is a SERVER component — deliberately, so the catalogue renders
 * without a round trip — which means it has no access to who is signed in. Passing
 * `user={null}` from there is not a neutral default: it renders the GUEST
 * treatment, so a Foreman would be shown the full price and invited to "join and
 * save" a discount they already hold.
 *
 * This is the client boundary that fixes that, and nothing more. `PriceBlock`
 * itself stays a pure function of its props so it can be reasoned about and
 * rendered from anywhere; only this wrapper knows about context.
 */
export function ViewerPriceBlock(props: Omit<PriceBlockProps, "user">) {
  const { userData } = useUserContext();
  return <PriceBlock {...props} user={userData} />;
}
