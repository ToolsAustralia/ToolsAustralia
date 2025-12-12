"use client";

import React, { useState, useEffect } from "react";
import { Gift, AlertTriangle, Loader2 } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent, Input, Textarea, Button, DateTimePicker, FormSection } from "./ui";
import {
  useCreateBonusEntryPromo,
  useUpdateBonusEntryPromo,
  useBonusEntryPromos,
} from "@/hooks/queries/usePromoQueries";
import type {
  BonusEntryPromo,
  BonusEntryPromoType,
  CreateBonusEntryPromoPayload,
  UpdateBonusEntryPromoPayload,
} from "@/types/admin";
import {
  createAESTDateAsUTC,
  convertLocalToUTC,
  convertUTCToLocal,
  resolveLocalDisplayTimeZone,
} from "@/utils/common/timezone";

interface AdminBonusEntryPromoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editingPromo?: BonusEntryPromo | null; // If provided, modal is in edit mode
}

interface BonusEntryPromoFormData {
  type: BonusEntryPromoType;
  bonusEntries: number;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  description: string;
}

const AdminBonusEntryPromoModal: React.FC<AdminBonusEntryPromoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingPromo,
}) => {
  const createMutation = useCreateBonusEntryPromo();
  const updateMutation = useUpdateBonusEntryPromo();
  const { refetch: refetchPromos } = useBonusEntryPromos();

  const [formData, setFormData] = useState<BonusEntryPromoFormData>({
    type: "membership-packages",
    bonusEntries: 100,
    startDate: "",
    endDate: "",
    description: "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof BonusEntryPromoFormData, string>>>({});
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form data when modal opens or editingPromo changes
  useEffect(() => {
    if (isOpen) {
      if (editingPromo) {
        // Edit mode: populate form with existing promo data
        setFormData({
          type: editingPromo.type,
          bonusEntries: editingPromo.bonusEntries,
          startDate: editingPromo.startDate,
          endDate: editingPromo.endDate,
          description: editingPromo.description || "",
        });
      } else {
        // Create mode: set defaults
        // We want the DateTimePicker to show reasonable defaults in the user's local timezone
        // When the user selects/changes times, our onChange handler will convert them properly to AEST/AEDT

        const now = new Date();
        const localTimeZone = resolveLocalDisplayTimeZone();

        // Default start: current time in user's local timezone
        // Convert to UTC for DateTimePicker (it will display in local timezone)
        const localNow = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
        const startDateUTC = convertLocalToUTC(localNow, localTimeZone);

        // Default end: 2 days from now at 11:59 PM in user's local timezone
        // This ensures the picker shows "11:59 PM" which is what the user expects
        const endDateLocal = new Date(localNow);
        endDateLocal.setDate(endDateLocal.getDate() + 2);
        endDateLocal.setHours(23, 59, 59, 999);
        const endDateUTC = convertLocalToUTC(endDateLocal, localTimeZone);

        setFormData({
          type: "membership-packages",
          bonusEntries: 100,
          startDate: startDateUTC.toISOString(),
          endDate: endDateUTC.toISOString(),
          description: "",
        });
      }
      setErrors({});
      setConflictWarning(null);
    }
  }, [isOpen, editingPromo]);

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof BonusEntryPromoFormData, string>> = {};

    if (formData.bonusEntries < 1) {
      newErrors.bonusEntries = "Bonus entries must be at least 1";
    }

    if (!formData.startDate) {
      newErrors.startDate = "Start date is required";
    }

    if (!formData.endDate) {
      newErrors.endDate = "End date is required";
    }

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);

      if (start >= end) {
        newErrors.endDate = "End date must be after start date";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setConflictWarning(null);

    try {
      if (editingPromo) {
        // Update existing promo
        const updateData: UpdateBonusEntryPromoPayload = {
          type: formData.type,
          bonusEntries: formData.bonusEntries,
          startDate: formData.startDate,
          endDate: formData.endDate,
          description: formData.description || undefined,
        };

        await updateMutation.mutateAsync({
          id: editingPromo.id,
          data: updateData,
        });
      } else {
        // Create new promo
        const createData: CreateBonusEntryPromoPayload = {
          type: formData.type,
          bonusEntries: formData.bonusEntries,
          startDate: formData.startDate,
          endDate: formData.endDate,
          description: formData.description || undefined,
          forceCreate: false, // Start with false, will retry with true if conflict
        };

        try {
          await createMutation.mutateAsync(createData);
        } catch (error: unknown) {
          // Check if it's a conflict error
          if (
            error &&
            typeof error === "object" &&
            "message" in error &&
            typeof error.message === "string" &&
            error.message.includes("conflict")
          ) {
            // Show conflict warning and ask user to confirm
            setConflictWarning(
              "An active bonus entry promo for this package type already exists. Do you want to deactivate it and create the new promo?"
            );
            setIsSubmitting(false);
            return;
          }
          throw error; // Re-throw if not a conflict error
        }
      }

      // Success
      await refetchPromos();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to save bonus entry promo:", error);
      // Error handling is done by the mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle force create (when user confirms conflict resolution)
  const handleForceCreate = async () => {
    setIsSubmitting(true);
    setConflictWarning(null);

    try {
      const createData: CreateBonusEntryPromoPayload = {
        type: formData.type,
        bonusEntries: formData.bonusEntries,
        startDate: formData.startDate,
        endDate: formData.endDate,
        description: formData.description || undefined,
        forceCreate: true, // Force create will deactivate existing promo
      };

      await createMutation.mutateAsync(createData);
      await refetchPromos();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to create bonus entry promo:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader
        title={editingPromo ? "Edit Bonus Entry Promo" : "Create Bonus Entry Promo"}
        onClose={onClose}
        showLogo={false}
      />

      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Conflict Warning */}
          {conflictWarning && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-yellow-800 font-medium">{conflictWarning}</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      onClick={handleForceCreate}
                      variant="primary"
                      size="sm"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Creating...
                        </>
                      ) : (
                        "Yes, Create New Promo"
                      )}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setConflictWarning(null)}
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Package Type */}
          <FormSection title="Package Type">
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  type: e.target.value as BonusEntryPromoType,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              disabled={isSubmitting || !!editingPromo} // Can't change type when editing
            >
              <option value="membership-packages">Membership Packages</option>
              <option value="one-time-packages">One-Time Packages</option>
              <option value="mini-packages">Mini Draw Packages</option>
            </select>
          </FormSection>

          {/* Bonus Entries */}
          <FormSection title="Bonus Entries">
            <Input
              type="number"
              value={formData.bonusEntries}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  bonusEntries: parseInt(e.target.value) || 0,
                }))
              }
              min={1}
              placeholder="100"
              error={errors.bonusEntries}
              disabled={isSubmitting}
            />
            <p className="mt-1 text-sm text-gray-500">
              Number of bonus entries to grant when users purchase packages during the promo period.
            </p>
          </FormSection>

          {/* Date Range */}
          <FormSection title="Promo Period">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date & Time </label>
                <DateTimePicker
                  id="startDate"
                  name="startDate"
                  value={formData.startDate}
                  onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                    const value = e.target.value;
                    // DateTimePicker sends UTC date that represents user's local time selection
                    // We need to extract what time the user actually selected (in their local timezone)
                    // and then interpret that selected time as if it were in AEST/AEDT
                    const utcDateFromPicker = new Date(value);

                    // Convert UTC back to user's local time to see what they actually selected
                    // DateTimePicker uses convertLocalToUTC, so we reverse that
                    const localTimeZone = resolveLocalDisplayTimeZone();
                    const localDate = convertUTCToLocal(utcDateFromPicker, localTimeZone);

                    // Extract the local time components (what user actually selected)
                    const selectedYear = localDate.getFullYear();
                    const selectedMonth = localDate.getMonth() + 1; // getMonth() returns 0-11
                    const selectedDay = localDate.getDate();
                    const selectedHour = localDate.getHours();
                    const selectedMinute = localDate.getMinutes();

                    // Now treat these selected time components as if they were in AEST/AEDT
                    // and create the proper UTC date
                    const aestDateUTC = createAESTDateAsUTC(
                      selectedYear,
                      selectedMonth,
                      selectedDay,
                      selectedHour,
                      selectedMinute
                    );

                    setFormData((prev) => ({
                      ...prev,
                      startDate: aestDateUTC.toISOString(),
                    }));
                  }}
                  error={errors.startDate}
                  disabled={isSubmitting}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Note: The time you select will be interpreted as AEST/AEDT time, regardless of your location.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date & Time </label>
                <DateTimePicker
                  id="endDate"
                  name="endDate"
                  value={formData.endDate}
                  onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                    const value = e.target.value;
                    // DateTimePicker sends UTC date that represents user's local time selection
                    // We need to extract what time the user actually selected (in their local timezone)
                    // and then interpret that selected time as if it were in AEST/AEDT
                    const utcDateFromPicker = new Date(value);

                    // Convert UTC back to user's local time to see what they actually selected
                    // DateTimePicker uses convertLocalToUTC, so we reverse that
                    const localTimeZone = resolveLocalDisplayTimeZone();
                    const localDate = convertUTCToLocal(utcDateFromPicker, localTimeZone);

                    // Extract the local time components (what user actually selected)
                    const selectedYear = localDate.getFullYear();
                    const selectedMonth = localDate.getMonth() + 1; // getMonth() returns 0-11
                    const selectedDay = localDate.getDate();
                    const selectedHour = localDate.getHours();
                    const selectedMinute = localDate.getMinutes();

                    // Now treat these selected time components as if they were in AEST/AEDT
                    // and create the proper UTC date
                    const aestDateUTC = createAESTDateAsUTC(
                      selectedYear,
                      selectedMonth,
                      selectedDay,
                      selectedHour,
                      selectedMinute
                    );

                    setFormData((prev) => ({
                      ...prev,
                      endDate: aestDateUTC.toISOString(),
                    }));
                  }}
                  error={errors.endDate}
                  disabled={isSubmitting}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Example: December 14, 2024 11:59 PM AEDT. Purchases made during this period will receive bonus
                  entries.
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Note: The time you select will be interpreted as AEST/AEDT time, regardless of your location.
                </p>
              </div>
            </div>
          </FormSection>

          {/* Description */}
          <FormSection title="Description (Optional)">
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Weekend special promo - 100 bonus entries for all membership purchases"
              rows={3}
              maxLength={500}
              disabled={isSubmitting}
            />
            <p className="mt-1 text-sm text-gray-500">Optional admin notes for this promo (max 500 characters).</p>
          </FormSection>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              size="md"
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="flex-1"
              disabled={isSubmitting || !!conflictWarning}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {editingPromo ? "Updating..." : "Creating..."}
                </>
              ) : (
                <>
                  <Gift className="w-4 h-4 mr-2" />
                  {editingPromo ? "Update Promo" : "Create Promo"}
                </>
              )}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
};

export default AdminBonusEntryPromoModal;
