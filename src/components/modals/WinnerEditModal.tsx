"use client";

import React, { useEffect, useState } from "react";
import { Trophy, MessageSquare, Gift, AlertCircle, Image as ImageIcon, Link2 } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import ImageUpload from "./ui/ImageUpload";
import { useToast } from "@/components/ui/Toast";
import RichTextEditor from "@/components/ui/RichTextEditor";

interface WinnerEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  winnerId: string;
  winnerName: string;
  drawName: string;
  drawType: "major" | "mini";
  currentTestimony?: string | null;
  currentSelectedPrize?: string | null;
  currentImageUrl?: string | null;
  currentDrawResultUrl?: string | null;
  onUpdate: () => void | Promise<void>;
}

/**
 * WinnerEditModal - Modal for editing winner testimony and selected prize
 * Allows admins to update winner testimony and prize selection after winner is selected
 */
export default function WinnerEditModal({
  isOpen,
  onClose,
  winnerId,
  winnerName,
  drawName,
  drawType,
  currentTestimony,
  currentSelectedPrize,
  currentImageUrl,
  currentDrawResultUrl,
  onUpdate,
}: WinnerEditModalProps) {
  const { showToast } = useToast();
  const [testimony, setTestimony] = useState("");
  const [selectedPrize, setSelectedPrize] = useState("");
  const [winnerImages, setWinnerImages] = useState<(File | string)[]>([]);
  const [drawResultUrl, setDrawResultUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form with current values when modal opens
  useEffect(() => {
    if (isOpen) {
      setTestimony(currentTestimony || "");
      setSelectedPrize(currentSelectedPrize || "");
      setWinnerImages(currentImageUrl ? [currentImageUrl] : []);
      setDrawResultUrl(currentDrawResultUrl?.trim() || "");
      setError(null);
    }
  }, [isOpen, currentTestimony, currentSelectedPrize, currentImageUrl, currentDrawResultUrl]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const updateData: {
        testimony?: string | null;
        selectedPrize?: string | null;
        imageUrl?: string | null;
        drawResultUrl?: string | null;
      } = {};

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
      const prevVerification =
        currentDrawResultUrl && currentDrawResultUrl.trim() !== "" ? currentDrawResultUrl.trim() : null;
      const nextVerification = trimmedVerification === "" ? null : trimmedVerification;
      if (nextVerification !== prevVerification) {
        updateData.drawResultUrl = nextVerification;
      }

      // Only include fields that have changed
      if (testimony.trim() !== (currentTestimony || "")) {
        updateData.testimony = testimony.trim() || null;
      }

      if (selectedPrize.trim() !== (currentSelectedPrize || "")) {
        updateData.selectedPrize = selectedPrize.trim() || null;
      }

      // Resolve image URL for major / mini draws: upload new file or use existing URL; only send if changed
      if (drawType === "major" || drawType === "mini") {
        const fileImage = winnerImages.find((img): img is File => img instanceof File);
        const existingUrl = winnerImages.find((img): img is string => typeof img === "string");
        const currentImage = currentImageUrl ?? null;
        const cloudinaryFolder = drawType === "major" ? "major-draw-winners" : "mini-draw-winners";

        let resolvedImageUrl: string | null = null;
        if (fileImage) {
          const uploadFormData = new FormData();
          uploadFormData.append("file", fileImage);
          uploadFormData.append("folder", cloudinaryFolder);

          const uploadResponse = await fetch("/api/upload/cloudinary", {
            method: "POST",
            body: uploadFormData,
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || "Failed to upload winner image");
          }

          const uploadData = await uploadResponse.json();
          if (!uploadData.url) {
            throw new Error("Failed to get image URL from upload response");
          }
          resolvedImageUrl = uploadData.url;
        } else if (existingUrl) {
          resolvedImageUrl = existingUrl;
        }

        if (resolvedImageUrl !== currentImage) {
          updateData.imageUrl = resolvedImageUrl;
        }
      }

      // If nothing changed, just close
      if (Object.keys(updateData).length === 0) {
        onClose();
        return;
      }

      const response = await fetch(`/api/admin/winners/${winnerId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update winner");
      }

      showToast({
        type: "success",
        title: "Winner Updated",
        message: "Winner details were updated successfully.",
        duration: 5000,
      });

      // Call onUpdate callback to refresh parent component
      await onUpdate();
      onClose();
    } catch (err) {
      console.error("Error updating winner:", err);
      setError(err instanceof Error ? err.message : "Failed to update winner");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="2xl" height="fixed">
      {/* Header */}
      <ModalHeader title="Edit Winner" subtitle={`${winnerName} - ${drawName}`} onClose={onClose} />

      {/* Content */}
      <ModalContent>
        {error && (
          <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Prize Selection - Only for major draws */}
          {drawType === "major" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-gray-500" />
                  Selected Prize
                </div>
              </label>
              <input
                type="text"
                value={selectedPrize}
                onChange={(e) => setSelectedPrize(e.target.value)}
                placeholder="e.g., $10,000 Cash, Milwaukee + Sidchrome, DeWalt + Sidchrome, etc."
                className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ee0000] focus:border-[#ee0000] font-['Inter'] bg-white transition-all duration-200"
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter the prize selected by the winner. This will be displayed on the winners page. You can enter any prize description (e.g., &quot;$15,000 Cash&quot;, &quot;Milwaukee + Sidchrome Tool Set&quot;, etc.).
              </p>
            </div>
          )}

          {/* Winner Photo - Major and mini draws */}
          {(drawType === "major" || drawType === "mini") && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-gray-500" />
                  Winner Photo
                </div>
              </label>
              <ImageUpload
                images={winnerImages}
                onImagesChange={(images) => setWinnerImages(images.slice(0, 1))}
                maxImages={1}
                accept="image/*"
                uploadToCloudinary={false}
                storeLocally
                className="border border-dashed border-gray-200 rounded-lg"
              />
              <p className="flex items-center gap-2 text-xs text-gray-500">
                <ImageIcon className="w-4 h-4 text-gray-400" />
                Upload or replace the winner photo. Remove the image to clear it.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-gray-500" />
                Draw result link (optional)
              </div>
            </label>
            <input
              type="url"
              value={drawResultUrl}
              onChange={(e) => setDrawResultUrl(e.target.value)}
              placeholder="https://randomdraws.com.au/..."
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ee0000] focus:border-[#ee0000] font-['Inter'] bg-white transition-all duration-200"
            />
            <p className="mt-1 text-xs text-gray-500">
              Shown on the public draw results page when you want to link to Random Draws or another verification URL.
              Clear the field to remove the link.
            </p>
          </div>

          {/* Testimony Field - Rich Text Editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-gray-500" />
                Winner Testimony
              </div>
            </label>
            <RichTextEditor
              value={testimony}
              onChange={(html) => setTestimony(html)}
              placeholder="Enter the winner's testimony here. You can format text, highlight important parts, and adjust line spacing."
              minHeight="300px"
            />
            <p className="mt-2 text-xs text-gray-500">
              The winner&apos;s testimony will be displayed in the testimony section on the winners page. Use the toolbar to format text, add highlights, and adjust line spacing.
            </p>
          </div>

        

          {/* Submit Button */}
          <div className="pt-4 flex gap-3">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              fullWidth
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              loading={isSubmitting}
              icon={Trophy}
              fullWidth
              size="lg"
            >
              {isSubmitting ? "Updating..." : "Update Winner"}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
}

