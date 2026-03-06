import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import MembershipSection from "@/components/sections/MembershipSection";
import ProductCard from "@/components/ui/ProductCard";
import MiniDrawImageGallery from "./components/MiniDrawImageGallery";
import MiniDrawInteractions from "./components/MiniDrawInteractions";
import MiniDrawTabs from "./components/MiniDrawTabs";
import ShareButton from "./components/ShareButton";
import MiniDrawViewTracking from "./components/MiniDrawViewTracking";
import ScrollToTopOnMount from "./components/ScrollToTopOnMount";
import { Trophy, ArrowLeft } from "lucide-react";
import connectDB from "@/lib/mongodb";
import MiniDraw, { IMiniDraw } from "@/models/MiniDraw";
import Winner, { IWinner } from "@/models/Winner";
import mongoose from "mongoose";
import { createCachedQuery } from "@/utils/database/queries/server-queries";
import { getCachedSession, getUserMembershipData } from "@/utils/database/queries/detail-page-queries";
import { getBrandMeta } from "@/utils/brand-utils";

interface MiniDrawDetailPageProps {
  params: Promise<{ id: string }>;
}

// Cached function to fetch mini draw data - prevents duplicate queries between generateMetadata and page component
const getMiniDraw = createCachedQuery(async (id: string): Promise<IMiniDraw | null> => {
  try {
    await connectDB();
    const miniDraw = (await MiniDraw.findById(id).lean()) as IMiniDraw | null;
    return miniDraw;
  } catch (error) {
    console.error("Error fetching mini draw:", error);
    return null;
  }
});

// Function to fetch related mini draws (no need for connectDB - already connected in parent)
async function getRelatedMiniDraws(currentMiniDrawId: string): Promise<IMiniDraw[]> {
  try {
    const relatedMiniDraws = await MiniDraw.find({
      _id: { $ne: new mongoose.Types.ObjectId(currentMiniDrawId) },
      status: "active",
    })
      .select("_id name status totalEntries minimumEntries prize")
      .sort({ createdAt: -1 })
      .limit(4)
      .lean();

    return (relatedMiniDraws as unknown as IMiniDraw[]) || [];
  } catch (error) {
    console.error("Error fetching related mini draws:", error);
    return [];
  }
}

export async function generateMetadata({ params }: MiniDrawDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const miniDraw = await getMiniDraw(id);

  if (!miniDraw) {
    return {
      title: "Mini Draw Not Found | Tools Australia",
      description: "The requested mini draw could not be found.",
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au";
  const miniDrawUrl = `${baseUrl}/mini-draws/${miniDraw._id}`;
  const prizeImageUrl = `${baseUrl}${miniDraw.prize.images[0] || "/images/placeholder-product.jpg"}`;
  const brandMeta = getBrandMeta(miniDraw.brandId);
  const brandLabel = brandMeta?.name ?? "Tools Australia";
  const metaDescription = `Win ${miniDraw.prize.name} with ${brandLabel}. Secure your entries before allocations close. ${miniDraw.description}`;

  return {
    title: `${miniDraw.prize.name} | Mini Draw | Tools Australia`,
    description: metaDescription,
    keywords: [
      miniDraw.prize.name,
      brandLabel,
      "mini draw",
      "tools australia",
      "giveaway",
      "competition",
      "professional tools",
      "Australia",
    ]
      .filter(Boolean)
      .join(", "),
    openGraph: {
      title: `${miniDraw.prize.name} - Mini Draw`,
      description: metaDescription,
      url: miniDrawUrl,
      siteName: "Tools Australia",
      images: [
        {
          url: prizeImageUrl,
          width: 1200,
          height: 630,
          alt: `${miniDraw.prize.name} - Mini Draw`,
        },
      ],
      type: "website",
      locale: "en_AU",
    },
    twitter: {
      card: "summary_large_image",
      title: `${miniDraw.prize.name} - Mini Draw`,
      description: metaDescription,
      images: [prizeImageUrl],
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
  };
}

export default async function MiniDrawDetailPage({ params }: MiniDrawDetailPageProps) {
  const { id } = await params;

  // Connect to DB once
  await connectDB();

  // Start session fetch in parallel (non-blocking)
  const sessionPromise = getCachedSession();

  // Fetch mini draw (uses cache if called by generateMetadata)
  const miniDraw = await getMiniDraw(id);

  if (!miniDraw) {
    notFound();
  }

  const relatedMiniDrawsPromise = getRelatedMiniDraws(id);
  const latestWinnerDocPromise = Winner.findOne({ drawId: miniDraw._id, drawType: "mini" })
    .populate("userId", "firstName lastName")
    .sort({ cycle: -1, createdAt: -1 })
    .lean<IWinner & { userId: { firstName?: string; lastName?: string } } | null>();

  const [session, relatedMiniDraws, latestWinnerDoc] = await Promise.all([
    sessionPromise,
    relatedMiniDrawsPromise,
    latestWinnerDocPromise,
  ]);

  // Get user membership data (only if authenticated)
  const { hasActiveMembership } = await getUserMembershipData(session?.user?.id);

  // Get user's entry count for this specific mini draw
  const userEntryCount = session?.user?.id
    ? miniDraw.entries.find((entry) => entry.userId.toString() === session.user.id)?.totalEntries || 0
    : 0;

  const minimumEntries = miniDraw.minimumEntries ?? 0;
  const totalEntries = miniDraw.totalEntries ?? 0;
  const entriesRemaining = Math.max(minimumEntries - totalEntries, 0);
  const _capacityPercentage = minimumEntries > 0 ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100)) : 0;

  // Convert to JSON-serializable format (include winner name for Recent Winners display)
  const latestWinnerData = latestWinnerDoc
    ? (() => {
        const uid = latestWinnerDoc.userId;
        const userObj = typeof uid === "object" && uid !== null && "firstName" in uid ? (uid as { firstName?: string; lastName?: string }) : null;
        return {
          _id: (latestWinnerDoc._id as mongoose.Types.ObjectId).toString(),
          winnerFirstName: userObj?.firstName ?? "",
          winnerLastName: userObj?.lastName ?? "",
          selectedDate: latestWinnerDoc.selectedDate.toISOString(),
          imageUrl: latestWinnerDoc.imageUrl,
        };
      })()
    : undefined;

  const miniDrawData = {
    _id: (miniDraw._id as mongoose.Types.ObjectId).toString(),
    name: miniDraw.name,
    description: miniDraw.description,
    status: miniDraw.status,
    brandId: miniDraw.brandId,
    cycle: miniDraw.cycle ?? 1,
    totalEntries,
    minimumEntries,
    entriesRemaining,
    requiresMembership: false, // ✅ AUTHENTICATION-ONLY: Mini draws available to all authenticated users
    hasActiveMembership, // Kept for UI/analytics purposes
    userEntryCount,
    prize: miniDraw.prize,
    latestWinner: latestWinnerData,
    createdAt: miniDraw.createdAt.toISOString(),
    updatedAt: miniDraw.updatedAt.toISOString(),
  };

  // Serialize related mini draws for ProductCard
  const serializedRelatedMiniDraws = relatedMiniDraws.map((draw) => {
    const drawId = (draw._id as mongoose.Types.ObjectId).toString();
    const drawMinEntries = draw.minimumEntries ?? 0;
    const drawTotalEntries = draw.totalEntries ?? 0;
    return {
      _id: drawId,
      name: draw.name,
      status: draw.status,
      brandId: draw.brandId,
      totalEntries: drawTotalEntries,
      minimumEntries: drawMinEntries,
      entriesRemaining: Math.max(drawMinEntries - drawTotalEntries, 0),
      isActive: draw.status === "active",
      requiresMembership: false, // ✅ AUTHENTICATION-ONLY: Mini draws available to all authenticated users
      hasActiveMembership,
      prize: {
        name: draw.prize.name,
        value: draw.prize.value,
        images: draw.prize.images || [],
      },
    };
  });

  const isCompleted = miniDrawData.status === "completed";
  const isCancelled = miniDrawData.status === "cancelled";
  const isActive = miniDrawData.status === "active" && miniDrawData.entriesRemaining > 0;
  const isSoldOut = miniDrawData.entriesRemaining <= 0 && miniDrawData.status === "active";
  const brandMeta = getBrandMeta(miniDraw.brandId);
  const brandLabel = brandMeta?.name ?? "Mini Draw";
  const brandBadgeClass = brandMeta
    ? `bg-gradient-to-r ${brandMeta.gradient} ${brandMeta.textClass ?? "text-white"}`
    : "bg-gradient-to-r from-gray-800 to-gray-900 text-white";

  return (
    <div className="min-h-screen-svh bg-white w-full overflow-x-hidden">
      <ScrollToTopOnMount miniDrawId={miniDrawData._id} />
      {/* Track ViewContent event for Facebook Pixel */}
      <MiniDrawViewTracking miniDraw={miniDrawData} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-36">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left Column - Images */}
          <div className="space-y-4">
            <MiniDrawImageGallery images={miniDrawData.prize.images} prizeName={miniDrawData.prize.name} />
          </div>

          {/* Right Column - Details */}
          <div className="space-y-6">
            {/* Status Badge and Share Button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-bold flex items-center gap-1 shadow-sm ${brandBadgeClass}`}
                >
                  <Trophy className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  {brandLabel}
                </span>
                {isActive && (
                  <span className="bg-gradient-to-r from-green-500 to-green-600 text-white px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-bold">
                    Active
                  </span>
                )}
                {isSoldOut && (
                  <span className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-bold">
                    Entries Closed
                  </span>
                )}
                {isCompleted && (
                  <span className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-bold">
                    Completed
                  </span>
                )}
                {isCancelled && (
                  <span className="bg-gradient-to-r from-red-500 to-red-600 text-white px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-bold">
                    Cancelled
                  </span>
                )}
              </div>
              <ShareButton name={miniDrawData.name} />
            </div>

            {/* Title */}
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-2 sm:mb-3 font-['Poppins']">
              {miniDrawData.name}
            </h1>

            {/* Entry Information */}
            <div className="w-full max-w-md">
              <div className="flex items-center text-xs sm:text-sm font-semibold text-gray-700">
                <span>
                  {entriesRemaining.toLocaleString()} entries remaining
                </span>
              </div>
            </div>

            {/* Description */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">Description</h3>
              <div
                className="text-sm sm:text-base text-gray-600 leading-relaxed prose prose-sm sm:prose-base max-w-none"
                dangerouslySetInnerHTML={{ __html: miniDrawData.description }}
              />
            </div>
          </div>
        </div>

        {/* Purchase Entries */}
        <div className="mt-10">
          <div className="bg-white ">
            <MiniDrawInteractions miniDraw={miniDrawData} />
          </div>
        </div>

        {/* Mini Draw Tabs */}
        <MiniDrawTabs miniDraw={miniDrawData} />

        {/* Related Mini Draws */}
        {serializedRelatedMiniDraws.length > 0 && (
          <section className="mt-16">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-base sm:text-xl font-bold text-gray-900">You May Also Like</h2>
              <Link href="/mini-draws" className="text-red-600 hover:text-red-700 font-medium flex items-center gap-1 text-sm sm:text-base">
                <span className="hidden sm:inline">View All Mini Draws</span>
                <span className="sm:hidden">View All</span>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {serializedRelatedMiniDraws.map((relatedDraw) => (
                <ProductCard key={relatedDraw._id} product={relatedDraw} viewMode="grid" />
              ))}
            </div>
          </section>
        )}
         {/* Membership Section */}
      <MembershipSection title="GET MORE ENTRIES WITH MEMBERSHIP" padding="py-8 sm:py-12 lg:pb-16 mb-16 " />
      </div>

     
    </div>
  );
}
