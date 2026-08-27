import { Metadata } from "next";
import { notFound } from "next/navigation";

import Link from "next/link";
import { Star, Award, ChevronRight } from "lucide-react";
import MembershipSection from "@/components/sections/MembershipSection";
import ShopProductCard from "@/components/shop/ShopProductCard";
import ProductInteractions from "./components/ProductInteractions";
import ProductGallery from "./components/ProductGallery";
import ProductTabs from "./components/ProductTabs";
import ShareButton from "./components/ShareButton";
import ProductViewTracking from "./components/ProductViewTracking";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { Product as ProductType } from "@/types/product";
import { ProductJsonLd, BreadcrumbJsonLd } from "@/components/seo/StructuredData";
import { createCachedQuery } from "@/utils/database/queries/server-queries";
import { getNonce } from "@/utils/security/getNonce";
import { FLAT_SHIPPING_RATE_LABEL } from "@/config/shop";
import { shouldShowReviews, displayableReviews, displayAverage } from "@/utils/shop/reviews";
// Client component, deliberately: this page is server-rendered and cannot read
// who is signed in, and the member price has to be the signed-in member's own.
// It ships in the ProductCard module, which this route already loads for the
// related-products row below.
import { ViewerPriceBlock } from "@/components/shop/ViewerPriceBlock";
import { loadShopEntryMultipliers } from "@/services/shop/resolveShopEntryMultiplier";
import { resolveEntryMultiplierFor } from "@/utils/shop/entry-multiplier";

// nonce-CSP route class — must render per-request; never cache HTML with a baked nonce
// (see docs/security-csp/architecture.md "Route classes").
export const dynamic = "force-dynamic";

interface ProductPageProps {
  params: Promise<{
    slug: string;
  }>;
}

// Cached function to fetch product data - prevents duplicate queries between generateMetadata and page component
const getProduct = createCachedQuery(async (slug: string): Promise<ProductType | null> => {
  try {
    await connectDB();
    // -printArtwork and -printProvider: this read is UNPROJECTED and the whole
    // document is serialised into the RSC payload for the client components
    // below, so anything on it is one view-source away for any visitor. The
    // print-ready design files are our supplier-facing assets on permanent public
    // Cloudinary URLs; publishing them hands anyone the artwork to print their own.
    // reviews.userId is the same class of leak. The reviews API strips it through
    // toPublicReview, but this page bypasses that route entirely, so every
    // reviewer's user id would ship in the page source of the product they
    // reviewed — tying an identifiable account to a purchase.
    // Same reasoning as the printProvider comment in models/Product.ts.
    const product = await Product.findOne({ _id: slug, isActive: true })
      .select("-printArtwork -printProvider -reviews.userId")
      .lean();
    return product as unknown as ProductType | null;
  } catch (error) {
    console.error("Error fetching product:", error);
    return null;
  }
});

// Function to fetch related products (no need for connectDB - already connected in parent)
async function getRelatedProducts(productId: string, brand: string, category: string): Promise<ProductType[]> {
  try {
    const relatedProducts = await Product.find({
      _id: { $ne: productId },
      $or: [{ brand }, { category }],
      isActive: true,
    })
      // trackInventory is REQUIRED here, not optional polish: ProductCard defaults a
      // missing value to "tracked", so omitting it from this projection made every
      // print-to-order related product render as "Sold Out" — while the same product's
      // own page correctly said "Made to order". includedEntries rides along so a card
      // can show the free-entry inclusion. reviewCount, NOT reviews: the array
      // carries every review body and reviewer userId, and this is serialised into
      // the page like everything else here. The card only needs the count.
      .select(
        "_id name price images brand category stock trackInventory includedEntries entryMultiplier rating reviewCount displayRating displayReviewCount isFeatured"
      )
      .limit(4)
      .lean();

    return relatedProducts as unknown as ProductType[];
  } catch (error) {
    console.error("Error fetching related products:", error);
    return [];
  }
}

// Generate metadata for SEO and social sharing
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    return {
      title: "Product Not Found | Tools Australia",
      description: "The product you're looking for doesn't exist.",
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au";
  const productUrl = `${baseUrl}/shop/${product._id}`;
  const productImageUrl = `${baseUrl}${product.images[0]}`;

  return {
    title: `${product.name} - ${product.brand} | Tools Australia`,
    description:
      product.description ||
      `${product.brand} ${product.name} - Professional grade tools with ${product.rating}/5 rating. Starting at ${product.price}. ${FLAT_SHIPPING_RATE_LABEL} flat delivery on every order.`,
    keywords: [
      product.name,
      product.brand,
      product.category || "tools",
      "professional tools",
      "Australia",
      "power tools",
      "hand tools",
    ]
      .filter(Boolean)
      .join(", "),
    openGraph: {
      title: `${product.name} - ${product.brand}`,
      description:
        product.description ||
        `Professional ${product.brand} tool with ${product.rating}/5 rating. Starting at $${product.price}.`,
      url: productUrl,
      siteName: "Tools Australia",
      images: [
        {
          url: productImageUrl,
          width: 1200,
          height: 630,
          alt: `${product.brand} ${product.name}`,
        },
      ],
      type: "website",
      locale: "en_AU",
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} - ${product.brand}`,
      description:
        product.description ||
        `Professional ${product.brand} tool with ${product.rating}/5 rating. Starting at $${product.price}.`,
      images: [productImageUrl],
      site: "@toolsaustralia",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    alternates: {
      canonical: productUrl,
    },
    other: {
      "product:price:amount": product.price.toString(),
      "product:price:currency": "AUD",
      // Print-to-order items sit at stock 0 forever, so a bare stock check published
      // "out of stock" to Google and every social crawler for the entire catalogue.
      "product:availability":
        product.trackInventory === false || (product.stock && product.stock > 0)
          ? "in stock"
          : "out of stock",
      "product:condition": "new",
      "product:brand": product.brand,
      "product:category": product.category || "Tools",
    },
  };
}

// Note: Static generation is disabled since we're using dynamic database data
// export async function generateStaticParams() {
//   // This would require fetching all products from database
//   // For now, we'll use dynamic rendering
// }

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { slug } = await params;

  // Connect to DB once
  await connectDB();

  // Fetch product (uses cache if called by generateMetadata)
  const product = await getProduct(slug);

  if (!product) {
    notFound();
  }

  /**
   * Specification lookup, case- and space-insensitive.
   *
   * `specifications` is a free-text map an admin types into, so the same fact
   * arrives as "Fabric", "fabric" or "Fabric " depending on who entered it.
   * Matching loosely here means a spec card renders when the data is there rather
   * than only when it was typed the way this file expects.
   */
  const specLookup = (product.specifications ?? {}) as Record<string, string>;
  const findSpec = (key: string) => {
    const want = key.toLowerCase();
    const hit = Object.keys(specLookup).find((k) => k.trim().toLowerCase() === want);
    return hit ? specLookup[hit] : undefined;
  };
  const specs = { fabric: findSpec("fabric"), print: findSpec("print") };

  // Fetch related products in parallel (no need to wait for product to complete)
  const relatedProducts = await getRelatedProducts(product._id.toString(), product.brand, product.category || "");

  // Serialize Mongoose documents to plain objects for client components
  const serializedProduct = JSON.parse(JSON.stringify(product));

  // The multiplier in force for this product, resolved server-side because two of
  // its three tiers (category, shop-wide) are admin config the browser has no
  // business reading in full. Most specific wins: product, then category, then
  // shop-wide, then 1x. One helper serves this page, the listing API and the
  // webhook grant, so what is printed is what is granted.
  const shopMultipliers = await loadShopEntryMultipliers();
  const entryMultiplier = resolveEntryMultiplierFor(
    { category: product.category, entryMultiplier: product.entryMultiplier },
    shopMultipliers
  );

  /*
    The related grid needs the SAME treatment.

    It queries Product directly rather than going through /api/products, so nothing
    resolved its tiers — ProductCard fell back to 1x and the multiplier badge
    vanished on this grid alone, while the identical card on /shop showed it. The
    config is already loaded above, so this costs no extra read.
  */
  const serializedRelatedProducts = (
    JSON.parse(JSON.stringify(relatedProducts)) as ProductType[]
  ).map((related) => ({
    ...related,
    entryMultiplier: resolveEntryMultiplierFor(
      { category: related.category, entryMultiplier: related.entryMultiplier },
      shopMultipliers
    ),
  }));

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");
  const productUrl = `${baseUrl}/shop/${product._id}`;
  const productImageUrl = `${baseUrl}${product.images[0]}`;

  // Get CSP nonce from request headers (set by middleware in production)
  const nonce = await getNonce();

  // Only four-star-and-above reviews are shown, and the star row must describe
  // those rather than Product.rating, which averages the hidden ones too.
  const shownReviews = displayableReviews(product.reviews);
  const shownAverage = displayAverage(shownReviews);

  return (
    // overflow-x-clip, NOT -hidden: `overflow-x: hidden` computes `overflow-y: auto`,
    // which makes this element the scroll container for the sticky image column and stops
    // it engaging. `clip` suppresses horizontal overflow without creating a scroll box.
    // Same reasoning as the mini-draw detail page.
    <div className="min-h-screen-svh bg-white dark:bg-neutral-950 w-full overflow-x-clip">
      {/* Track ViewContent event for Facebook Pixel */}
      <ProductViewTracking product={serializedProduct} />
      {/* JSON-LD structured data */}
      <ProductJsonLd
        name={`${product.brand} ${product.name}`}
        description={product.description}
        image={productImageUrl}
        brand={product.brand}
        category={product.category}
        offer={{
          price: product.price,
          priceCurrency: "AUD",
          availability:
            product.trackInventory === false || (product.stock && product.stock > 0)
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          url: productUrl,
        }}
        nonce={nonce}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "Home", item: `${baseUrl}/` },
          { name: "Shop", item: `${baseUrl}/shop` },
          { name: `${product.brand} ${product.name}`, item: productUrl },
        ]}
        nonce={nonce}
      />
      {/* Product Detail */}
      {/*
        Top padding is DERIVED from the header, not a fixed pt-36.

        pt-36 is 144px against a header that measures 60px on a phone, so the page
        opened with 84px of dead space above the product — the first thing anyone
        saw was empty page. The header's own height already lives in
        --app-header-h / --app-header-h-lg (the same variables the checkout page
        pads with), so clearing it is exact at every breakpoint instead of a
        guess that happened to suit one.
      */}
      {/*
        FLUSH TO THE HEADER on a phone.

        --app-header-h is a flat 86px constant (globals.css) that exists to replace
        ~34 pt-[86px] literals. The site header actually renders 60px at this
        breakpoint, so padding by the variable left a 26px band of page showing
        between the header and the product image — and the image is meant to be
        edge to edge.

        60px is therefore the measured height of the header this page renders under,
        not a guess. Desktop keeps the variable, where it matches.
      */}
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-[60px] sm:px-6 lg:px-8 lg:pt-[calc(var(--app-header-h-lg)+1.5rem)]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Product Image. The outer wrapper is REQUIRED: `sticky` applied directly to a
              grid item collapses it to content height and never engages, so the image would
              scroll away from the options it belongs to. Mirrors the mini-draw gallery
              column (mini-draws/[id]/page.tsx). Desktop only — on a phone the image sits
              above the details and there is nothing to stick to. */}
          <div className="lg:self-stretch">
            <div className="space-y-4 lg:sticky lg:top-24">
              {/* Client-side because apparel galleries follow the selected colour;
                  a tool with no colourways renders exactly as it did before. */}
              {/* serializedProduct, NOT product: `colourways` is an array of Mongoose
                  SUBDOCUMENTS, so each one carries an `_id` that is a BSON ObjectId
                  wrapping a Buffer. React Server Components can only hand plain
                  objects to a client component, and an ObjectId has a toJSON method
                  — which throws "Only plain objects can be passed to Client
                  Components". `images` is a plain string[] and was never the problem,
                  but it reads from the same source here so the two cannot drift. */}
              <ProductGallery
                productId={String(product._id)}
                name={product.name}
                images={serializedProduct.images ?? []}
                colourways={serializedProduct.colourways ?? []}
                badges={{
                  price: product.price,
                  stock: product.stock,
                  trackInventory: serializedProduct.trackInventory,
                  isFeatured: serializedProduct.isFeatured,
                  includedEntries: serializedProduct.includedEntries,
                  entryMultiplier,
                }}
              />
            </div>
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            {/* Brand & Name */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-sm font-bold px-3 py-1 rounded-full shadow-md ${
                      // DeWalt - Yellow/Black
                      product.brand.toLowerCase().includes("dewalt")
                        ? "bg-gradient-to-r from-yellow-400 to-yellow-500 text-black"
                        : // Makita - Brand Cyan/Teal
                        product.brand.toLowerCase().includes("makita")
                        ? "bg-gradient-to-r from-makita-500 to-makita-700 text-white" // Makita brand colors
                        : // Milwaukee - Red
                        product.brand.toLowerCase().includes("milwaukee")
                        ? "bg-gradient-to-r from-red-600 to-red-700 text-white"
                        : // Kincrome - Blue
                        product.brand.toLowerCase().includes("kincrome")
                        ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white"
                        : // Sidchrome - Silver/Gray
                        product.brand.toLowerCase().includes("sidchrome")
                        ? "bg-gradient-to-r from-gray-400 to-gray-500 text-white"
                        : // Bosch - Green/Blue
                        product.brand.toLowerCase().includes("bosch")
                        ? "bg-gradient-to-r from-green-600 to-blue-600 text-white"
                        : // Stanley - Yellow/Black
                        product.brand.toLowerCase().includes("stanley")
                        ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-black"
                        : // Ryobi - Green/Lime
                        product.brand.toLowerCase().includes("ryobi")
                        ? "bg-gradient-to-r from-lime-500 to-green-500 text-black"
                        : // Black & Decker - Orange/Black
                        product.brand.toLowerCase().includes("black") && product.brand.toLowerCase().includes("decker")
                        ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white"
                        : // Festool - Green
                        product.brand.toLowerCase().includes("festool")
                        ? "bg-gradient-to-r from-green-700 to-green-800 text-white"
                        : // Default fallback
                          "bg-gradient-to-r from-red-600 to-red-600 text-white"
                    }`}
                  >
                    {product.brand}
                  </span>
                  {product.isFeatured && (
                    <span className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                      <Award className="w-3 h-3" />
                      Featured
                    </span>
                  )}
                </div>
                <ShareButton name={product.name} brand={product.brand} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-neutral-100 mb-3 font-poppins">{product.name}</h1>
            </div>

            {/* Rating row, shown only above the gate. A brand-new print-to-order
                garment has no reviews, and five grey stars beside "(0 reviews)"
                reads as a bad product rather than a new one. */}
            {shouldShowReviews({ displayableCount: shownReviews.length }) && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-5 h-5 ${
                      i < Math.floor(shownAverage) ? "text-yellow-400 fill-current" : "text-gray-300 dark:text-neutral-700"
                    }`}
                  />
                ))}
                <span className="ml-2 text-sm font-medium text-gray-700 dark:text-neutral-200">{shownAverage}</span>
              </div>
              <span className="text-sm text-gray-500 dark:text-neutral-400">({shownReviews.length} {shownReviews.length === 1 ? "review" : "reviews"})</span>
              </div>
            )}

            {/*
              Price. One number, because there is only one number.

              This block used to render `product.price * 1.2` struck through beside a
              "Save 20%" badge — a former price that never existed, invented in the
              template for EVERY product. Advertising a saving against a price the
              item was never sold at is a misleading former-price representation
              under Australian Consumer Law, and it was on every product page.

              If a genuine sale price is wanted later, it needs a real
              `originalPrice` on the product (the field already exists on the query
              type) plus evidence the item was actually sold at it — not arithmetic
              on the current price.
            */}
            {/*
              MemberPriceLine owns the whole price on this page now. It used to
              render a 3xl red full price ABOVE a small green member box, which put
              the visual weight on the number a member does not pay.

              It still never strikes through a price the viewer would actually be
              charged — see the comment in MemberPriceLine. A member sees their own
              price as the headline with the shelf price struck; everyone else sees
              the real price as the headline and the membership as an offer.
            */}
            {/* Client boundary: this page is a server component and cannot read the
                session, and user={null} is not neutral — it renders the GUEST price to
                a member who already holds the discount. */}
            <ViewerPriceBlock priceDollars={product.price} variant="pdp" />

            {/* Interactive Components */}
            <ProductInteractions product={serializedProduct} entryMultiplier={entryMultiplier} />

            {/*
              THE DESCRIPTION SITS BELOW THE PICKERS, not above them.

              Someone on a product page is deciding between sizes, not reading — the
              copy pushed the colour row and the buy button down a screen on mobile
              for text most buyers skim after they have already chosen. Moving it
              under the pickers puts the decision first and the detail second.
            */}
            <div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-neutral-100">The detail</h3>
              <p className="leading-relaxed text-gray-600 dark:text-neutral-400">{product.description}</p>

              {/*
                The four facts worth surfacing, 2-up.

                FABRIC and PRINT come from the product's own specifications, so a
                tool that has neither simply shows fewer cells rather than an empty
                label. MADE and SHIPS are DERIVED — "to order" is trackInventory
                being false, and the delivery line reads FLAT_SHIPPING_RATE_LABEL.

                The design's SHIPS cell says "$10 · free over $150". That threshold
                was removed on 2026-08-25, so printing it would promise a discount
                that no cart can produce. It states the real flat rate instead.
              */}
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {[
                  { label: "Fabric", value: specs.fabric },
                  { label: "Print", value: specs.print },
                  {
                    label: "Made",
                    /*
                      NO NUMBER HERE, DELIBERATELY.

                      This read "To order · 3–5 days". Nothing supplied that
                      figure: the print provider's API carries no turnaround,
                      production-time or lead-time field, and no supplier
                      turnaround is recorded anywhere in the repo. It was five
                      hard-coded words on every made-to-order item.

                      It also contradicted a policy the rest of the system
                      holds on purpose — CUSTOMER.md states no delivery date is
                      ever promised, and Cobber is grounded to say "we'd rather
                      not quote a delivery date we can't stand behind". The
                      product page was the one surface handing one out.

                      And it read shorter than it was: this cell sits beside
                      "Ships", with nothing saying the days elapse BEFORE the
                      courier is involved. The signal a buyer actually needs is
                      that the garment does not exist yet — that is what "Made
                      to order" says, without representing a date we cannot
                      substantiate.
                    */
                    value: serializedProduct.trackInventory === false ? "Made to order" : "In stock",
                  },
                  { label: "Ships", value: `${FLAT_SHIPPING_RATE_LABEL} flat, Australia-wide` },
                ]
                  .filter((cell) => Boolean(cell.value))
                  .map((cell) => (
                    <div
                      key={cell.label}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="text-[10px] font-extrabold uppercase tracking-[.1em] text-gray-400 dark:text-neutral-500">
                        {cell.label}
                      </div>
                      <div className="mt-0.5 text-[13px] font-bold text-gray-900 dark:text-white">{cell.value}</div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Tabs live INSIDE the right column, not below the grid.
                This is what gives the sticky image something to stick against: the
                sticky element can only travel within its own grid row, so while the
                tabs sat outside it the two columns were near-equal height (692px vs a
                579px image) and the image scrolled away after ~113px. Putting the tabs
                here makes the right column tall, which is exactly how the mini-draw
                detail page is built. */}
            <ProductTabs product={serializedProduct} />
          </div>
        </div>
      </div>

      {/* Related Products Section */}
      {/*
        "Goes with it" — a rail on a phone, a 4-up grid from md.

        Same card vocabulary as the shop grid, reduced: these end in VIEW rather
        than an add control. A related card must not add to cart — for a variant
        product that would be a lie, and mixing the two behaviours across cards
        that look identical is worse than one consistent behaviour.
      */}
      {serializedRelatedProducts.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-poppins text-[20px] font-extrabold tracking-[-.02em] text-gray-900 dark:text-white sm:text-[26px]">
              Goes with it
            </h2>
            <Link
              href="/shop"
              className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold text-red-600 hover:text-red-700"
            >
              All gear
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          {/*
            A rail below md so four cards do not squeeze to nothing on a phone;
            a grid above it. `-mx-4` lets the rail bleed to the screen edges so a
            card is visibly cut off, which is what tells someone it scrolls.
          */}
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0">
            {serializedRelatedProducts.slice(0, 4).map((p) => (
              <div key={String(p._id)} className="w-[44vw] shrink-0 snap-start sm:w-[32vw] md:w-auto">
                <ShopProductCard variant="related" product={p as never} />
              </div>
            ))}
          </div>
        </section>
      )}



      {/* Membership Section */}
      <MembershipSection title="UNLOCK EXCLUSIVE MEMBER BENEFITS" padding="py-16 mb-8" />
    </div>
  );
}
