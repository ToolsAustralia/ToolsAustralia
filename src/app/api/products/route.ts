import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";
import { loadShopEntryMultipliers } from "@/services/shop/resolveShopEntryMultiplier";
import { resolveEntryMultiplierFor } from "@/utils/shop/entry-multiplier";
// import { Product as ProductType, ProductSearchResult } from "@/types/product"; // TODO: Use for type validation

// Next.js ISR configuration
export const revalidate = 60; // Revalidate every 60 seconds (ISR)

/**
 * Params the shop filters send once per selected value (?size=S&size=M).
 *
 * They have to be read with `getAll()`: `Object.fromEntries(searchParams.entries())`
 * keeps only the LAST value of a repeated key, so selecting two sizes — or two
 * categories, or two brands — silently narrowed to whichever one came last.
 */
const MULTI_VALUE_PARAMS = ["category", "brand", "size", "colour"] as const;

const multiValueParam = z.array(z.string()).optional();

// Query parameters validation
const querySchema = z.object({
  page: z.string().optional().default("1"),
  limit: z.string().optional().default("12"),
  category: multiValueParam,
  brand: multiValueParam,
  /** Apparel facets. These live on `variants[]`, not on the product itself. */
  size: multiValueParam,
  colour: multiValueParam,
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  /**
   * "Show only" toggles from the shop's filter rail.
   *
   * Both read fields the catalogue ALREADY carries — this exposes them as query
   * params, it does not add a concept. `hasEntries` is includedEntries > 0;
   * `readyToShip` is a product that can be dispatched now rather than made.
   *
   * Accepted as the string "true" because that is what a URLSearchParams round
   * trip produces; anything else is simply absent.
   */
  hasEntries: z.string().optional(),
  readyToShip: z.string().optional(),
  /**
   * `includedEntries` sorts the "Most free entries" option. The others were
   * already here; this is the one the redesigned sort menu added.
   */
  sortBy: z
    .enum(["name", "price", "rating", "createdAt", "displayOrder", "includedEntries"])
    .optional()
    .default("displayOrder"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  featured: z.string().optional(),
  search: z.string().optional(),
});

/**
 * A filter value is a literal catalogue string ("XL", "Black Heather"), never a
 * pattern. Unescaped, a brand such as "Ryobi (ONE+)" reaches Mongo as an invalid
 * regular expression, which fails the whole listing rather than matching nothing.
 */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Substring and case-insensitive — the match category and brand already had, widened
 * to accept several values. The case tolerance is load-bearing: /shop/brand/dewalt
 * passes the URL slug, which still has to find the stored "DeWALT".
 */
const containsAnyOf = (values: string[]) => ({ $in: values.map((v) => new RegExp(escapeRegex(v), "i")) });

/**
 * Anchored and case-insensitive. Sizes cannot use the substring match above: "S"
 * would also match XS, XXS and every other size ending in S, which returns nearly
 * the whole catalogue. Facet values come from /api/products/categories exactly as
 * stored, so only the casing needs forgiving.
 */
const equalsAnyOf = (values: string[]) => ({ $in: values.map((v) => new RegExp(`^${escapeRegex(v)}$`, "i")) });

/**
 * Explicit include-list, mirroring the related-products projection on the product
 * page (src/app/(site)/shop/[slug]/page.tsx). An unprojected find() ships every
 * field a garment carries — hundreds of `variants`, the whole `reviews` array,
 * `printArtwork`, the full description — for twelve cards that render none of it.
 *
 * Two of these are load-bearing, not padding, because dropping them fails silently:
 *  - `trackInventory` — ProductCard reads a missing value as tracked stock, so
 *    leaving it out renders every print-to-order item "Sold Out".
 *  - `reviewCount` — the listing card gates its star row on the same rule as the
 *    product page, and needs a count to do it without this query shipping every
 *    review body and reviewer id to the browser. `colourways` is deliberately
 *    ABSENT: only the product detail page renders them, and on a 51-colour tee
 *    it is the single heaviest field on the document.
 *    per colour, unlike `variants[]`, which runs to hundreds of rows on one tee.
 *
 * `reviews` is the one field the related-products list carries that this one does
 * not: every row is a full review subdocument, and no card on the listing renders
 * one. `printArtwork` and `printProvider` stay off for a different reason — they
 * are supplier-facing, and the product page projects them out too.
 *
 * `variants.isActive` — ONE subfield, and the array is replaced by a derived
 * `hasVariants` boolean before the response is built, so the browser never sees a
 * variant row. A card has to know whether a product is CHOSEN or ADDED: a garment
 * is bought as a size, so its card must route to the product page instead of
 * guessing one. Without this the grid saw `variants: undefined` on every product,
 * treated every garment as a simple item, and added it with no sku — which the
 * cart route correctly rejects with a 400, leaving the button spinning on a
 * request that could never succeed.
 */
const LIST_FIELDS =
  "_id name price images brand category stock trackInventory includedEntries entryMultiplier displayOrder " +
  "rating reviewCount displayRating displayReviewCount isFeatured createdAt updatedAt variants.isActive";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const query: Record<string, string | string[] | undefined> = Object.fromEntries(searchParams.entries());
    for (const key of MULTI_VALUE_PARAMS) {
      const values = searchParams
        .getAll(key)
        .map((value) => value.trim())
        .filter(Boolean);
      // Overwrite unconditionally: the single string copied in above would fail the
      // array schema when the param is present but blank.
      query[key] = values.length > 0 ? values : undefined;
    }

    // Validate query parameters
    let validatedQuery;
    try {
      validatedQuery = querySchema.parse(query);
    } catch (validationError) {
      return NextResponse.json({ error: "Invalid query parameters", details: validationError }, { status: 400 });
    }

    // Build filter object
    const filter: Record<string, unknown> = { isActive: true };

    if (validatedQuery.category) {
      filter.category = containsAnyOf(validatedQuery.category);
    }

    if (validatedQuery.brand) {
      filter.brand = containsAnyOf(validatedQuery.brand);
    }

    // Size and colour are variant properties, so a product qualifies when ONE active
    // variant satisfies every selected facet. $elemMatch is what ties both conditions
    // to the same variant: someone asking for Black in L wants a garment that exists
    // in Black L, not one that sells black tees and, separately, an L in another
    // colour.
    if (validatedQuery.size || validatedQuery.colour) {
      filter.variants = {
        $elemMatch: {
          // The same predicate the facet endpoint counts with, so the filter rail
          // cannot offer a value that returns nothing.
          isActive: { $ne: false },
          ...(validatedQuery.size ? { size: equalsAnyOf(validatedQuery.size) } : {}),
          ...(validatedQuery.colour ? { colour: equalsAnyOf(validatedQuery.colour) } : {}),
        },
      };
    }

    // Has free entries. Strictly above zero, which is also the rule every entries
    // surface renders on — merch ships at 0, so this filter is currently the
    // difference between "the tool catalogue" and "nothing".
    if (validatedQuery.hasEntries === "true") {
      filter.includedEntries = { $gt: 0 };
    }

    /*
      Ready to ship — in stock NOW, as opposed to made on demand.

      Deliberately not "stock > 0": a print-to-order garment sits at stock 0
      forever and is always available, so that test would exclude exactly the
      items that are never out of stock. The question this filter answers is "can
      it be dispatched today", and only a stock-TRACKED product with units on hand
      can be.
    */
    if (validatedQuery.readyToShip === "true") {
      filter.trackInventory = true;
      filter.stock = { $gt: 0 };
    }

    if (validatedQuery.minPrice || validatedQuery.maxPrice) {
      const priceFilter: Record<string, number> = {};
      if (validatedQuery.minPrice) {
        priceFilter.$gte = parseFloat(validatedQuery.minPrice);
      }
      if (validatedQuery.maxPrice) {
        priceFilter.$lte = parseFloat(validatedQuery.maxPrice);
      }
      filter.price = priceFilter;
    }

    if (validatedQuery.featured === "true") {
      filter.isFeatured = true;
    }

    if (validatedQuery.search) {
      // Escaped for the same reason as the facets above: a shopper typing "c++" is
      // naming a product, not writing a regular expression Mongo is entitled to
      // reject.
      const term = escapeRegex(validatedQuery.search);
      filter.$or = [
        { name: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
        { brand: { $regex: term, $options: "i" } },
        { category: { $regex: term, $options: "i" } },
      ];
    }

    // Build sort object
    // The admin's manual catalogue order is the DEFAULT the storefront shows.
    // Without this the reorder UI would be a no-op that looks like it works —
    // cards move in admin, customers see no change.
    //
    // displayOrder is always ascending (position 1 is first) regardless of
    // sortOrder, which only makes sense for value-like fields. When a customer
    // picks an explicit sort (price, name, rating) it wins, and displayOrder
    // becomes the tiebreak so equal values stay in the curated order.
    const sort: Record<string, 1 | -1> = {};
    if (validatedQuery.sortBy === "displayOrder") {
      sort.displayOrder = 1;
    } else {
      sort[validatedQuery.sortBy] = validatedQuery.sortOrder === "asc" ? 1 : -1;
      sort.displayOrder = 1;
    }

    // Calculate pagination
    const page = parseInt(validatedQuery.page);
    const limit = parseInt(validatedQuery.limit);
    const skip = (page - 1) * limit;

    // Execute query with timeout and optimization
    const queryTimeout = 10000; // 10 seconds timeout

    const [rawProducts, totalCount, entryCaps] = (await Promise.race([
      Promise.all([
        Product.find(filter).select(LIST_FIELDS).sort(sort).skip(skip).limit(limit).lean().maxTimeMS(queryTimeout),
        Product.countDocuments(filter).maxTimeMS(queryTimeout),
        // One config read for the whole page, not one per product.
        loadShopEntryMultipliers(),
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Query timeout")), queryTimeout)),
    ])) as [Record<string, unknown>[], number, Awaited<ReturnType<typeof loadShopEntryMultipliers>>];

    // Collapse the tier chain server-side and hand each row ONE number. The
    // category and shop-wide settings are admin config the browser has no
    // business holding, and resolving here is what stops a listing card and the
    // product page printing different entry counts for the same product.
    const products = rawProducts.map((p) => {
      // Derive, then DROP. The array is projected to one boolean per row purely so
      // this question can be answered; shipping it would put hundreds of rows per
      // garment on the wire for a card that renders none of them.
      const { variants, ...rest } = p as Record<string, unknown> & {
        variants?: { isActive?: boolean }[];
      };
      return {
        ...rest,
        hasVariants: Array.isArray(variants) && variants.some((v) => v?.isActive !== false),
        entryMultiplier: resolveEntryMultiplierFor(
          {
            category: p.category as string | undefined,
            entryMultiplier: p.entryMultiplier as number | null | undefined,
          },
          entryCaps
        ),
      };
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json(
      {
        products,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", // Cache 1min, serve stale up to 5min
        },
      }
    );
  } catch (error) {
    console.error("Error fetching products:", error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message === "Query timeout") {
        return NextResponse.json({ error: "Query timeout - please try again" }, { status: 408 });
      }

      if (error.message.includes("MongoServerError")) {
        return NextResponse.json({ error: "Database connection error" }, { status: 503 });
      }
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid query parameters", details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to fetch products" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
