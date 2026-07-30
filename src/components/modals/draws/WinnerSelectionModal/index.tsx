"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import UserSearchModal from "../../UserSearchModal";
import DrawModalShell from "../DrawModalShell";
import WinnerPicker from "./WinnerPicker";
import DrawResultLinkField from "./DrawResultLinkField";
import PrizeField from "./PrizeField";
import TestimonyField from "./TestimonyField";
import WinnerImageField from "./WinnerImageField";
import ReplaceWarning from "./ReplaceWarning";
import type { UserSearchResult, WinnerSelectionData, WinnerSelectionDrawType } from "./types";

export type { WinnerSelectionData, WinnerSelectionDrawType } from "./types";

interface WinnerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWinnerSelected: (data: WinnerSelectionData) => void | Promise<void>;
  drawId: string;
  drawName: string;
  drawType: WinnerSelectionDrawType;
  totalEntries: number;
  currentWinner?: {
    userId: string;
    imageUrl?: string;
    selectedPrize?: string;
    testimony?: string;
    drawResultUrl?: string;
  };
  enableImageField?: boolean;
}

export default function WinnerSelectionModal({
  isOpen,
  onClose,
  onWinnerSelected,
  drawId,
  drawName,
  drawType,
  totalEntries: _totalEntries,
  currentWinner,
  enableImageField = false,
}: WinnerSelectionModalProps) {
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUserSearchOpen, setIsUserSearchOpen] = useState(false);
  const [winnerImages, setWinnerImages] = useState<(File | string)[]>([]);
  const [selectedPrize, setSelectedPrize] = useState("");
  const [testimony, setTestimony] = useState("");
  const [drawResultUrl, setDrawResultUrl] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSelectedUser(null);
      setWinnerImages([]);
      setError(null);
      setSelectedPrize("");
      setTestimony("");
      setDrawResultUrl("");
    } else if (enableImageField && currentWinner?.imageUrl) {
      setWinnerImages([currentWinner.imageUrl]);
      setSelectedPrize(currentWinner.selectedPrize || "");
      setTestimony(currentWinner.testimony || "");
      setDrawResultUrl(currentWinner.drawResultUrl || "");
    } else if (enableImageField) {
      setWinnerImages(currentWinner?.imageUrl ? [currentWinner.imageUrl] : []);
      setSelectedPrize(currentWinner?.selectedPrize || "");
      setTestimony(currentWinner?.testimony || "");
      setDrawResultUrl(currentWinner?.drawResultUrl || "");
    } else if (isOpen) {
      setDrawResultUrl(currentWinner?.drawResultUrl || "");
    }
  }, [isOpen, enableImageField, currentWinner]);

  const handleUserSelect = (user: UserSearchResult) => {
    setSelectedUser(user);
    setError(null);
  };

  // Invoked by the shell's primary button, which lives outside any <form> —
  // hence no FormEvent. The guard below is the real gate, unchanged.
  const handleSubmit = async () => {
    if (!selectedUser) {
      setError("Please select a winner");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const trimmedVerification = drawResultUrl.trim();
      if (trimmedVerification) {
        try {
          new URL(trimmedVerification);
        } catch {
          setError("Draw result link must be a full URL (e.g. https://randomdraws.com.au/...)");
          setIsSubmitting(false);
          return;
        }
      }

      const winnerData: WinnerSelectionData = {
        drawId,
        drawType,
        winnerUserId: selectedUser._id,
        testimony: testimony.trim() || undefined,
        selectedPrize: selectedPrize || undefined,
        drawResultUrl: trimmedVerification === "" ? null : trimmedVerification,
      };

      if (drawType === "major" || enableImageField) {
        const fileImage = winnerImages.find((img): img is File => img instanceof File);
        const existingUrl = winnerImages.find((img): img is string => typeof img === "string");

        if (fileImage) {
          try {
            const uploadFormData = new FormData();
            uploadFormData.append("file", fileImage);
            uploadFormData.append("folder", drawType === "mini" ? "mini-draw-winners" : "major-draw-winners");

            const response = await fetch("/api/upload/cloudinary", {
              method: "POST",
              body: uploadFormData,
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || "Failed to upload winner image");
            }

            const data = await response.json();

            if (!data.url) {
              console.error("Failed to get image URL from upload response:", data);
              throw new Error("Failed to get image URL from upload response");
            }

            winnerData.imageUrl = data.url;
          } catch (uploadError) {
            console.error("Failed to upload image:", uploadError);
            setError(uploadError instanceof Error ? uploadError.message : "Failed to upload winner image");
            return;
          }
        } else if (existingUrl) {
          winnerData.imageUrl = existingUrl;
        }
      }

      console.log("🔍 [Modal] Before callback - winnerData:", {
        drawId: winnerData.drawId,
        drawType: winnerData.drawType,
        winnerUserId: winnerData.winnerUserId,
        imageUrl: winnerData.imageUrl,
        hasImageUrl: !!winnerData.imageUrl,
        imageUrlType: typeof winnerData.imageUrl,
      });

      if ((drawType === "major" || enableImageField) && !winnerData.imageUrl) {
        console.warn("⚠️ [Modal] imageUrl not set but should be for drawType:", drawType, "enableImageField:", enableImageField);
      }

      await onWinnerSelected(winnerData);
    } catch (err) {
      console.error("Winner selection error:", err);
      setError(err instanceof Error ? err.message : "Failed to select winner");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DrawModalShell
        isOpen={isOpen}
        onClose={onClose}
        size="2xl"
        eyebrow={drawName}
        title="Record the winner"
        primaryLabel="Publish winner"
        // The shell's primary sits outside the <form>, so submit is invoked
        // directly rather than relying on an implicit form submit.
        onPrimary={() => void handleSubmit()}
        isSubmitting={isSubmitting}
        submittingLabel="Publishing…"
        // Guards the same condition the old submit button did.
        errorCount={!selectedUser && !isSubmitting ? 1 : 0}
      >
        {error && (
          <div
            role="alert"
            className="mb-[14px] flex items-start gap-[8px] rounded-[9px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-[12px] py-[10px]"
          >
            <AlertCircle className="mt-[1px] h-[16px] w-[16px] shrink-0 text-[var(--danger)]" aria-hidden />
            <span className="text-[12px] leading-[1.5] text-[var(--danger)]">{error}</span>
          </div>
        )}

        <div className="flex flex-col gap-[14px]">
          <WinnerPicker selectedUser={selectedUser} onOpenSearch={() => setIsUserSearchOpen(true)} />

          <DrawResultLinkField value={drawResultUrl} onChange={setDrawResultUrl} />

          {drawType === "major" && <PrizeField value={selectedPrize} onChange={setSelectedPrize} />}

          <TestimonyField value={testimony} onChange={setTestimony} />

          {(drawType === "major" || enableImageField) && (
            <WinnerImageField images={winnerImages} onImagesChange={setWinnerImages} />
          )}

          {currentWinner && currentWinner.userId && <ReplaceWarning />}
        </div>
      </DrawModalShell>

      <UserSearchModal
        isOpen={isUserSearchOpen}
        onClose={() => setIsUserSearchOpen(false)}
        onUserSelect={handleUserSelect}
        title="Select Winner"
        description="Search for the user who won the draw"
        excludeUserId={currentWinner?.userId}
        majorDrawId={drawType === "major" ? drawId : undefined}
        miniDrawId={drawType === "mini" ? drawId : undefined}
      />
    </>
  );
}
