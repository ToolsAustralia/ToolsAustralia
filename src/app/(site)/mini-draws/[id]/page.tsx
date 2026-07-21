import { Metadata } from "next";
import { notFound } from "next/navigation";
import MembershipSection from "@/components/sections/MembershipSection";
import MiniDrawImageGallery from "./components/MiniDrawImageGallery";
import MiniDrawInteractions from "./components/MiniDrawInteractions";
import MiniDrawTabs from "./components/MiniDrawTabs";
import CollapsibleSection from "./components/CollapsibleSection";
import MiniDrawViewTracking from "./components/MiniDrawViewTracking";
import ScrollToTopOnMount from "./components/ScrollToTopOnMount";
import RelatedMiniDraws from "./components/RelatedMiniDraws";
import DetailHeroBanner from "./components/DetailHeroBanner";
import connectDB from "@/lib/mongodb";
import MiniDraw, { IMiniDraw } from "@/models/MiniDraw";
import Winner, { IWinner } from "@/models/Winner";
import mongoose from "mongoose";
import { createCachedQuery } from "@/utils/database/queries/server-queries";
import { getCachedSession, getUserMembershipData } from "@/utils/database/queries/detail-page-queries";
import { getBrandMeta } from "@/utils/brand-utils";

// nonce-CSP route class — must render per-request; never cache HTML with a baked nonce
// (see docs/security-csp/architecture.md "Route classes").
export const dynamic = "force-dynamic";

interface MiniDrawDetailPageProps {
  params: Promise<{ id: string }>;
}

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

async function getRelatedMiniDraws(currentMiniDrawId: string): Promise<IMiniDraw[]> {
  try {
    const relatedMiniDraws = await MiniDraw.find({
      _id: { $ne: new mongoose.Types.ObjectId(currentMiniDrawId) },
      status: "active",
    })
      .select("_id name status totalEntries minimumEntries prize brandId")
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
  await connectDB();

  const sessionPromise = getCachedSession();
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

  const { hasActiveMembership } = await getUserMembershipData(session?.user?.id);

  const userEntryCount = session?.user?.id
    ? miniDraw.entries.find((entry) => entry.userId.toString() === session.user.id)?.totalEntries || 0
    : 0;

  const minimumEntries = miniDraw.minimumEntries ?? 0;
  const totalEntries = miniDraw.totalEntries ?? 0;
  const entriesRemaining = Math.max(minimumEntries - totalEntries, 0);

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
    requiresMembership: false,
    hasActiveMembership,
    userEntryCount,
    prize: miniDraw.prize,
    latestWinner: latestWinnerData,
    createdAt: miniDraw.createdAt.toISOString(),
    updatedAt: miniDraw.updatedAt.toISOString(),
  };

  const serializedRelatedMiniDraws = relatedMiniDraws.map((draw) => {
    const drawId = (draw._id as mongoose.Types.ObjectId).toString();
    const drawMinEntries = draw.minimumEntries ?? 0;
    const drawTotalEntries = draw.totalEntries ?? 0;
    return {
      _id: drawId,
      name: draw.name,
      status: draw.status as "active" | "completed" | "cancelled",
      brandId: draw.brandId,
      totalEntries: drawTotalEntries,
      minimumEntries: drawMinEntries,
      entriesRemaining: Math.max(drawMinEntries - drawTotalEntries, 0),
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

  return (
    <div className="min-h-screen-svh bg-gray-50 dark:bg-neutral-950 w-full overflow-x-hidden">
      <ScrollToTopOnMount miniDrawId={miniDrawData._id} />
      <MiniDrawViewTracking miniDraw={miniDrawData} />

      {/* Hero Banner */}
      <DetailHeroBanner
        prizeName={miniDrawData.prize.name}
        drawName={miniDrawData.name}
        prizeImage={miniDrawData.prize.images[0]}
        brandLabel={brandLabel}
        brandGradient={brandMeta?.gradient}
        brandTextClass={brandMeta?.textClass}
        isActive={isActive}
        isSoldOut={isSoldOut}
        isCompleted={isCompleted}
        isCancelled={isCancelled}
        totalEntries={totalEntries}
        minimumEntries={minimumEntries}
        entriesRemaining={entriesRemaining}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          {/* Left Column - Images */}
          <div>
            <MiniDrawImageGallery images={miniDrawData.prize.images} prizeName={miniDrawData.prize.name} />
          </div>

          {/* Right Column - Details (sticky on desktop) */}
          <div className="lg:sticky lg:top-28 lg:self-start flex flex-col gap-5">
            {/* Purchase Entries — shown first on mobile via order */}
            <div className="order-first lg:order-2">
              <MiniDrawInteractions miniDraw={miniDrawData} />
            </div>

            {/* Description - collapsible on mobile, always open on desktop */}
            <CollapsibleSection
              title="About This Prize"
              className="order-2 lg:order-1 bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 p-4 sm:p-5 shadow-sm dark:shadow-lg"
            >
              <div
                className="text-sm text-gray-600 dark:text-neutral-300 leading-relaxed prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 last:[&>p]:mb-0"
                dangerouslySetInnerHTML={{ __html: miniDrawData.description }}
              />
            </CollapsibleSection>
          </div>
        </div>

        {/* Mini Draw Tabs - collapsible on mobile */}
        <div className="mt-10 sm:mt-14">
          <CollapsibleSection
            title="Winners & Draw Rules"
            hideDesktopTitle
            className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 shadow-sm dark:shadow-lg p-4 lg:bg-transparent lg:dark:bg-transparent lg:border-0 lg:dark:border-0 lg:shadow-none lg:dark:shadow-none lg:p-0"
          >
            <MiniDrawTabs miniDraw={miniDrawData} />
          </CollapsibleSection>
        </div>

        {/* Related Mini Draws */}
        {serializedRelatedMiniDraws.length > 0 && (
          <RelatedMiniDraws draws={serializedRelatedMiniDraws} />
        )}

        {/* Membership Section */}
        <MembershipSection title="GET MORE ENTRIES WITH MEMBERSHIP" padding="py-8 sm:py-12 lg:pb-16 mb-16" />
      </div>
    </div>
  );
}
