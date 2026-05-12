"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Trophy } from "lucide-react";
import UserSearchModal from "../UserSearchModal";
import { ModalContainer, ModalHeader, ModalContent, Button } from "../ui";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      <ModalContainer isOpen={isOpen} onClose={onClose} size="2xl" height="fixed">
        <ModalHeader title="Select Winner" subtitle={drawName} onClose={onClose} />

        <ModalContent>
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900/50 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <WinnerPicker
              selectedUser={selectedUser}
              onOpenSearch={() => setIsUserSearchOpen(true)}
            />

            <DrawResultLinkField value={drawResultUrl} onChange={setDrawResultUrl} />

            {drawType === "major" && (
              <PrizeField value={selectedPrize} onChange={setSelectedPrize} />
            )}

            <TestimonyField value={testimony} onChange={setTestimony} />

            {(drawType === "major" || enableImageField) && (
              <WinnerImageField images={winnerImages} onImagesChange={setWinnerImages} />
            )}

            {currentWinner && currentWinner.userId && <ReplaceWarning />}

            <div className="pt-4">
              <Button
                type="submit"
                disabled={!selectedUser || isSubmitting}
                loading={isSubmitting}
                icon={Trophy}
                fullWidth
                size="lg"
              >
                {isSubmitting ? "Recording Winner..." : "Record Winner"}
              </Button>
            </div>
          </form>
        </ModalContent>
      </ModalContainer>

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
