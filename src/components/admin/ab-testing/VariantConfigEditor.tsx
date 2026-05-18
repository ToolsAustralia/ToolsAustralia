"use client";

import React, { useState, useEffect } from "react";
import { Save, X, Image, Type, Package, ShoppingCart, Palette } from "lucide-react";
import { Input, Textarea, Checkbox, Button, FormSection, Select } from "@/components/modals/ui";
import ImageUpload from "@/components/modals/ui/ImageUpload";
import { Variant, CreateVariantPayload } from "@/hooks/queries/useABTestingQueries";
import type { CountdownMode } from "@/utils/promo-banner/countdown-mode";
import { STATIC_URGENCY_LABEL_PRESETS } from "@/utils/promo-banner/countdown-mode";
import type { OneTimePackageSlot, MembershipPackageSlot } from "@/models/ab-testing/Variant";
import type { COLOR_KEYS } from "@/utils/package-colors/packageColorScheme";

const COLOR_KEYS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Use default" },
  { value: "kincrome-blue", label: "Kincrome Blue" },
  { value: "ryobi-green", label: "Ryobi Green" },
  { value: "makita-teal", label: "Makita Teal" },
  { value: "dewalt-yellow", label: "DeWalt Yellow" },
  { value: "milwaukee-red", label: "Milwaukee Red" },
  { value: "black", label: "Black" },
  { value: "mint-green", label: "Mint Green" },
  { value: "cash-green", label: "Cash Green" },
];

const ONE_TIME_SLOTS: { key: OneTimePackageSlot; label: string }[] = [
  { key: "apprentice-pack", label: "Apprentice" },
  { key: "tradie-pack", label: "Tradie" },
  { key: "foreman-pack", label: "Foreman" },
  { key: "boss-pack", label: "Boss" },
  { key: "power-pack", label: "Power" },
  { key: "vip-pack", label: "VIP" },
  { key: "black-pack", label: "Black" },
  { key: "mint-pack", label: "Mint" },
  { key: "cash-prize", label: "Cash" },
];

const MEMBERSHIP_SLOTS: { key: MembershipPackageSlot; label: string }[] = [
  { key: "apprentice-pack", label: "Apprentice" },
  { key: "tradie-pack", label: "Tradie" },
  { key: "foreman-pack", label: "Foreman" },
  { key: "boss-pack", label: "Boss" },
  { key: "power-pack", label: "Power" },
  { key: "vip-pack", label: "VIP" },
];

const VARIANT_BANNER_CLOUDINARY_FOLDER = "promo-banner";

async function uploadVariantBannerLeftImage(file: File): Promise<string> {
  const uploadFormData = new FormData();
  uploadFormData.append("file", file);
  uploadFormData.append("folder", VARIANT_BANNER_CLOUDINARY_FOLDER);

  const response = await fetch("/api/upload/cloudinary", {
    method: "POST",
    body: uploadFormData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to upload banner image");
  }

  const data = await response.json();
  return data.url as string;
}

interface VariantConfigEditorProps {
  variant?: Variant;
  experimentId: string;
  onSave: (variant: CreateVariantPayload) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Variant Config Editor
 * Edit variant configuration using existing form components
 */
export default function VariantConfigEditor({ variant, experimentId: _experimentId, onSave, onCancel }: VariantConfigEditorProps) {
  const [formData, setFormData] = useState<CreateVariantPayload>({
    name: variant?.name || "",
    trafficPercentage: variant?.trafficPercentage || 50,
    isControl: variant?.isControl ?? false,
    config: {
      hero: variant?.config?.hero ?? {},
      banner: variant?.config?.banner ?? {},
      packages: variant?.config?.packages ?? {},
      membershipModal: variant?.config?.membershipModal ?? {},
      packageColors: variant?.config?.packageColors ?? { oneTime: {}, membership: {} },
      membershipTheme: variant?.config?.membershipTheme ?? {},
    },
  });

  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const [bannerLeftImages, setBannerLeftImages] = useState<(File | string)[]>(() => {
    const u = variant?.config?.banner?.leftImageUrl?.trim();
    return u ? [u] : [];
  });

  useEffect(() => {
    const u = variant?.config?.banner?.leftImageUrl?.trim();
    setBannerLeftImages(u ? [u] : []);
  }, [variant?._id, variant?.config?.banner?.leftImageUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!formData.name.trim()) {
      setErrors({ name: "Variant name is required" });
      return;
    }

    if (formData.trafficPercentage < 0 || formData.trafficPercentage > 100) {
      setErrors({ trafficPercentage: "Traffic percentage must be between 0 and 100" });
      return;
    }

    const countdownMode = formData.config.banner?.countdownMode || "default";
    if (countdownMode === "static_urgency") {
      const label = formData.config.banner?.countdownLabel?.trim();
      if (!label) {
        setErrors({ countdownLabel: "Label is required when using static urgency mode" });
        return;
      }
      if (label.length > 50) {
        setErrors({ countdownLabel: "Label must be 50 characters or less" });
        return;
      }
    }

    try {
      let leftImageUrl: string | undefined = formData.config.banner?.leftImageUrl?.trim() || undefined;
      const first = bannerLeftImages[0];
      if (first instanceof File) {
        leftImageUrl = await uploadVariantBannerLeftImage(first);
      } else if (typeof first === "string" && first.trim()) {
        leftImageUrl = first.trim();
      }

      const banner = { ...(formData.config.banner ?? {}) };
      delete (banner as { badgeText?: string }).badgeText;

      const payload: CreateVariantPayload = {
        ...formData,
        config: {
          ...formData.config,
          banner: {
            ...banner,
            leftImageUrl: leftImageUrl || undefined,
          },
        },
      };

      await Promise.resolve(onSave(payload));
    } catch (err) {
      setErrors({
        leftImageUrl: err instanceof Error ? err.message : "Failed to upload banner image",
      });
    }
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
            value={
              typeof formData.config.hero?.imageSrc === "string"
                ? formData.config.hero.imageSrc
                : (formData.config.hero?.imageSrc?.desktop ?? "")
            }
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
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-neutral-200">Promo banner left image</p>
            <p className="text-xs text-gray-500">
              Upload is sent to Cloudinary only when you save the variant. You can also paste an image URL.
            </p>
            <ImageUpload
              images={bannerLeftImages}
              onImagesChange={(imgs) => {
                setBannerLeftImages(imgs);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.leftImageUrl;
                  return next;
                });
                const v = imgs[0];
                if (v == null) {
                  setFormData((prev) => ({
                    ...prev,
                    config: {
                      ...prev.config,
                      banner: { ...prev.config.banner, leftImageUrl: undefined },
                    },
                  }));
                  return;
                }
                if (typeof v === "string") {
                  setFormData((prev) => ({
                    ...prev,
                    config: {
                      ...prev.config,
                      banner: { ...prev.config.banner, leftImageUrl: v.trim() || undefined },
                    },
                  }));
                }
              }}
              maxImages={1}
              maxFileSize={10}
              label=""
              uploadToCloudinary={false}
            />
            {errors.leftImageUrl && <p className="text-sm text-red-600">{errors.leftImageUrl}</p>}
          </div>
          <Input
            id="bannerLeftImageUrl"
            name="bannerLeftImageUrl"
            type="text"
            value={formData.config.banner?.leftImageUrl || ""}
            onChange={(e) => {
              const v = e.target.value;
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  banner: { ...formData.config.banner, leftImageUrl: v || undefined },
                },
              });
              if (v.trim()) {
                setBannerLeftImages([v.trim()]);
              } else {
                setBannerLeftImages([]);
              }
            }}
            label="Left image URL (optional)"
            placeholder="https://res.cloudinary.com/... or leave empty for default / scheduled / static"
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
          <Select
            id="countdownMode"
            name="countdownMode"
            value={formData.config.banner?.countdownMode || "default"}
            onChange={(e) => {
              const mode = e.target.value as CountdownMode;
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  banner: {
                    ...formData.config.banner,
                    countdownMode: mode,
                    // Clear countdownLabel when switching away from static_urgency
                    ...(mode !== "static_urgency" ? { countdownLabel: undefined } : {}),
                  },
                },
              });
              setErrors((prev) => {
                const next = { ...prev };
                delete next.countdownLabel;
                return next;
              });
            }}
            label="Countdown behaviour"
            options={[
              {
                value: "default",
                label: "Draw/midnight countdown",
                description: "Draw tonight or midnight-style countdown when applicable",
              },
              {
                value: "scheduled_end",
                label: "Scheduled end timer",
                description: "Timer to scheduled promo end; DAYS HRS MINS when >24h, HRS MINS SECS when ≤24h",
              },
              {
                value: "limited_time_only",
                label: "Limited time only",
                description: "Show LIMITED TIME ONLY unless scheduled promo is <24h (then show countdown)",
              },
              {
                value: "ending",
                label: "Ending",
                description: "Show PROMO ENDING unless scheduled promo is <24h (then show countdown)",
              },
              {
                value: "static_urgency",
                label: "Static urgency label (custom)",
                description: "Custom label unless scheduled promo is <24h (then show countdown). Configure label below.",
              },
            ]}
          />
          {(formData.config.banner?.countdownMode === "static_urgency" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200">Urgency label</label>
              <div className="flex flex-wrap gap-2">
                {STATIC_URGENCY_LABEL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        config: {
                          ...formData.config,
                          banner: {
                            ...formData.config.banner,
                            countdownLabel: preset,
                          },
                        },
                      })
                    }
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      formData.config.banner?.countdownLabel === preset
                        ? "bg-amber-600 text-white"
                        : "bg-gray-200 text-gray-700 dark:text-neutral-200 hover:bg-gray-300"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <Input
                id="countdownLabel"
                name="countdownLabel"
                type="text"
                value={formData.config.banner?.countdownLabel || ""}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    config: {
                      ...formData.config,
                      banner: {
                        ...formData.config.banner,
                        countdownLabel: e.target.value,
                      },
                    },
                  });
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.countdownLabel;
                    return next;
                  });
                }}
                label="Custom label (or use presets above)"
                placeholder="e.g. ENDING SOON, FLASH SALE"
                maxLength={50}
                error={errors.countdownLabel}
                required
              />
            </div>
          )) ||
            null}
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

      {/* Package Colors Split Test */}
      <FormSection title="Package colors (split test)" icon={Palette}>
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Override package colors for this variant. Conversions will appear in the same experiment&apos;s analytics. Leave empty to use default colors.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">One-time packages</h4>
              <div className="space-y-2">
                {ONE_TIME_SLOTS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="w-24 text-sm text-gray-600 dark:text-neutral-400 shrink-0">{label}</label>
                    <Select
                      id={`oneTime-${key}`}
                      value={formData.config.packageColors?.oneTime?.[key] ?? ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: {
                            ...formData.config,
                            packageColors: {
                              ...formData.config.packageColors,
                              oneTime: {
                                ...formData.config.packageColors?.oneTime,
                                [key]: (e.target.value || undefined) as COLOR_KEYS | undefined,
                              },
                            },
                          },
                        })
                      }
                      options={COLOR_KEYS_OPTIONS}
                      placeholder="Default"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">Membership packages</h4>
              <div className="space-y-2">
                {MEMBERSHIP_SLOTS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="w-24 text-sm text-gray-600 dark:text-neutral-400 shrink-0">{label}</label>
                    <Select
                      id={`membership-${key}`}
                      value={formData.config.packageColors?.membership?.[key] ?? ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: {
                            ...formData.config,
                            packageColors: {
                              ...formData.config.packageColors,
                              membership: {
                                ...formData.config.packageColors?.membership,
                                [key]: (e.target.value || undefined) as COLOR_KEYS | undefined,
                              },
                            },
                          },
                        })
                      }
                      options={COLOR_KEYS_OPTIONS}
                      placeholder="Default"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </FormSection>

      {/* Membership Modal Config */}
      <FormSection title="Membership Modal Configuration" icon={ShoppingCart}>
        <div className="space-y-4">
          <Checkbox
            id="showPackageSelectionFirst"
            name="showPackageSelectionFirst"
            checked={formData.config.membershipModal?.showPackageSelectionFirst ?? false}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  membershipModal: {
                    ...formData.config.membershipModal,
                    showPackageSelectionFirst: e.target.checked,
                  },
                },
              })
            }
            label="Show Package Selection First"
            description="When enabled, automatically opens package selection modal on step 2 for users coming from promotion/landing pages. This allows users to see all package options before proceeding with payment."
          />
        </div>
      </FormSection>

      {/* Membership Section Theme (A/B dark-mode test) */}
      <FormSection title="Membership Section Theme" icon={Palette}>
        <div className="space-y-4">
          <Checkbox
            id="membershipForceLight"
            name="membershipForceLight"
            checked={formData.config.membershipTheme?.forceLight ?? false}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  membershipTheme: {
                    ...formData.config.membershipTheme,
                    forceLight: e.target.checked,
                  },
                },
              })
            }
            label="Force light mode on the membership section"
            description="A/B test: when enabled, the membership section always renders in light mode for this variant, ignoring the site's dark-mode schedule/toggle. Leave OFF for the control variant."
          />
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
