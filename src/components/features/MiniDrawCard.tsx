"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Ticket, Flame, Zap } from "lucide-react";
import { getBrandMeta, defaultBrandLogo } from "@/utils/brand-utils";
import BrandLogoCard from "@/components/ui/BrandLogoCard";
import EntryProgressBar from "@/components/ui/EntryProgressBar";
import { useUserContext } from "@/contexts/UserContext";
import { useMiniDraw } from "@/hooks/queries/useMiniDrawQueries";
import { cn } from "@/utils/cn";

export interface MiniDrawCardData {
  _id: string;
  name: string;
  status: "active" | "completed" | "cancelled";
  totalEntries: number;
  minimumEntries: number;
  entriesRemaining?: number;
  brandId?: string;
  prize: {
    name: string;
    value: number;
    images: string[];
  };
}

interface MiniDrawCardProps {
  miniDraw: MiniDrawCardData;
  index?: number;
  viewMode?: "grid" | "list";
}

function getUrgencyBadge(percentage: number, status: string) {
  if (status !== "active") return null;
  if (percentage >= 90)
    return {
      label: "Almost Full",
      icon: Flame,
      className:
        "bg-gradient-to-r from-red-600 to-red-675 text-white shadow-lg shadow-red-600/30",
    };
  if (percentage >= 70)
    return {
      label: "Hot",
      icon: Zap,
      className:
        "bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-lg shadow-amber-400/30",
    };
  return null;
}

export default function MiniDrawCard({
  miniDraw,
  index = 0,
  viewMode = "grid",
}: MiniDrawCardProps) {
  const prefersReduced = useReducedMotion();
  const { userData, isAuthenticated } = useUserContext();

  const { data: liveData } = useMiniDraw(miniDraw._id);

  const totalEntries = liveData?.totalEntries ?? miniDraw.totalEntries ?? 0;
  const minimumEntries =
    liveData?.minimumEntries ?? miniDraw.minimumEntries ?? 0;
  const entriesRemaining =
    liveData?.entriesRemaining ??
    miniDraw.entriesRemaining ??
    Math.max(minimumEntries - totalEntries, 0);
  const percentage =
    minimumEntries > 0
      ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100))
      : 0;

  const _isActive = miniDraw.status === "active" && entriesRemaining > 0;
  const isClosed =
    miniDraw.status === "completed" ||
    (miniDraw.status === "active" && entriesRemaining <= 0);
  const isCancelled = miniDraw.status === "cancelled";

  const brandMeta = getBrandMeta(miniDraw.brandId);
  const brandData = brandMeta ?? defaultBrandLogo;
  const overlayScale =
    brandMeta?.overlayScale ?? defaultBrandLogo.overlayScale ?? 1;
  const gradientOverride = brandMeta ? undefined : "bg-transparent";

  const urgencyBadge = getUrgencyBadge(percentage, miniDraw.status);

  const getUserEntryCount = (): number => {
    if (!isAuthenticated || !userData) return 0;
    const currentId = String(miniDraw._id);
    const userWithParticipation = userData as unknown as {
      miniDrawParticipation?: Array<{
        miniDrawId: string | { toString(): string };
        totalEntries: number;
      }>;
    };
    const participation =
      userWithParticipation?.miniDrawParticipation?.find((p) => {
        const id = p.miniDrawId;
        return typeof id === "string"
          ? id === currentId
          : id?.toString() === currentId;
      });
    return participation?.totalEntries ?? 0;
  };

  const userEntries = getUserEntryCount();
  const detailHref = `/mini-draws/${miniDraw._id}`;

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: prefersReduced ? 0 : 0.4,
        delay: prefersReduced ? 0 : index * 0.06,
        ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
      },
    },
  };

  /* ── List View ── */
  if (viewMode === "list") {
    return (
      <motion.div variants={cardVariants} initial="hidden" animate="visible">
        <Link href={detailHref} className="block">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group">
            <div className="flex">
              <div className="relative w-28 h-28 sm:w-36 sm:h-36 flex-shrink-0 overflow-hidden">
                <Image
                  src={
                    miniDraw.prize.images[0] ||
                    "/images/placeholder-product.jpg"
                  }
                  alt={miniDraw.prize.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 640px) 112px, 144px"
                />
                {brandMeta && (
                  <div className="absolute bottom-1 right-1 z-10">
                    <BrandLogoCard
                      brand={brandData}
                      overlayMode="overlay"
                      gradientOverride={gradientOverride ?? undefined}
                      scaleOverride={overlayScale}
                      widthClass="w-auto"
                      heightClass="h-auto"
                    />
                  </div>
                )}
              </div>
              <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between min-w-0">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        isCancelled
                          ? "bg-red-500"
                          : isClosed
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                    />
                    <span className="text-2xs sm:text-xs text-gray-500 dark:text-gray-400 font-medium">
                      {isCancelled ? "Cancelled" : isClosed ? "Closed" : "Active"}
                    </span>
                    {urgencyBadge && (
                      <span
                        className={cn("text-3xs px-1.5 py-0.5 rounded-full font-bold", urgencyBadge.className)}
                      >
                        {urgencyBadge.label}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white line-clamp-2 group-hover:text-red-600 dark:group-hover:text-red-500 transition-colors">
                    {miniDraw.name}
                  </h3>
                  <EntryProgressBar
                    totalEntries={totalEntries}
                    minimumEntries={minimumEntries}
                    variant="compact"
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  {userEntries > 0 && (
                    <span className="text-2xs sm:text-xs font-medium text-green-600 dark:text-green-500 flex items-center gap-0.5">
                      <Ticket className="w-3 h-3" /> {userEntries}{" "}
                      {userEntries === 1 ? "entry" : "entries"}
                    </span>
                  )}
                  <span className="ml-auto inline-flex items-center gap-1 px-3 py-1 sm:py-1.5 rounded-full text-2xs sm:text-xs font-bold bg-black text-white group-hover:bg-red-600 transition-colors">
                    <span>$1</span>
                    <Ticket className="w-3 h-3" />
                    {isCancelled ? "Cancelled" : isClosed ? "View" : "Enter"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }

  /* ── Grid View ── */
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="h-full"
    >
      <Link href={detailHref} className="block h-full">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group h-full flex flex-col">
          {/* Image Section */}
          <div className="relative">
            <div className="relative w-full aspect-[4/3] overflow-hidden">
              <Image
                src={
                  miniDraw.prize.images[0] ||
                  "/images/placeholder-product.jpg"
                }
                alt={miniDraw.prize.name}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
            </div>

            {/* Brand Logo */}
            {brandMeta && (
              <div className="absolute bottom-10 right-2 z-10">
                <BrandLogoCard
                  brand={brandData}
                  overlayMode="overlay"
                  gradientOverride={gradientOverride ?? undefined}
                  scaleOverride={overlayScale}
                  widthClass="w-auto"
                  heightClass="h-auto"
                />
              </div>
            )}

            {/* User Entry Badge */}
            {userEntries > 0 && (
              <div className="absolute top-2 left-2 z-10">
                <div className="bg-green-500 text-white px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-3xs sm:text-2xs font-bold shadow-md flex items-center gap-1">
                  <Ticket className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  {userEntries} {userEntries === 1 ? "entry" : "entries"}
                </div>
              </div>
            )}

            {/* Urgency Badge */}
            {urgencyBadge && (
              <div
                className={cn("absolute", userEntries > 0 ? "top-2 right-2" : "top-2 left-2", "z-10")}
              >
                <span
                  className={cn("inline-flex items-center gap-0.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-3xs sm:text-2xs font-bold", urgencyBadge.className)}
                >
                  <urgencyBadge.icon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  {urgencyBadge.label}
                </span>
              </div>
            )}

            {/* Bottom overlay strip */}
            <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 flex items-center justify-center gap-1 text-3xs sm:text-2xs text-white/90 font-medium bg-black/60 backdrop-blur-[2px]">
              <Ticket className="w-2.5 h-2.5 sm:w-3 sm:h-3 opacity-70" />
              {entriesRemaining > 0
                ? `${entriesRemaining.toLocaleString()} entries remaining`
                : "Entries Closed"}
            </div>
          </div>

          {/* Content Section */}
          <div className="p-3 sm:p-4 flex flex-col flex-1">
            <div className="flex-1 space-y-1.5 sm:space-y-2">
              {/* Status dot + label */}
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    isCancelled
                      ? "bg-red-500"
                      : isClosed
                      ? "bg-yellow-500"
                      : "bg-green-500"
                  }`}
                />
                <span className="text-2xs sm:text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {isCancelled ? "Cancelled" : isClosed ? "Closed" : "Active"}
                </span>
              </div>

              {/* Draw name */}
              <h3 className="text-[13px] sm:text-sm lg:text-base font-bold text-gray-900 dark:text-white line-clamp-2 min-h-[2.2rem] sm:min-h-[2.5rem] group-hover:text-red-600 dark:group-hover:text-red-500 transition-colors duration-200">
                {miniDraw.name}
              </h3>

              {/* Progress Bar */}
              <EntryProgressBar
                totalEntries={totalEntries}
                minimumEntries={minimumEntries}
                variant="compact"
              />
            </div>

            {/* CTA Button */}
            <div className="mt-3 sm:mt-4">
              <span className="w-full flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-3 rounded-full text-2xs sm:text-xs font-bold text-white bg-gradient-to-r from-gray-900 to-black group-hover:from-red-600 group-hover:to-red-675 group-hover:shadow-md group-hover:shadow-red-600/20 transition-all duration-300">
                <span className="text-2xs sm:text-2xs font-semibold opacity-70">
                  $1
                </span>
                <Ticket className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                {isCancelled
                  ? "Cancelled"
                  : isClosed
                  ? "View Details"
                  : "Enter Draw"}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
