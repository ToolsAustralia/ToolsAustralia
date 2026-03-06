"use client";

import React, { useEffect, useState } from "react";
import { Trophy, User, CheckCircle, AlertCircle, Image as ImageIcon, MessageSquare, Gift } from "lucide-react";
import UserSearchModal from "./UserSearchModal";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import ImageUpload from "./ui/ImageUpload";
import RichTextEditor from "@/components/ui/RichTextEditor";

// Types
interface UserSearchResult {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
  currentDrawEntries?: {
    totalEntries: number;
    entriesBySource: {
      membership?: number;
      "one-time-package"?: number;
      upsell?: number;
      "mini-draw"?: number;
    };
  };
}

type WinnerSelectionDrawType = "mini" | "major";

export interface WinnerSelectionData {
  drawId: string;
  drawType: WinnerSelectionDrawType;
  winnerUserId: string;
  imageUrl?: string;
  testimony?: string;
  selectedPrize?: string;
}

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
  // Prize selection and testimony state
  const [selectedPrize, setSelectedPrize] = useState("");
  const [testimony, setTestimony] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSelectedUser(null);
      setWinnerImages([]);
      setError(null);
          setSelectedPrize("");
      setTestimony("");
    } else if (enableImageField && currentWinner?.imageUrl) {
      setWinnerImages([currentWinner.imageUrl]);
      setSelectedPrize(currentWinner.selectedPrize || "");
      setTestimony(currentWinner.testimony || "");
    } else if (enableImageField) {
      setWinnerImages([]);
      setSelectedPrize("");
      setTestimony("");
    }
  }, [isOpen, enableImageField, currentWinner]);

  // Handle user selection from search modal
  const handleUserSelect = (user: UserSearchResult) => {
    setSelectedUser(user);
    setError(null);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUser) {
      setError("Please select a winner");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const winnerData: WinnerSelectionData = {
        drawId,
        drawType,
        winnerUserId: selectedUser._id,
        testimony: testimony.trim() || undefined,
        selectedPrize: selectedPrize || undefined,
      };

      // Handle image upload for both draw types
      if (drawType === "major" || enableImageField) {
        const fileImage = winnerImages.find((img): img is File => img instanceof File);
        const existingUrl = winnerImages.find((img): img is string => typeof img === "string");

        if (fileImage) {
          // Upload image in modal (like major draw does)
          try {
            const uploadFormData = new FormData();
            uploadFormData.append("file", fileImage);
            uploadFormData.append("folder", "major-draw-winners");

            const response = await fetch("/api/upload/cloudinary", {
              method: "POST",
              body: uploadFormData,
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || "Failed to upload winner image");
            }

            const data = await response.json();
            
            // Extract URL from response (should have 'url' property)
            if (!data.url) {
              console.error("Failed to get image URL from upload response:", data);
              throw new Error("Failed to get image URL from upload response");
            }
            
            winnerData.imageUrl = data.url;
          } catch (uploadError) {
            console.error("Failed to upload image:", uploadError);
            setError(uploadError instanceof Error ? uploadError.message : "Failed to upload winner image");
            return; // Stop submission on upload error
          }
        } else if (existingUrl) {
          winnerData.imageUrl = existingUrl;
        }
      }

      // Verify imageUrl is set before calling callback
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

  // Format date for display
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Format Australian state
  const formatState = (state?: string) => {
    if (!state) return "Not specified";
    const stateNames: Record<string, string> = {
      NSW: "New South Wales",
      VIC: "Victoria",
      QLD: "Queensland",
      WA: "Western Australia",
      SA: "South Australia",
      TAS: "Tasmania",
      ACT: "Australian Capital Territory",
      NT: "Northern Territory",
    };
    return stateNames[state] || state;
  };

  return (
    <>
      <ModalContainer isOpen={isOpen} onClose={onClose} size="2xl" height="fixed">
        {/* Header */}
        <ModalHeader title="Select Winner" subtitle={drawName} onClose={onClose} />

        {/* Content */}
        <ModalContent>
          {error && (
            <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Winner Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Winner *</label>
              {selectedUser ? (
                <div className="p-4 border-2 border-green-200 bg-green-50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-semibold">
                        {selectedUser.firstName.charAt(0)}
                        {selectedUser.lastName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">
                          {selectedUser.firstName} {selectedUser.lastName}
                        </h3>
                        <p className="text-sm text-gray-600">{selectedUser.email}</p>
                        {selectedUser.mobile && <p className="text-sm text-gray-600">{selectedUser.mobile}</p>}
                        {selectedUser.state && (
                          <p className="text-sm text-gray-600">{formatState(selectedUser.state)}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">Joined {formatDate(selectedUser.createdAt)}</p>
                      </div>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  </div>

                  {selectedUser.currentDrawEntries && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Trophy className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-800">Current Draw Entries</span>
                      </div>
                      <p className="text-sm text-blue-700">
                        Total: <span className="font-semibold">{selectedUser.currentDrawEntries.totalEntries}</span>
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsUserSearchOpen(true)}
                    className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Change Winner
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsUserSearchOpen(true)}
                  className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <User className="w-6 h-6 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">Click to search and select winner</p>
                      <p className="text-sm text-gray-500">Search by name, email, mobile, or user ID</p>
                    </div>
                  </div>
                </button>
              )}
            </div>

            {/* Prize Selection - Only for major draws */}
            {drawType === "major" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-gray-500" />
                    Selected Prize (Optional)
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
                  Enter the prize selected by the winner. This will be displayed on the winners page. You can enter any prize description (e.g., &quot;$15,000 Cash&quot;, &quot;Milwaukee + Sidchrome Tool Set&quot;, etc.). You can set this now or update it later.
                </p>
              </div>
            )}

            {/* Testimony Field - Rich Text Editor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                  Winner Testimony (Optional)
                </div>
              </label>
              <RichTextEditor
                value={testimony}
                onChange={(html) => setTestimony(html)}
                placeholder="Enter the winner's testimony here. You can format text, highlight important parts, and adjust line spacing."
                minHeight="250px"
              />
              <p className="mt-2 text-xs text-gray-500">
                The winner&apos;s testimony will be displayed on the winners page. Use the toolbar to format text, add highlights, and adjust line spacing. You can add or update this later.
              </p>
            </div>

            {/* Image Upload - Always enabled for major draws, optional for mini draws */}
            {(drawType === "major" || enableImageField) && (
              <div className="space-y-2">
                <ImageUpload
                  label="Winner Photo"
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
                  Upload or drop an image of the winner. We&apos;ll store it once you submit.
                </p>
              </div>
            )}

            {/* Current Winner Warning */}
            {currentWinner && currentWinner.userId && (
              <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-800">Current Winner Exists</span>
                </div>
                <p className="text-sm text-yellow-700">
                  There is already a winner selected for this draw. Selecting a new winner will replace the current one.
                </p>
              </div>
            )}

            {/* Submit Button */}
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

      {/* User Search Modal */}
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
