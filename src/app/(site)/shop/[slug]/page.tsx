import { Metadata } from "next";
import { notFound } from "next/navigation";

import { Star, Award } from "lucide-react";
import ProductCategories from "@/components/features/ProductCategories";
import MembershipSection from "@/components/sections/MembershipSection";
import ProductSection from "@/components/features/ProductSection";
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
import { FREE_SHIPPING_THRESHOLD_LABEL } from "@/config/shop";
import { shouldShowReviews } from "@/utils/shop/reviews";
// Client component, deliberately: this page is server-rendered and cannot read
// who is signed in, and the member price has to be the signed-in member's own.
// It ships in the ProductCard module, which this route already loads for the
// related-products row below.
import { MemberPriceLine } from "@/components/ui/ProductCard";

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
      // can show the free-entry inclusion.
      .select(
        "_id name price images brand category stock trackInventory includedEntries rating reviews isFeatured"
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
      `${product.brand} ${product.name} - Professional grade tools with ${product.rating}/5 rating. Starting at $${product.price}. Free shipping on orders of ${FREE_SHIPPING_THRESHOLD_LABEL} or more.`,
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

  // Fetch related products in parallel (no need to wait for product to complete)
  const relatedProducts = await getRelatedProducts(product._id.toString(), product.brand, product.category || "");

  // Serialize Mongoose documents to plain objects for client components
  const serializedProduct = JSON.parse(JSON.stringify(product));
  const serializedRelatedProducts = JSON.parse(JSON.stringify(relatedProducts));

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");
  const productUrl = `${baseUrl}/shop/${product._id}`;
  const productImageUrl = `${baseUrl}${product.images[0]}`;

  // Get CSP nonce from request headers (set by middleware in production)
  const nonce = await getNonce();

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-36">
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
              <ProductGallery
                productId={String(product._id)}
                name={product.name}
                images={product.images ?? []}
                colourways={product.colourways ?? []}
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
            {shouldShowReviews({
              rating: product.rating,
              reviewCount: Array.isArray(product.reviews) ? product.reviews.length : 0,
            }) && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-5 h-5 ${
                      i < Math.floor(product.rating) ? "text-yellow-400 fill-current" : "text-gray-300 dark:text-neutral-700"
                    }`}
                  />
                ))}
                <span className="ml-2 text-sm font-medium text-gray-700 dark:text-neutral-200">{product.rating}</span>
              </div>
              <span className="text-sm text-gray-500 dark:text-neutral-400">({Array.isArray(product.reviews) ? product.reviews.length : 0} reviews)</span>
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
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-red-600 font-poppins">${product.price}</span>
            </div>

            {/* The member price sits beside the shelf price, never struck through
                it: a strikethrough reads as a former price, which is the exact
                misrepresentation the block above was removed for. A member is
                quoted their own tier; everyone else sees the best tier's price,
                which is what the membership is worth to them. */}
            <MemberPriceLine price={product.price} variant="detail" />

            {/* Description */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-2">Description</h3>
              <p className="text-gray-600 dark:text-neutral-400 leading-relaxed">{product.description}</p>
            </div>

            {/* Interactive Components */}
            <ProductInteractions product={serializedProduct} />

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
      <ProductSection
        title="Related Products"
        products={serializedRelatedProducts}
        showViewAll={true}
        viewAllLink="/shop"
      />

      {/* Product Categories Section */}
      <ProductCategories />

      {/* Membership Section */}
      <MembershipSection title="UNLOCK EXCLUSIVE MEMBER BENEFITS" padding="py-16 mb-8" />
    </div>
  );
}
