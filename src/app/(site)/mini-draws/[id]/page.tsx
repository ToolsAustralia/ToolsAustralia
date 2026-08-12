import { Metadata } from "next";
import { notFound } from "next/navigation";
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
  const filledPercentage =
    minimumEntries > 0 ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100)) : 0;

  /** Mobile-only answer to the three questions the hero no longer has room for. */
  const keyFacts = [
    { value: "$1", label: "Per entry", accent: false },
    { value: entriesRemaining.toLocaleString(), label: "Entries left", accent: false },
    { value: `${filledPercentage}%`, label: "Filled", accent: true },
  ];

  return (
    // `overflow-x-clip`, NOT `-hidden`: `overflow-x: hidden` computes `overflow-y: auto`,
    // which would make this div the scroll container for the sticky gallery column and stop
    // it engaging. `clip` suppresses horizontal overflow without creating a scroll box.
    <div className="min-h-screen-svh bg-gray-50 dark:bg-neutral-950 w-full overflow-x-clip">
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

      {/* Key facts strip — mobile only; the desktop hero still carries the $1 Entry card. */}
      <div className="grid grid-cols-3 gap-2 px-3.5 pb-1 pt-3 lg:hidden">
        {keyFacts.map((fact) => (
          <div
            key={fact.label}
            className="rounded-[14px] border border-[#F0F1F4] bg-white px-2 py-2.5 text-center dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div
              className={`text-[15px] font-extrabold leading-[1.15] ${
                fact.accent ? "text-[#16A34A]" : "text-[#111827] dark:text-white"
              }`}
            >
              {fact.value}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold text-[#9CA3AF]">{fact.label}</div>
          </div>
        ))}
      </div>

      {/* pb clears the mobile sticky "Enter draw" bar so it never covers the last card. */}
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pb-[78px] pt-2.5 sm:py-8 lg:pb-8">
        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          {/* Left Column — gallery. The wrapper is required: `sticky` applied directly to a
              grid item collapses it to content height and never engages. */}
          <div className="lg:self-stretch">
            <div className="lg:sticky lg:top-24">
              <MiniDrawImageGallery images={miniDrawData.prize.images} prizeName={miniDrawData.prize.name} />
            </div>
          </div>

          {/* Right Column — details. Scrolls past the sticky gallery, so it must NOT be sticky itself.
              Pack card first on BOTH breakpoints: desktop used to bury it under the description. */}
          <div className="flex flex-col gap-3 lg:gap-5">
            <MiniDrawInteractions miniDraw={miniDrawData} />

            {/* Description - collapsible on mobile, always open on desktop */}
            <CollapsibleSection
              title="About this prize"
              defaultOpen
              className="bg-white dark:bg-neutral-900 rounded-[20px] border border-[#EFF0F3] dark:border-neutral-800 p-3.5 sm:p-5"
            >
              <div
                className="text-[12.5px] sm:text-sm text-[#4B5563] dark:text-neutral-300 leading-[1.65] prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 last:[&>p]:mb-0"
                dangerouslySetInnerHTML={{ __html: miniDrawData.description }}
              />
            </CollapsibleSection>
          </div>
        </div>

        {/* Mini Draw Tabs */}
        <div className="mt-3 sm:mt-14">
          <MiniDrawTabs miniDraw={miniDrawData} />
        </div>

        {/* Related Mini Draws */}
        {serializedRelatedMiniDraws.length > 0 && (
          <RelatedMiniDraws draws={serializedRelatedMiniDraws} />
        )}
      </div>
    </div>
  );
}
