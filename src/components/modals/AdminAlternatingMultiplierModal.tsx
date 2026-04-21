"use client";

import React, { useState, useEffect } from "react";
import { Zap, AlertTriangle, Loader2, Info } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  Textarea,
  Button,
  FormSection,
  Select,
  Checkbox,
} from "./ui";
import {
  useCreateAlternatingMultiplier,
  useUpdateAlternatingMultiplier,
} from "@/hooks/queries/useAlternatingMultiplierQueries";
import type {
  AlternatingPromoMultiplier,
  CreateAlternatingPromoMultiplierPayload,
  UpdateAlternatingPromoMultiplierPayload,
  AlternatingPromoMultiplierType,
} from "@/types/admin";
import { getAlternatingMultiplier } from "@/utils/promo-banner/alternating-multiplier-manager";
import { PROMO_MULTIPLIERS } from "@/types/promo-multiplier";

interface AdminAlternatingMultiplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editingConfig?: AlternatingPromoMultiplier | null; // If provided, modal is in edit mode
}

interface AlternatingMultiplierFormData {
  type: AlternatingPromoMultiplierType;
  selectedMultipliers: number[]; // Array of selected multipliers (must be exactly 2)
  isEnabled: boolean;
  description: string;
}

const VALID_MULTIPLIERS = PROMO_MULTIPLIERS;
const PACKAGE_TYPES: { value: AlternatingPromoMultiplierType; label: string }[] = [
  { value: "membership-packages", label: "Membership Packages" },
  { value: "one-time-packages", label: "One-Time Packages" },
  { value: "mini-packages", label: "Mini Packages" },
];

const AdminAlternatingMultiplierModal: React.FC<AdminAlternatingMultiplierModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingConfig,
}) => {
  const createMutation = useCreateAlternatingMultiplier();
  const updateMutation = useUpdateAlternatingMultiplier();

  const [formData, setFormData] = useState<AlternatingMultiplierFormData>({
    type: "membership-packages",
    selectedMultipliers: [],
    isEnabled: false,
    description: "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof AlternatingMultiplierFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form data when modal opens or editingConfig changes
  useEffect(() => {
    if (isOpen) {
      if (editingConfig) {
        // Edit mode: populate form with existing data
        setFormData({
          type: editingConfig.type,
          selectedMultipliers: editingConfig.multipliers,
          isEnabled: editingConfig.isEnabled,
          description: editingConfig.description || "",
        });
      } else {
        // Create mode: set defaults
        setFormData({
          type: "membership-packages",
          selectedMultipliers: [],
          isEnabled: false,
          description: "",
        });
      }
      setErrors({});
    }
  }, [isOpen, editingConfig]);

  // Calculate current multiplier for preview
  const currentMultiplier = formData.selectedMultipliers.length === 2
    ? getAlternatingMultiplier(formData.selectedMultipliers as [number, number])
    : null;

  const handleMultiplierToggle = (multiplier: number) => {
    setFormData((prev) => {
      const current = prev.selectedMultipliers;
      const isSelected = current.includes(multiplier);

      if (isSelected) {
        // Remove multiplier
        return {
          ...prev,
          selectedMultipliers: current.filter((m) => m !== multiplier),
        };
      } else {
        // Add multiplier (but limit to 2)
        if (current.length >= 2) {
          // Replace the first one if already at limit
          return {
            ...prev,
            selectedMultipliers: [current[1], multiplier],
          };
        }
        return {
          ...prev,
          selectedMultipliers: [...current, multiplier],
        };
      }
    });
    // Clear error when user makes selection
    setErrors((prev) => ({ ...prev, selectedMultipliers: undefined }));
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof AlternatingMultiplierFormData, string>> = {};

    if (formData.selectedMultipliers.length !== 2) {
      newErrors.selectedMultipliers = "Please select exactly 2 multipliers";
    } else if (formData.selectedMultipliers[0] === formData.selectedMultipliers[1]) {
      newErrors.selectedMultipliers = "Multipliers must be different";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingConfig) {
        // Update existing config
        const updateData: UpdateAlternatingPromoMultiplierPayload = {
          multipliers: formData.selectedMultipliers as [number, number],
          isEnabled: formData.isEnabled,
          description: formData.description.trim() || undefined,
        };

        await updateMutation.mutateAsync({
          id: editingConfig.id,
          data: updateData,
        });
      } else {
        // Create new config
        const createData: CreateAlternatingPromoMultiplierPayload = {
          type: formData.type,
          multipliers: formData.selectedMultipliers as [number, number],
          isEnabled: formData.isEnabled,
          description: formData.description.trim() || undefined,
        };

        await createMutation.mutateAsync(createData);
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to save alternating multiplier config:", error);
      // Error handling is done by the mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="lg">
      <ModalHeader
        title={editingConfig ? "Edit Alternating Multiplier" : "Create Alternating Multiplier"}
        onClose={handleClose}
        showLogo={false}
      />

      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Package Type */}
          <FormSection title="Package Type" icon={Zap}>
            <Select
              id="type"
              name="type"
              value={formData.type}
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  type: e.target.value as AlternatingPromoMultiplierType,
                }));
                setErrors({});
              }}
              label="Package Type"
              options={PACKAGE_TYPES}
              error={errors.type}
              disabled={isSubmitting || !!editingConfig} // Disable type selection in edit mode
            />
            {editingConfig && (
              <p className="text-sm text-gray-500 mt-1">
                Package type cannot be changed after creation. Delete and create a new config to change type.
              </p>
            )}
          </FormSection>

          {/* Multiplier Selection */}
          <FormSection title="Select Two Multipliers">
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-neutral-400">
                Select exactly 2 multipliers that will alternate daily. The system will automatically switch between
                them at midnight AEST.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {VALID_MULTIPLIERS.map((multiplier) => {
                  const isSelected = formData.selectedMultipliers.includes(multiplier);
                  const isDisabled = !isSelected && formData.selectedMultipliers.length >= 2;

                  return (
                    <label
                      key={multiplier}
                      className={`
                        flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all
                        ${isSelected ? "border-red-600 bg-red-50" : "border-gray-200 hover:border-gray-300"}
                        ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleMultiplierToggle(multiplier)}
                        disabled={isDisabled || isSubmitting}
                        className="w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500"
                      />
                      <span className="text-lg font-semibold">{multiplier}x</span>
                    </label>
                  );
                })}
              </div>
              {errors.selectedMultipliers && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {errors.selectedMultipliers}
                </p>
              )}
              {formData.selectedMultipliers.length === 2 && currentMultiplier && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-blue-800">
                    <Info className="w-4 h-4" />
                    <span>
                      <strong>Today&apos;s multiplier:</strong> {currentMultiplier}x (will alternate to{" "}
                      {formData.selectedMultipliers.find((m) => m !== currentMultiplier)}x tomorrow)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </FormSection>

          {/* Enable/Disable */}
          <FormSection title="Settings">
            <div className="flex items-center gap-3">
              <Checkbox
                id="isEnabled"
                name="isEnabled"
                checked={formData.isEnabled}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    isEnabled: e.target.checked,
                  }))
                }
                disabled={isSubmitting}
              />
              <label htmlFor="isEnabled" className="text-sm font-medium text-gray-700 dark:text-neutral-200 cursor-pointer">
                Enable alternating multiplier
              </label>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              When enabled, the alternating multiplier will be used when no active promo exists for this package type.
            </p>
          </FormSection>

          {/* Description */}
          <FormSection title="Description (Optional)">
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              label="Description"
              placeholder="e.g., Alternates between 5x and 10x for membership packages"
              maxLength={500}
              error={errors.description}
              disabled={isSubmitting}
              rows={3}
            />
            <p className="text-sm text-gray-500 mt-1">{formData.description.length}/500 characters</p>
          </FormSection>

          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || formData.selectedMultipliers.length !== 2}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : editingConfig ? (
                "Update Configuration"
              ) : (
                "Create Configuration"
              )}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
};

export default AdminAlternatingMultiplierModal;

