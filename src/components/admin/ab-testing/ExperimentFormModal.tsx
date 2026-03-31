"use client";

import React, { useState, useEffect } from "react";
import { FlaskConical, AlertTriangle, Loader2, Target, Calendar, Settings } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  Input,
  Select,
  Button,
  FormSection,
  Checkbox,
} from "@/components/modals/ui";
import { useCreateExperiment, CreateExperimentPayload, StoppingRules } from "@/hooks/queries/useABTestingQueries";
import { listPrizes } from "@/config/prizes";
import DateRangeCalendar from "@/components/admin/DateRangeCalendar";
import { createAESTDateAsUTC } from "@/utils/common/timezone";

interface ExperimentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Experiment Form Modal
 * Create new A/B testing experiment using existing modal template
 */
export default function ExperimentFormModal({ isOpen, onClose, onSuccess }: ExperimentFormModalProps) {
  const [formData, setFormData] = useState<CreateExperimentPayload & { status: string }>({
    name: "",
    status: "draft",
    slugTargets: [],
    startDate: "",
    endDate: "",
  });
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [stoppingRules, setStoppingRules] = useState<StoppingRules>({
    autoEndEnabled: false,
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createMutation = useCreateExperiment();
  const prizes = listPrizes();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: "",
        status: "draft",
        slugTargets: [],
        startDate: "",
        endDate: "",
      });
      setSelectedSlugs([]);
      setSelectAll(false);
      setStartDate(null);
      setEndDate(null);
      setStoppingRules({ autoEndEnabled: false });
      setErrors({});
    }
  }, [isOpen]);

  // Convert Date objects to ISO strings for API
  const convertDateToISO = (date: Date | null): string | undefined => {
    if (!date) return undefined;
    // Extract date components and create AEST date as UTC
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours() || 0;
    const minute = date.getMinutes() || 0;
    const aestDateUTC = createAESTDateAsUTC(year, month, day, hour, minute);
    return aestDateUTC.toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validation
    if (!formData.name.trim()) {
      setErrors({ name: "Experiment name is required" });
      return;
    }

    if (!selectAll && selectedSlugs.length === 0) {
      setErrors({ slugTargets: "Please select at least one target page or select 'All Pages'" });
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setErrors({ endDate: "End date must be after start date" });
      return;
    }

    setIsSubmitting(true);

    try {
      await createMutation.mutateAsync({
        ...formData,
        slugTargets: selectAll ? ["*"] : selectedSlugs.length > 0 ? selectedSlugs : [],
        startDate: convertDateToISO(startDate) || undefined,
        endDate: convertDateToISO(endDate) || undefined,
        stoppingRules: stoppingRules.autoEndEnabled ? stoppingRules : undefined,
      });
      onSuccess();
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : "Failed to create experiment",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSlugToggle = (slug: string) => {
    if (selectedSlugs.includes(slug)) {
      setSelectedSlugs(selectedSlugs.filter((s) => s !== slug));
    } else {
      setSelectedSlugs([...selectedSlugs, slug]);
    }
              setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors.slugTargets;
                return newErrors;
              });
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectAll(false);
      setSelectedSlugs([]);
    } else {
      setSelectAll(true);
      setSelectedSlugs([]);
    }
              setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors.slugTargets;
                return newErrors;
              });
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="2xl">
      <ModalHeader
        title="Create A/B Testing Experiment"
        subtitle="Set up a new experiment to test different variants of your promotion pages"
        onClose={handleClose}
        showLogo={false}
      />

      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Experiment Name */}
          <FormSection title="Experiment Details" icon={FlaskConical}>
            <Input
              id="name"
              name="name"
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
              label="Experiment Name"
              placeholder="e.g., Hero CTA Test - January 2025"
              required
              maxLength={200}
              error={errors.name}
              disabled={isSubmitting}
            />
          </FormSection>

          {/* Status */}
          <FormSection title="Status">
            <Select
              id="status"
              name="status"
              value={formData.status}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  status: e.target.value as "draft" | "active" | "paused" | "ended",
                })
              }
              label="Initial Status"
              options={[
                { value: "draft", label: "Draft" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
              ]}
              disabled={isSubmitting}
            />
          </FormSection>

          {/* Target Pages */}
          <FormSection title="Target Pages" icon={Target}>
            <div className="space-y-3">
              <Checkbox
                id="selectAll"
                name="selectAll"
                checked={selectAll}
                onChange={(_e) => handleSelectAll()}
                label="All Pages (*)"
                description="Apply experiment to all promotion pages"
                disabled={isSubmitting}
              />

              {!selectAll && (
                <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">Select specific pages:</p>
                  {prizes.map((prize) => (
                    <Checkbox
                      key={prize.slug}
                      id={`slug-${prize.slug}`}
                      name={`slug-${prize.slug}`}
                      checked={selectedSlugs.includes(prize.slug)}
                      onChange={() => handleSlugToggle(prize.slug)}
                      label={prize.label}
                      disabled={isSubmitting}
                    />
                  ))}
                </div>
              )}

              {errors.slugTargets && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {errors.slugTargets}
                </p>
              )}
            </div>
          </FormSection>

          {/* Date Range */}
          <FormSection title="Schedule (Optional)" icon={Calendar}>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-neutral-400">
                Optionally set start and end dates for the experiment. Leave empty to run indefinitely.
              </p>
              <DateRangeCalendar
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={(date) => {
                  setStartDate(date);
                  setErrors((prev) => {
                    const newErrors = { ...prev };
                    delete newErrors.startDate;
                    delete newErrors.endDate;
                    return newErrors;
                  });
                }}
                onEndDateChange={(date) => {
                  setEndDate(date);
                  setErrors((prev) => {
                    const newErrors = { ...prev };
                    delete newErrors.endDate;
                    return newErrors;
                  });
                }}
                minDate={new Date()}
              />
              {errors.endDate && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {errors.endDate}
                </p>
              )}
              <p className="text-sm text-gray-500">All dates are in AEST timezone.</p>
            </div>
          </FormSection>

          {/* Stopping Rules */}
          <FormSection title="Stopping Rules (Optional)" icon={Settings}>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-neutral-400">
                Configure automatic stopping rules to end the experiment when certain conditions are met.
              </p>

              <Checkbox
                id="autoEndEnabled"
                name="autoEndEnabled"
                checked={stoppingRules.autoEndEnabled || false}
                onChange={(e) => {
                  setStoppingRules({
                    ...stoppingRules,
                    autoEndEnabled: e.target.checked,
                  });
                }}
                label="Enable Automatic Ending"
                description="Automatically end experiment when stopping rules are met"
                disabled={isSubmitting}
              />

              {stoppingRules.autoEndEnabled && (
                <div className="space-y-4 pl-6 border-l-2 border-gray-200">
                  <div>
                    <Input
                      id="minConversions"
                      name="minConversions"
                      type="number"
                      value={stoppingRules.minConversions?.toString() || ""}
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        setStoppingRules({
                          ...stoppingRules,
                          minConversions: value && value > 0 ? value : undefined,
                        });
                      }}
                      label="Minimum Conversions per Variant"
                      placeholder="e.g., 100"
                      min={0}
                      disabled={isSubmitting}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      End experiment when each variant reaches this many conversions
                    </p>
                  </div>

                  <div>
                    <Select
                      id="confidenceThreshold"
                      name="confidenceThreshold"
                      value={stoppingRules.confidenceThreshold?.toString() || ""}
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        setStoppingRules({
                          ...stoppingRules,
                          confidenceThreshold: value,
                        });
                      }}
                      label="Confidence Threshold (%)"
                      options={[
                        { value: "", label: "Select threshold..." },
                        { value: "80", label: "80% (Low)" },
                        { value: "90", label: "90% (Medium)" },
                        { value: "95", label: "95% (High - Recommended)" },
                        { value: "99", label: "99% (Very High)" },
                      ]}
                      disabled={isSubmitting}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      End experiment when statistical significance reaches this confidence level
                    </p>
                  </div>

                  <div>
                    <Input
                      id="maxDuration"
                      name="maxDuration"
                      type="number"
                      value={stoppingRules.maxDuration?.toString() || ""}
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        setStoppingRules({
                          ...stoppingRules,
                          maxDuration: value && value > 0 ? value : undefined,
                        });
                      }}
                      label="Maximum Duration (Days)"
                      placeholder="e.g., 30"
                      min={1}
                      disabled={isSubmitting}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Automatically end experiment after this many days
                    </p>
                  </div>
                </div>
              )}
            </div>
          </FormSection>

          {/* Error Display */}
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>{errors.submit}</span>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting} loading={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                "Create Experiment"
              )}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
}
