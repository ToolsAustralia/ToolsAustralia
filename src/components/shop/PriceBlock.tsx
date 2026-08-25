import { cn } from "@/utils/cn";
import { resolveMemberShopPrice } from "@/utils/shop/member-discount";
import type { ShopDiscountUserInput } from "@/utils/shop/member-discount";

/**
 * The price, stated once, the same way everywhere it appears.
 *
 * WHAT IT SOLVES. A shop with a member discount has to answer two different
 * questions with one block of text: "what do I pay?" for a member, and "what
 * would I save?" for everyone else. Answering both with one layout is what
 * produced the earlier mess of struck-through numbers where the largest figure
 * on the card was the one nobody paid.
 *
 * So the emphasis MOVES with who is reading:
 *
 *   - A MEMBER sees their own price as the headline, the RRP struck through
 *     beside it, and what they saved underneath. The big number is the one that
 *     leaves their account.
 *   - A GUEST sees the RRP as the headline — that IS their price — and a gold
 *     prompt naming the member price as an invitation rather than a discount
 *     they already have.
 *
 * Both halves come from `resolveMemberShopPrice`, which runs the same
 * `resolveShopDiscountPercent` and `priceCart` the till runs. A second copy of
 * either is how a shop shows one price and charges another.
 *
 * RULE 11. Nothing here may state or imply a per-entry rate. Entries are a free
 * inclusion and live in their own corner (`ProductBadges`) and their own callout
 * — never inside this block, and never as a line that could be read against the
 * price sitting next to it.
 */

export interface PriceBlockProps {
  /** GST-inclusive list price, in dollars, exactly as stored on the product. */
  priceDollars: number;
  /** The viewer, for their own tier. Null/undefined renders the guest treatment. */
  user: ShopDiscountUserInput | null | undefined;
  /**
   * `card` is the compact listing row; `pdp` is the full block with the tier chip
   * and the GST note. They differ in scale and in how much they explain — a card
   * has no room to teach the discount, a product page does.
   */
  variant?: "card" | "pdp";
  className?: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;

export function PriceBlock({ priceDollars, user, variant = "card", className }: PriceBlockProps) {
  const member = resolveMemberShopPrice(priceDollars, user);
  const isPdp = variant === "pdp";

  // No tier discounts the shop at all — state the one price plainly rather than
  // rendering a "0% off" scaffold with nothing in it.
  if (!member) {
    return (
      <div className={cn("flex flex-col", className)}>
        <span
          className={cn(
            "font-extrabold tracking-[-.02em] text-primary-token",
            isPdp ? "text-[29px] leading-none tracking-[-.025em] sm:text-[40px] sm:tracking-[-.03em]" : "text-[15.5px] sm:text-[21px]"
          )}
        >
          {money(priceDollars)}
        </span>
        {isPdp ? <span className="mt-1.5 text-[11px] text-muted-token">GST included</span> : null}
      </div>
    );
  }

  // A MEMBER: their price leads, the RRP is the reference.
  if (member.isMember) {
    return (
      <div className={cn("flex flex-col", className)}>
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className={cn(
              "font-extrabold tracking-[-.02em] text-primary-token",
              isPdp ? "text-[29px] leading-none tracking-[-.025em] sm:text-[40px] sm:tracking-[-.03em]" : "text-[15.5px] sm:text-[21px]"
            )}
          >
            {member.priceLabel}
          </span>
          <span className={cn("font-semibold text-muted-token line-through", isPdp ? "text-[15px] sm:text-[18px]" : "text-[11px] sm:text-[13px]")}>
            {member.fullPriceLabel}
          </span>
          {isPdp ? (
            <span
              className="inline-flex h-[22px] items-center rounded-md px-2 text-[10px] font-extrabold uppercase tracking-[.05em]"
              style={{ background: "#F5C542", color: "#3A2C00" }}
            >
              {member.tierName}
            </span>
          ) : null}
        </span>
        <span className={cn("flex flex-wrap items-baseline gap-x-2", isPdp ? "mt-1.5" : "mt-0.5")}>
          <span
            className={cn(
              "font-bold text-shop-save-text dark:text-shop-save-text-dark",
              isPdp ? "text-[13px]" : "text-[10.5px]"
            )}
          >
            {isPdp ? `You save ${member.savingLabel}` : `Save ${member.savingLabel}`}
          </span>
          {isPdp ? (
            <>
              <span className="text-[11px] text-muted-token" aria-hidden>·</span>
              <span className="text-[11px] text-muted-token">GST included</span>
            </>
          ) : null}
        </span>
      </div>
    );
  }

  // A GUEST: the RRP is what they pay, so it leads. The member price is an offer,
  // not a strike-through — striking the price a guest actually pays reads as a
  // discount they are already getting.
  return (
    <div className={cn("flex flex-col", className)}>
      <span
        className={cn(
          "font-extrabold tracking-[-.02em] text-primary-token",
          isPdp ? "text-[29px] leading-none tracking-[-.025em] sm:text-[40px] sm:tracking-[-.03em]" : "text-[15.5px] sm:text-[21px]"
        )}
      >
        {member.fullPriceLabel}
      </span>
      <span className={cn("flex flex-wrap items-baseline gap-x-2", isPdp ? "mt-2" : "mt-0.5")}>
        <span className={cn("font-bold", isPdp ? "text-[12.5px]" : "text-[10px]")} style={{ color: "#F5C542" }}>
          {isPdp
            ? `${member.tierName} members pay ${member.priceLabel} — join and save`
            : `${member.tierName} ${member.priceLabel}`}
        </span>
        {isPdp ? (
          <>
            <span className="text-[11px] text-muted-token" aria-hidden>·</span>
            <span className="text-[11px] text-muted-token">GST included</span>
          </>
        ) : null}
      </span>
    </div>
  );
}
