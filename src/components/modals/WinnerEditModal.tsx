"use client";

import React, { useEffect, useState } from "react";
import { Trophy, MessageSquare, Gift, AlertCircle, CheckCircle } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
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
  onUpdate,
}: WinnerEditModalProps) {
  const { showToast } = useToast();
  const [testimony, setTestimony] = useState("");
  const [selectedPrize, setSelectedPrize] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form with current values when modal opens
  useEffect(() => {
    if (isOpen) {
      setTestimony(currentTestimony || "");
      setSelectedPrize(currentSelectedPrize || "");
      setError(null);
    }
  }, [isOpen, currentTestimony, currentSelectedPrize]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const updateData: {
        testimony?: string | null;
        selectedPrize?: string | null;
      } = {};

      // Only include fields that have changed
      if (testimony.trim() !== (currentTestimony || "")) {
        updateData.testimony = testimony.trim() || null;
      }

      if (selectedPrize.trim() !== (currentSelectedPrize || "")) {
        updateData.selectedPrize = selectedPrize.trim() || null;
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
        message: "Winner testimony and prize selection have been updated successfully.",
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
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

          {/* Testimony Field - Rich Text Editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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

