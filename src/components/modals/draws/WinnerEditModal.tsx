"use client";

import React, { useEffect, useState } from "react";
import { MessageSquare, Gift, AlertCircle, Image as ImageIcon, Link2 } from "lucide-react";
import ImageUpload from "../ui/ImageUpload";
import { useToast } from "@/components/ui/Toast";
import RichTextEditor from "@/components/ui/RichTextEditor";
import DrawModalShell from "./DrawModalShell";
import { FieldLabel, FieldHint, FieldError, TextField } from "./fields";

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
 * Edit a recorded winner's testimony, prize, photo and verification link.
 *
 * Reachable from Major Draw, the Mini Draws card and the Draw Results inspector.
 * Note this stays editable after `configurationLocked` — the lock covers draw
 * CONFIG, and the winner is recorded after the freeze by design.
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
  const [urlInvalid, setUrlInvalid] = useState(false);

  // Initialize form with current values when modal opens
  useEffect(() => {
    if (isOpen) {
      setTestimony(currentTestimony || "");
      setSelectedPrize(currentSelectedPrize || "");
      setWinnerImages(currentImageUrl ? [currentImageUrl] : []);
      setDrawResultUrl(currentDrawResultUrl?.trim() || "");
      setError(null);
      setUrlInvalid(false);
    }
  }, [isOpen, currentTestimony, currentSelectedPrize, currentImageUrl, currentDrawResultUrl]);

  // Handle form submission
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    setUrlInvalid(false);

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
          // Validate on SUBMIT, not blur — per the design's form rules.
          setUrlInvalid(true);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update winner");

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
    <DrawModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      eyebrow={`${drawName} · published winner`}
      title="Edit winner & testimony"
      primaryLabel="Save changes"
      onPrimary={() => void handleSubmit()}
      isSubmitting={isSubmitting}
      submittingLabel="Saving…"
      errorCount={urlInvalid ? 1 : 0}
    >
      <div className="mb-[14px] rounded-[9px] border border-[var(--line)] bg-[var(--panel2)] px-[12px] py-[9px]">
        <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--text3)]">Winner</div>
        <div className="mt-[2px] text-[13.5px] font-semibold text-[var(--text)]">{winnerName}</div>
      </div>

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
        {/* Prize Selection - Only for major draws */}
        {drawType === "major" && (
          <div>
            <FieldLabel icon={Gift} htmlFor="winner-prize">
              Selected prize
            </FieldLabel>
            <TextField
              id="winner-prize"
              value={selectedPrize}
              onChange={setSelectedPrize}
              placeholder="e.g. $10,000 Cash, Milwaukee + Sidchrome"
            />
            <FieldHint>
              What the winner chose. Shown on the public winners page — free text, so any description works.
            </FieldHint>
          </div>
        )}

        {/* Winner Photo - Major and mini draws */}
        {(drawType === "major" || drawType === "mini") && (
          <div>
            <FieldLabel icon={ImageIcon}>Winner photo</FieldLabel>
            <ImageUpload
              images={winnerImages}
              onImagesChange={(images) => setWinnerImages(images.slice(0, 1))}
              maxImages={1}
              accept="image/*"
              uploadToCloudinary={false}
              storeLocally
              className="rounded-[9px] border border-dashed border-[var(--line)]"
            />
            <FieldHint>Upload or replace the winner photo. Remove the image to clear it.</FieldHint>
          </div>
        )}

        <div>
          <FieldLabel icon={Link2} htmlFor="winner-result-url">
            Draw result link (optional)
          </FieldLabel>
          <TextField
            id="winner-result-url"
            type="url"
            inputMode="url"
            value={drawResultUrl}
            onChange={(v) => {
              setDrawResultUrl(v);
              // Typing clears the error immediately, per the design.
              if (urlInvalid) {
                setUrlInvalid(false);
                setError(null);
              }
            }}
            placeholder="https://randomdraws.com.au/..."
            invalid={urlInvalid}
          />
          {urlInvalid ? (
            <FieldError>Enter a full URL including https://</FieldError>
          ) : (
            <FieldHint>
              Shown on the public draw results page as the verification link. Clear the field to remove it.
            </FieldHint>
          )}
        </div>

        {/* Testimony Field - Rich Text Editor */}
        <div>
          <FieldLabel icon={MessageSquare}>Winner testimony</FieldLabel>
          <RichTextEditor
            value={testimony}
            onChange={(html) => setTestimony(html)}
            placeholder="Enter the winner's testimony here. You can format text, highlight important parts, and adjust line spacing."
            minHeight="240px"
          />
          <FieldHint>
            Appears in the testimony section on the winners page. Use the toolbar to format text and add highlights.
          </FieldHint>
        </div>
      </div>
    </DrawModalShell>
  );
}
