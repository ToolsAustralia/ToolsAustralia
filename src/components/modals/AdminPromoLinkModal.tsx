"use client";

import React, { useState, useEffect } from "react";
import { Link2, Loader2, Copy, Check } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent, Input, Textarea, Button, DateTimePicker, FormSection } from "./ui";
import { useCreatePromoLink, useUpdatePromoLink, usePromoLinks } from "@/hooks/queries/usePromoQueries";
import type { PromoLink, CreatePromoLinkPayload, UpdatePromoLinkPayload } from "@/types/admin";
import {
  convertLocalToUTC,
  convertUTCToLocal,
  createAESTDateAsUTC,
  resolveLocalDisplayTimeZone,
} from "@/utils/common/timezone";

interface AdminPromoLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editingPromoLink?: PromoLink | null; // If provided, modal is in edit mode
}

interface PromoLinkFormData {
  bonusEntries: number;
  expiresAt: string; // ISO date string (optional)
  description: string;
  isActive: boolean;
  appliesToMembership: boolean;
  appliesToOneTime: boolean;
  campaignType: "general" | "cancelled-membership-comeback";
  eligibilityAudience: "all" | "cancelled-members";
  requireInactiveSubscription: boolean;
  cancelledWithinDays: string;
}

const AdminPromoLinkModal: React.FC<AdminPromoLinkModalProps> = ({ isOpen, onClose, onSuccess, editingPromoLink }) => {
  const createMutation = useCreatePromoLink();
  const updateMutation = useUpdatePromoLink();
  const { refetch: refetchPromoLinks } = usePromoLinks();

  const [formData, setFormData] = useState<PromoLinkFormData>({
    bonusEntries: 100,
    expiresAt: "",
    description: "",
    isActive: true,
    appliesToMembership: false,
    appliesToOneTime: false,
    campaignType: "general",
    eligibilityAudience: "all",
    requireInactiveSubscription: false,
    cancelledWithinDays: "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof PromoLinkFormData, string>>>({});
  const [packageTypeError, setPackageTypeError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Initialize form data when modal opens or editingPromoLink changes
  useEffect(() => {
    if (isOpen) {
      if (editingPromoLink) {
        // Edit mode: populate form with existing promo link data
        setFormData({
          bonusEntries: editingPromoLink.bonusEntries,
          expiresAt: editingPromoLink.expiresAt ? new Date(editingPromoLink.expiresAt).toISOString() : "",
          description: editingPromoLink.description || "",
          isActive: editingPromoLink.isActive,
          appliesToMembership: editingPromoLink.appliesToMembership || false,
          appliesToOneTime: editingPromoLink.appliesToOneTime || false,
          campaignType: editingPromoLink.campaignType || "general",
          eligibilityAudience: editingPromoLink.eligibilityAudience || "all",
          requireInactiveSubscription: editingPromoLink.eligibilityRules?.requireInactiveSubscription || false,
          cancelledWithinDays: editingPromoLink.eligibilityRules?.cancelledWithinDays
            ? String(editingPromoLink.eligibilityRules.cancelledWithinDays)
            : "",
        });
        setGeneratedCode(editingPromoLink.code);
        setGeneratedUrl(editingPromoLink.promoUrl);
      } else {
        // Create mode: set defaults
        const now = new Date();
        const localTimeZone = resolveLocalDisplayTimeZone();

        // Default expiration: 30 days from now at 11:59 PM in user's local timezone
        const expirationLocal = new Date(now);
        expirationLocal.setDate(expirationLocal.getDate() + 30);
        expirationLocal.setHours(23, 59, 59, 999);
        const expirationUTC = convertLocalToUTC(expirationLocal, localTimeZone);

        setFormData({
          bonusEntries: 100,
          expiresAt: expirationUTC.toISOString(),
          description: "",
          isActive: true,
          appliesToMembership: false,
          appliesToOneTime: false,
          campaignType: "general",
          eligibilityAudience: "all",
          requireInactiveSubscription: false,
          cancelledWithinDays: "",
        });
        setGeneratedCode(null);
        setGeneratedUrl(null);
      }
      setErrors({});
      setPackageTypeError(null);
      setCopied(false);
    }
  }, [isOpen, editingPromoLink]);

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof PromoLinkFormData, string>> = {};

    if (formData.bonusEntries < 1) {
      newErrors.bonusEntries = "Bonus entries must be at least 1";
    }

    if (formData.expiresAt) {
      const expiration = new Date(formData.expiresAt);
      if (expiration <= new Date()) {
        newErrors.expiresAt = "Expiration date must be in the future";
      }
    }

    if (formData.campaignType === "cancelled-membership-comeback" && formData.eligibilityAudience !== "cancelled-members") {
      newErrors.eligibilityAudience = "Comeback campaigns must target cancelled members";
    }

    // Validate that at least one package type is selected if active
    if (formData.isActive && !formData.appliesToMembership && !formData.appliesToOneTime) {
      setPackageTypeError("At least one package type (membership or one-time) must be selected for active promo links");
      setErrors(newErrors);
      return false;
    } else {
      setPackageTypeError(null);
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

    try {
      if (editingPromoLink) {
        // Update existing promo link
        const cancelledWithinDaysValue =
          formData.cancelledWithinDays.trim().length > 0 ? parseInt(formData.cancelledWithinDays, 10) : undefined;

        const updateData: UpdatePromoLinkPayload = {
          bonusEntries: formData.bonusEntries,
          expiresAt: formData.expiresAt || null,
          description: formData.description || undefined,
          isActive: formData.isActive,
          appliesToMembership: formData.appliesToMembership,
          appliesToOneTime: formData.appliesToOneTime,
          campaignType: formData.campaignType,
          eligibilityAudience: formData.eligibilityAudience,
          eligibilityRules: {
            requireInactiveSubscription: formData.requireInactiveSubscription,
            ...(cancelledWithinDaysValue ? { cancelledWithinDays: cancelledWithinDaysValue } : {}),
          },
        };

        const updated = await updateMutation.mutateAsync({
          id: editingPromoLink.id,
          data: updateData,
        });

        setGeneratedCode(updated.code);
        setGeneratedUrl(updated.promoUrl);
      } else {
        // Create new promo link
        const cancelledWithinDaysValue =
          formData.cancelledWithinDays.trim().length > 0 ? parseInt(formData.cancelledWithinDays, 10) : undefined;

        const createData: CreatePromoLinkPayload = {
          bonusEntries: formData.bonusEntries,
          expiresAt: formData.expiresAt || null,
          description: formData.description || undefined,
          isActive: formData.isActive,
          appliesToMembership: formData.appliesToMembership,
          appliesToOneTime: formData.appliesToOneTime,
          campaignType: formData.campaignType,
          eligibilityAudience: formData.eligibilityAudience,
          eligibilityRules: {
            requireInactiveSubscription: formData.requireInactiveSubscription,
            ...(cancelledWithinDaysValue ? { cancelledWithinDays: cancelledWithinDaysValue } : {}),
          },
        };

        const created = await createMutation.mutateAsync(createData);

        setGeneratedCode(created.code);
        setGeneratedUrl(created.promoUrl);
      }

      // Success
      await refetchPromoLinks();
      onSuccess?.();
      // Don't close modal immediately - show the generated link
    } catch (error) {
      console.error("Failed to save promo link:", error);
      // Error handling is done by the mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy link to clipboard
  const handleCopyLink = async () => {
    if (generatedUrl) {
      try {
        await navigator.clipboard.writeText(generatedUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy link:", error);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader
        title={editingPromoLink ? "Edit Promo Link" : "Create Promo Link"}
        onClose={onClose}
        showLogo={false}
      />

      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Generated Code Display (shown after creation or in edit mode) */}
          {(generatedCode || editingPromoLink) && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Link2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800 mb-2">
                    Promo Code: {generatedCode || editingPromoLink?.code}
                  </p>
                  {generatedUrl && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={generatedUrl}
                        readOnly
                        className="flex-1 px-3 py-2 bg-white border border-green-300 rounded text-sm text-gray-700"
                      />
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-2"
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

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
              Number of bonus entries users will receive when they make a purchase using this promo link.
            </p>
          </FormSection>

          {/* Package Type Selection */}
          <FormSection title="Apply To Package Types">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="appliesToMembership"
                  checked={formData.appliesToMembership}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      appliesToMembership: e.target.checked,
                    }))
                  }
                  disabled={isSubmitting}
                  className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <label htmlFor="appliesToMembership" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Apply to Membership Packages
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="appliesToOneTime"
                  checked={formData.appliesToOneTime}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      appliesToOneTime: e.target.checked,
                    }))
                  }
                  disabled={isSubmitting}
                  className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <label htmlFor="appliesToOneTime" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Apply to One-Time Packages
                </label>
              </div>
              {packageTypeError && <p className="text-sm text-red-600 mt-1">{packageTypeError}</p>}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Select which package types this promo link should apply to. At least one must be selected for active promo
              links.
            </p>
          </FormSection>

          {/* Campaign Targeting */}
          <FormSection title="Campaign Targeting">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Type</label>
                <select
                  value={formData.campaignType}
                  onChange={(e) => {
                    const nextType = e.target.value as "general" | "cancelled-membership-comeback";
                    if (nextType === "cancelled-membership-comeback") {
                      setFormData((prev) => ({
                        ...prev,
                        campaignType: nextType,
                        eligibilityAudience: "cancelled-members",
                        requireInactiveSubscription: true,
                      }));
                    } else {
                      setFormData((prev) => ({
                        ...prev,
                        campaignType: nextType,
                        eligibilityAudience: "all",
                      }));
                    }
                  }}
                  disabled={isSubmitting}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="general">General Promo</option>
                  <option value="cancelled-membership-comeback">Cancelled Membership Comeback</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Eligibility Audience</label>
                <select
                  value={formData.eligibilityAudience}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      eligibilityAudience: e.target.value as "all" | "cancelled-members",
                    }))
                  }
                  disabled={isSubmitting || formData.campaignType === "cancelled-membership-comeback"}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100"
                >
                  <option value="all">All Users</option>
                  <option value="cancelled-members">Cancelled Members Only</option>
                </select>
                {errors.eligibilityAudience && <p className="mt-1 text-sm text-red-600">{errors.eligibilityAudience}</p>}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="requireInactiveSubscription"
                  checked={formData.requireInactiveSubscription}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      requireInactiveSubscription: e.target.checked,
                    }))
                  }
                  disabled={isSubmitting}
                  className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <label htmlFor="requireInactiveSubscription" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Require no active subscription at redemption
                </label>
              </div>

              <Input
                type="number"
                value={formData.cancelledWithinDays}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    cancelledWithinDays: e.target.value,
                  }))
                }
                min={1}
                placeholder="Optional (e.g. 90)"
                disabled={isSubmitting}
              />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Use “Cancelled Membership Comeback” for Klaviyo win-back campaigns. Optional days restricts eligibility to
              users cancelled within that period.
            </p>
          </FormSection>

          {/* Expiration Date */}
          <FormSection title="Expiration Date (Optional)">
            <DateTimePicker
              id="expiresAt"
              name="expiresAt"
              value={formData.expiresAt}
              onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                const value = e.target.value;
                if (!value) {
                  setFormData((prev) => ({
                    ...prev,
                    expiresAt: "",
                  }));
                  return;
                }

                // DateTimePicker sends UTC date that represents user's local time selection
                // We need to extract what time the user actually selected (in their local timezone)
                // and then interpret that selected time as if it were in AEST/AEDT
                const utcDateFromPicker = new Date(value);

                // Convert UTC back to user's local time to see what they actually selected
                const localTimeZone = resolveLocalDisplayTimeZone();
                const localDate = convertUTCToLocal(utcDateFromPicker, localTimeZone);

                // Extract the local time components (what user actually selected)
                const selectedYear = localDate.getFullYear();
                const selectedMonth = localDate.getMonth() + 1;
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
                  expiresAt: aestDateUTC.toISOString(),
                }));
              }}
              error={errors.expiresAt}
              disabled={isSubmitting}
            />
            <p className="mt-1 text-sm text-gray-500">
              Optional: Set an expiration date for this promo link. Leave empty for no expiration.
            </p>
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
              placeholder="Weekend special promo - 100 bonus entries"
              rows={3}
              maxLength={500}
              disabled={isSubmitting}
            />
            <p className="mt-1 text-sm text-gray-500">Optional admin notes for this promo link (max 500 characters).</p>
          </FormSection>

          {/* Active Toggle */}
          <FormSection title="Status">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    isActive: e.target.checked,
                  }))
                }
                disabled={isSubmitting}
                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
              />
              <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                Active (Promo link is enabled and can be used)
              </label>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Inactive promo links cannot be used, even if they haven&apos;t expired.
            </p>
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
              {generatedCode ? "Close" : "Cancel"}
            </Button>
            <Button type="submit" variant="primary" size="md" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {editingPromoLink ? "Updating..." : "Creating..."}
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4 mr-2" />
                  {editingPromoLink ? "Update Link" : "Create Link"}
                </>
              )}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
};

export default AdminPromoLinkModal;
