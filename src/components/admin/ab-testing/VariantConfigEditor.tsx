"use client";

import React, { useState } from "react";
import { Save, X, Image, Type, Package } from "lucide-react";
import {
  Input,
  Textarea,
  Checkbox,
  Button,
  FormSection,
} from "@/components/modals/ui";
import { Variant, CreateVariantPayload } from "@/hooks/queries/useABTestingQueries";

interface VariantConfigEditorProps {
  variant?: Variant;
  experimentId: string;
  onSave: (variant: CreateVariantPayload) => void;
  onCancel: () => void;
}

/**
 * Variant Config Editor
 * Edit variant configuration using existing form components
 */
export default function VariantConfigEditor({
  variant,
  experimentId,
  onSave,
  onCancel,
}: VariantConfigEditorProps) {
  const [formData, setFormData] = useState<CreateVariantPayload>({
    name: variant?.name || "",
    trafficPercentage: variant?.trafficPercentage || 50,
    isControl: variant?.isControl ?? false,
    config: variant?.config || {
      hero: {},
      banner: {},
      packages: {},
    },
  });

  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validation
    if (!formData.name.trim()) {
      setErrors({ name: "Variant name is required" });
      return;
    }

    if (formData.trafficPercentage < 0 || formData.trafficPercentage > 100) {
      setErrors({ trafficPercentage: "Traffic percentage must be between 0 and 100" });
      return;
    }

    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      {/* Basic Info */}
      <FormSection title="Basic Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            id="variantName"
            name="variantName"
            type="text"
            value={formData.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value });
              setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors.name;
                return newErrors;
              });
            }}
            label="Variant Name"
            placeholder="e.g., Control, Variant A"
            required
            maxLength={100}
            error={errors.name}
          />
          <Input
            id="trafficPercentage"
            name="trafficPercentage"
            type="number"
            value={formData.trafficPercentage}
            onChange={(e) => {
              setFormData({
                ...formData,
                trafficPercentage: parseFloat(e.target.value) || 0,
              });
              setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors.trafficPercentage;
                return newErrors;
              });
            }}
            label="Traffic Percentage"
            required
            min={0}
            max={100}
            step={0.1}
            error={errors.trafficPercentage}
          />
        </div>
        <Checkbox
          id="isControl"
          name="isControl"
          checked={formData.isControl ?? false}
          onChange={(e) => setFormData({ ...formData, isControl: e.target.checked })}
          label="Control Variant"
          description="Mark this as the control variant for comparison"
        />
      </FormSection>

      {/* Hero Config */}
      <FormSection title="Hero Configuration" icon={Image}>
        <div className="space-y-4">
          <Input
            id="heroImageSrc"
            name="heroImageSrc"
            type="text"
            value={formData.config.hero?.imageSrc || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  hero: { ...formData.config.hero, imageSrc: e.target.value },
                },
              })
            }
            label="Hero Image URL (Optional)"
            placeholder="/images/background/promo/custom-hero.webp"
          />
          <Input
            id="heroCtaText"
            name="heroCtaText"
            type="text"
            value={formData.config.hero?.ctaText || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  hero: { ...formData.config.hero, ctaText: e.target.value },
                },
              })
            }
            label="CTA Button Text (Optional)"
            placeholder="ENTER NOW"
          />
          <Textarea
            id="heroMessaging"
            name="heroMessaging"
            value={formData.config.hero?.messaging || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  hero: { ...formData.config.hero, messaging: e.target.value },
                },
              })
            }
            label="Hero Messaging (Optional)"
            placeholder="Optional hero text overlay"
            rows={2}
          />
        </div>
      </FormSection>

      {/* Banner Config */}
      <FormSection title="Banner Configuration" icon={Type}>
        <div className="space-y-4">
          <Input
            id="bannerBadgeText"
            name="bannerBadgeText"
            type="text"
            value={formData.config.banner?.badgeText || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  banner: { ...formData.config.banner, badgeText: e.target.value },
                },
              })
            }
            label="Badge Text (Optional)"
            placeholder="FIRST 500 PEOPLE"
          />
          <Input
            id="bannerMultiplier"
            name="bannerMultiplier"
            type="number"
            value={formData.config.banner?.multiplier || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  banner: {
                    ...formData.config.banner,
                    multiplier: e.target.value ? parseFloat(e.target.value) : undefined,
                  },
                },
              })
            }
            label="Multiplier (Optional)"
            placeholder="2, 3, 5, or 10"
            min={1}
            max={10}
          />
          <Checkbox
            id="showCountdown"
            name="showCountdown"
            checked={formData.config.banner?.showCountdown ?? true}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  banner: {
                    ...formData.config.banner,
                    showCountdown: e.target.checked,
                  },
                },
              })
            }
            label="Show Countdown Timer"
            description="Display the countdown timer in the banner"
          />
        </div>
      </FormSection>

      {/* Packages Config */}
      <FormSection title="Packages Configuration" icon={Package}>
        <div className="space-y-4">
          <Input
            id="highlightPackage"
            name="highlightPackage"
            type="text"
            value={formData.config.packages?.highlightPackage || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  packages: {
                    ...formData.config.packages,
                    highlightPackage: e.target.value,
                  },
                },
              })
            }
            label="Highlight Package ID (Optional)"
            placeholder="e.g., tradie-monthly"
          />
          <Textarea
            id="hidePackages"
            name="hidePackages"
            value={formData.config.packages?.hidePackages?.join(", ") || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  packages: {
                    ...formData.config.packages,
                    hidePackages: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                },
              })
            }
            label="Hide Package IDs (Optional)"
            placeholder="Comma-separated package IDs to hide"
            rows={2}
          />
          <p className="text-xs text-gray-500">
            Note: Package display order and other advanced configurations can be added in future updates.
          </p>
        </div>
      </FormSection>

      {/* Error Display */}
      {Object.keys(errors).length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p className="text-sm">Please fix the errors above before saving.</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
        <Button type="button" variant="secondary" onClick={onCancel} icon={X} iconPosition="left">
          Cancel
        </Button>
        <Button type="submit" variant="primary" icon={Save} iconPosition="left">
          Save Variant
        </Button>
      </div>
    </form>
  );
}
