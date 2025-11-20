import { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { Star, Award } from "lucide-react";
import ProductCategories from "@/components/features/ProductCategories";
import MembershipSection from "@/components/sections/MembershipSection";
import ProductSection from "@/components/features/ProductSection";
import ProductInteractions from "./components/ProductInteractions";
import ProductTabs from "./components/ProductTabs";
import ShareButton from "./components/ShareButton";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { Product as ProductType } from "@/types/product";
import { ProductJsonLd, BreadcrumbJsonLd } from "@/components/seo/StructuredData";
import { createCachedQuery } from "@/utils/database/queries/server-queries";
import { getNonce } from "@/utils/security/getNonce";

interface ProductPageProps {
  params: Promise<{
    slug: string;
  }>;
}

// Cached function to fetch product data - prevents duplicate queries between generateMetadata and page component
const getProduct = createCachedQuery(async (slug: string): Promise<ProductType | null> => {
  try {
    await connectDB();
    const product = await Product.findOne({ _id: slug, isActive: true }).lean();
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
      .select("_id name price images brand category stock rating reviews isFeatured")
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
      `${product.brand} ${product.name} - Professional grade tools with ${product.rating}/5 rating. Starting at $${product.price}. Free shipping on orders over $99.`,
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
      "product:price:currency": "USD",
      "product:availability": product.stock && product.stock > 0 ? "in stock" : "out of stock",
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
    <div className="min-h-screen-svh bg-white">
      {/* JSON-LD structured data */}
      <ProductJsonLd
        name={`${product.brand} ${product.name}`}
        description={product.description}
        image={productImageUrl}
        brand={product.brand}
        category={product.category}
        offer={{
          price: product.price,
          priceCurrency: "USD",
          availability:
            product.stock && product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
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
          {/* Product Image - Single Main Image */}
          <div className="space-y-4">
            <div className="aspect-square bg-gray-100 rounded-2xl overflow-hidden">
              <Image
                src={product.images?.[0] || "/images/placeholder-product.jpg"}
                alt={product.name}
                width={600}
                height={600}
                className="w-full h-full object-cover"
                priority
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
                          "bg-gradient-to-r from-[#ee0000] to-red-600 text-white"
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
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 font-['Poppins']">{product.name}</h1>
            </div>

            {/* Rating & Reviews */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-5 h-5 ${
                      i < Math.floor(product.rating) ? "text-yellow-400 fill-current" : "text-gray-300"
                    }`}
                  />
                ))}
                <span className="ml-2 text-sm font-medium text-gray-700">{product.rating}</span>
              </div>
              <span className="text-sm text-gray-500">({product.reviews} reviews)</span>
            </div>

            {/* Price */}
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-[#ee0000] font-['Poppins']">${product.price}</span>
              <span className="text-sm text-gray-500 line-through">${(product.price * 1.2).toFixed(2)}</span>
              <span className="bg-gradient-to-r from-green-500 to-green-600 text-white px-2 py-1 rounded-full text-sm font-bold">
                Save 20%
              </span>
            </div>

            {/* Description */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-600 leading-relaxed">{product.description}</p>
            </div>

            {/* Interactive Components */}
            <ProductInteractions product={serializedProduct} />
          </div>
        </div>

        {/* Product Tabs */}
        <ProductTabs product={serializedProduct} />
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
