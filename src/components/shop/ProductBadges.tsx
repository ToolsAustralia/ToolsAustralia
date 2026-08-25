import { Zap, Check, Tag, Flame, Box, Star, Ticket } from "lucide-react";
import { cn } from "@/utils/cn";

/**
 * The shop badge system: two axes, two corners, a hard cap.
 *
 * WHAT THIS REPLACES. Badges used to accumulate until they collided — a discount
 * chip, an entries chip and a stock chip all competing in one corner, on a card
 * 165px wide. The fix is not "fewer badges", it is giving them somewhere to go:
 *
 *   - COMMERCE claims (scarcity, price, hype, merchandising) sit TOP LEFT, are
 *     RANKED, and never exceed two — a third collapses into a `+N` chip.
 *   - ENTRIES sit TOP RIGHT, because an entry is a different KIND of promise
 *     from a discount and reading them as one list invites the comparison that
 *     rule 11 forbids (see below).
 *   - FULFILMENT is not a badge at all. `In stock` / `Only N left` / `Made to
 *     order` render as a coloured dot and text in the card body, because it is a
 *     fact about the item rather than a merchandising claim, and as a chip it
 *     competed with the discount for the same attention.
 *
 * RULE 11 (LEGAL). An entries badge must never sit adjacent to a price in a way
 * that reads as a rate. The separate corner is not decoration — it is what stops
 * `50 ENTRIES` and `$69.95` being read as a price per entry. Entries are a free
 * inclusion; they are never sold. Keep the corners separate in anything that
 * consumes this.
 *
 * DATA THAT DOES NOT EXIST YET. `hot`, `bundle` and `backInStock` are in the rank
 * table because the ORDER is the design decision worth recording, but `Product`
 * carries no field for any of them today (verified against src/models/Product.ts).
 * No caller passes them, so no speculative UI ships; when a field lands, it is one
 * argument at the call site rather than a re-think of the ranking.
 */

/** Fixed rank: scarcity → price → hype → merchandising. Index is the priority. */
const RANK = ["stock", "backInStock", "discount", "hot", "new", "bundle", "featured"] as const;
type CommerceKind = (typeof RANK)[number];

export interface ProductBadgeInput {
  /** Units left. Only consulted when `trackInventory` is true. */
  stock?: number;
  /**
   * Print-to-order items sit at `stock: 0` forever, so an unconditional scarcity
   * check would brand every merch item "0 LEFT". Absent = true, matching the model.
   */
  trackInventory?: boolean;
  /** The member discount that applies to this product, if any. */
  discountPercent?: number;
  isFeatured?: boolean;
  /** Derived from createdAt by the caller — this module does not own "recent". */
  isNew?: boolean;
  /** No model field yet — see the docblock. */
  hot?: boolean;
  bundle?: boolean;
  backInStock?: boolean;
  /** Entries axis. Rendered top-right, never beside a price. */
  includedEntries?: number;
  entryMultiplier?: number | null;
}

interface BadgeSpec {
  kind: CommerceKind | "overflow" | "entries" | "multiplier";
  label: string;
  /** Background — a hex, an rgba, or a gradient. */
  fill: string;
  ink: string;
  border?: string;
  Icon?: typeof Zap;
}

const COMMERCE: Record<CommerceKind, (i: ProductBadgeInput) => BadgeSpec | null> = {
  stock: (i) =>
    i.trackInventory !== false && typeof i.stock === "number" && i.stock > 0 && i.stock <= 5
      ? { kind: "stock", label: `${i.stock} LEFT`, fill: "#EE0000", ink: "#fff", Icon: Zap }
      : null,
  backInStock: (i) =>
    i.backInStock
      ? { kind: "backInStock", label: "BACK IN STOCK", fill: "#22C55E", ink: "#06240F", Icon: Check }
      : null,
  discount: (i) =>
    i.discountPercent && i.discountPercent > 0
      ? {
          kind: "discount",
          label: `${i.discountPercent}% OFF`,
          fill: "#0FB3C4",
          ink: "#04262A",
          Icon: Tag,
        }
      : null,
  hot: (i) =>
    i.hot
      ? {
          kind: "hot",
          label: "HOT",
          fill: "linear-gradient(90deg,#F97316,#EE0000)",
          ink: "#fff",
          Icon: Flame,
        }
      : null,
  // Inverse of the page, so it reads as a stamp rather than a colour claim.
  new: (i) => (i.isNew ? { kind: "new", label: "NEW", fill: "#0A0A0B", ink: "#FFFFFF" } : null),
  bundle: (i) =>
    i.bundle
      ? {
          kind: "bundle",
          label: "SET",
          fill: "rgba(10,10,11,.72)",
          ink: "#fff",
          border: "rgba(255,255,255,.32)",
          Icon: Box,
        }
      : null,
  featured: (i) =>
    i.isFeatured
      ? { kind: "featured", label: "FEATURED", fill: "#F5C542", ink: "#3A2C00", Icon: Star }
      : null,
};

/**
 * The ranked, capped commerce badges for a product.
 *
 * Exported separately from the component so the rule can be asserted without a
 * DOM — the cap and the overflow count are the parts that break silently.
 */
export function resolveCommerceBadges(input: ProductBadgeInput): BadgeSpec[] {
  const all = RANK.map((kind) => COMMERCE[kind](input)).filter((b): b is BadgeSpec => b !== null);
  if (all.length <= 2) return all;
  return [
    ...all.slice(0, 2),
    {
      kind: "overflow",
      label: `+${all.length - 2}`,
      fill: "rgba(10,10,11,.74)",
      ink: "#fff",
      border: "rgba(255,255,255,.26)",
    },
  ];
}

/** The entries axis. Separate function, separate corner — see rule 11 above. */
export function resolveEntryBadges(input: ProductBadgeInput): BadgeSpec[] {
  const out: BadgeSpec[] = [];
  // Strictly above zero. Merch ships at includedEntries: 0, and "0 free entries"
  // states a promise the business is not making.
  if (input.includedEntries && input.includedEntries > 0) {
    out.push({
      kind: "entries",
      label: `${input.includedEntries} ENTRIES`,
      fill: "rgba(238,0,0,.9)",
      ink: "#fff",
      Icon: Ticket,
    });
  }
  if (input.entryMultiplier && input.entryMultiplier > 1) {
    out.push({
      kind: "multiplier",
      label: `${input.entryMultiplier}×`,
      fill: "rgba(245,158,11,.94)",
      ink: "#3A2400",
      Icon: Zap,
    });
  }
  return out;
}

function Badge({ spec, size }: { spec: BadgeSpec; size: "sm" | "lg" }) {
  const { Icon } = spec;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-extrabold uppercase tracking-[.02em] whitespace-nowrap",
        size === "sm" ? "h-5 px-[7px] text-[9px]" : "h-[26px] rounded-lg px-[10px] text-[11px]"
      )}
      style={{
        background: spec.fill,
        color: spec.ink,
        ...(spec.border ? { border: `1px solid ${spec.border}` } : {}),
      }}
    >
      {Icon ? <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden /> : null}
      {spec.label}
    </span>
  );
}

/**
 * Both corners, positioned over a product image.
 *
 * The parent must be `relative`. Corners are separate stacks rather than one
 * flex row so a long commerce badge can never push an entries badge off-card.
 */
export function ProductBadges({
  input,
  size = "sm",
  className,
}: {
  input: ProductBadgeInput;
  size?: "sm" | "lg";
  className?: string;
}) {
  const left = resolveCommerceBadges(input);
  const right = resolveEntryBadges(input);
  if (left.length === 0 && right.length === 0) return null;

  return (
    <div className={cn("pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2", className)}>
      <div className="flex flex-wrap items-start gap-1">
        {left.map((b) => (
          <Badge key={b.kind + b.label} spec={b} size={size} />
        ))}
      </div>
      <div className="flex flex-col items-end gap-1">
        {right.map((b) => (
          <Badge key={b.kind + b.label} spec={b} size={size} />
        ))}
      </div>
    </div>
  );
}

/**
 * Fulfilment, as a dot and a line of text — deliberately NOT a chip.
 *
 * "Made to order" replaces "Sold out" whenever `trackInventory` is false: a
 * print-to-order garment is always available and never in stock, and the two
 * words mean opposite things to a buyer.
 */
export function FulfilmentLine({
  stock,
  trackInventory,
  className,
}: {
  stock?: number;
  trackInventory?: boolean;
  className?: string;
}) {
  const tracked = trackInventory !== false;
  const sold = tracked && typeof stock === "number" && stock <= 0;
  const low = tracked && typeof stock === "number" && stock > 0 && stock <= 5;

  const label = !tracked ? "Made to order" : sold ? "Sold out" : low ? `Only ${stock} left` : "In stock";
  const dot = !tracked
    ? "bg-amber-500"
    : sold
      ? "bg-neutral-400 dark:bg-neutral-600"
      : low
        ? "bg-red-600"
        : "bg-green-500";

  return (
    <span
      className={cn(
        // nowrap + shrink-0: on a 189px card "Only 3 left" wrapped to two lines and
        // pushed the name down, so cards with a scarce item sat taller than their
        // neighbours. The fulfilment line is short and fixed; the brand beside it is
        // the half that can afford to truncate.
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold text-muted-token",
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      {label}
    </span>
  );
}
