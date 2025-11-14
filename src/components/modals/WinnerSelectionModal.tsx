"use client";

import React, { useEffect, useState } from "react";
import { Trophy, User, Hash, CheckCircle, AlertCircle, Image as ImageIcon } from "lucide-react";
import UserSearchModal from "./UserSearchModal";
import { ModalContainer, ModalHeader, ModalContent, Input, Button, Select } from "./ui";
import ImageUpload from "./ui/ImageUpload";

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
  entryNumber: number;
  selectionMethod: "manual" | "government-app";
  imageFile?: File;
  imageUrl?: string;
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
    entryNumber: number;
    selectionMethod: string;
    imageUrl?: string;
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
  totalEntries,
  currentWinner,
  enableImageField = false,
}: WinnerSelectionModalProps) {
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [entryNumber, setEntryNumber] = useState("");
  const [selectionMethod, setSelectionMethod] = useState<"manual" | "government-app">("manual");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUserSearchOpen, setIsUserSearchOpen] = useState(false);
  const [winnerImages, setWinnerImages] = useState<(File | string)[]>([]);
  useEffect(() => {
    if (!isOpen) {
      setSelectedUser(null);
      setEntryNumber("");
      setSelectionMethod("manual");
      setWinnerImages([]);
      setError(null);
    } else if (enableImageField && currentWinner?.imageUrl) {
      setWinnerImages([currentWinner.imageUrl]);
    } else if (enableImageField) {
      setWinnerImages([]);
    }
  }, [isOpen, enableImageField, currentWinner]);

  // Handle user selection from search modal
  const handleUserSelect = (user: UserSearchResult) => {
    setSelectedUser(user);
    setError(null);
  };

  // Validate entry number
  const validateEntryNumber = (value: string): boolean => {
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= 1 && num <= totalEntries;
  };

  // Handle entry number change
  const handleEntryNumberChange = (value: string) => {
    setEntryNumber(value);
    setError(null);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUser) {
      setError("Please select a winner");
      return;
    }

    if (!entryNumber.trim()) {
      setError("Please enter an entry number");
      return;
    }

    const entryNum = parseInt(entryNumber, 10);
    if (!validateEntryNumber(entryNumber)) {
      setError(`Entry number must be between 1 and ${totalEntries}`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const winnerData: WinnerSelectionData = {
        drawId,
        drawType,
        winnerUserId: selectedUser._id,
        entryNumber: entryNum,
        selectionMethod,
      };

      if (enableImageField) {
        const fileImage = winnerImages.find((img): img is File => img instanceof File);
        const existingUrl = winnerImages.find((img): img is string => typeof img === "string");

        if (fileImage) {
          winnerData.imageFile = fileImage;
        } else if (existingUrl) {
          winnerData.imageUrl = existingUrl;
        }
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

            {/* Entry Number */}
            <Input
              type="number"
              id="entryNumber"
              value={entryNumber}
              onChange={(e) => handleEntryNumberChange(e.target.value)}
              label="Entry Number"
              placeholder={`Enter entry number (1-${totalEntries})`}
              icon={Hash}
              min={1}
              max={totalEntries}
              required
              error={
                entryNumber && !validateEntryNumber(entryNumber)
                  ? `Must be between 1 and ${totalEntries.toLocaleString()}`
                  : undefined
              }
            />

            {enableImageField && (
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
                  Upload or drop an image of the winner. We’ll store it once you submit.
                </p>
              </div>
            )}

            {/* Selection Method */}
            <Select
              id="selectionMethod"
              value={selectionMethod}
              onChange={(e) => setSelectionMethod(e.target.value as "manual" | "government-app")}
              label="Selection Method"
              required
              options={[
                { value: "government-app", label: "Government App" },
                { value: "manual", label: "Manual Selection" },
              ]}
            />

            {/* Current Winner Warning */}
            {currentWinner && currentWinner.userId && currentWinner.entryNumber && (
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
                disabled={!selectedUser || !entryNumber.trim() || isSubmitting}
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
      />
    </>
  );
}
