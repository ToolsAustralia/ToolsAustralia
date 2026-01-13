"use client";

import React, { useState } from "react";
import { FlaskConical, Plus, Edit, Trash2, Play, Pause, Square, AlertTriangle, Target, Calendar } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  Button,
  FormSection,
} from "@/components/modals/ui";
import {
  useExperiment,
  useCreateVariant,
  useUpdateVariant,
  useDeleteVariant,
} from "@/hooks/queries/useABTestingQueries";
import { format } from "date-fns";
import VariantConfigEditor from "./VariantConfigEditor";
import { Loader2 } from "lucide-react";

interface ExperimentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  experimentId: string;
}

/**
 * Experiment Detail Modal
 * View and manage experiment details and variants using existing modal template
 */
export default function ExperimentDetailModal({
  isOpen,
  onClose,
  experimentId,
}: ExperimentDetailModalProps) {
  const { data: experimentData, isLoading, refetch } = useExperiment(experimentId);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [isCreatingVariant, setIsCreatingVariant] = useState(false);

  const createVariantMutation = useCreateVariant();
  const updateVariantMutation = useUpdateVariant();
  const deleteVariantMutation = useDeleteVariant();

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <ModalContainer isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalHeader title="Loading Experiment..." onClose={onClose} showLogo={false} />
        <ModalContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-red-600" />
          </div>
        </ModalContent>
      </ModalContainer>
    );
  }

  if (!experimentData) {
    return null;
  }

  const { experiment, variants } = experimentData;

  const totalTraffic = variants.reduce((sum, v) => sum + v.trafficPercentage, 0);
  const trafficValid = Math.abs(totalTraffic - 100) < 0.01;

  // Check if experiment is locked (active or ended)
  const isLocked = experiment.status === "active" || experiment.status === "ended";

  const handleDeleteVariant = async (variantId: string) => {
    if (confirm("Are you sure you want to delete this variant?")) {
      try {
        await deleteVariantMutation.mutateAsync({ experimentId, variantId });
        refetch();
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to delete variant");
      }
    }
  };

  const handleClose = () => {
    setEditingVariantId(null);
    setIsCreatingVariant(false);
    onClose();
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="4xl">
      <ModalHeader
        title={experiment.name}
        subtitle={`Status: ${experiment.status.charAt(0).toUpperCase() + experiment.status.slice(1)}`}
        onClose={handleClose}
        showLogo={false}
      />

      <ModalContent>
        <div className="space-y-6">
          {/* Experiment Info */}
          <FormSection title="Experiment Information" icon={FlaskConical}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Target Pages</p>
                <p className="text-sm text-gray-600 mt-1">
                  {experiment.slugTargets.includes("*")
                    ? "All Pages"
                    : `${experiment.slugTargets.length} page(s)`}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Schedule</p>
                <p className="text-sm text-gray-600 mt-1">
                  {experiment.startDate
                    ? `Start: ${format(new Date(experiment.startDate), "MMM d, yyyy")}`
                    : "No start date"}
                  {experiment.endDate &&
                    ` | End: ${format(new Date(experiment.endDate), "MMM d, yyyy")}`}
                </p>
              </div>
            </div>
          </FormSection>

          {/* Variants Section */}
          <FormSection title="Variants" icon={Target}>
            <div className="space-y-4">
              {/* Traffic Split Validation */}
              {!trafficValid && (
                <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <p className="text-sm text-yellow-800">
                    Traffic split must sum to 100%. Current total: {totalTraffic.toFixed(1)}%
                  </p>
                </div>
              )}

              {/* Add Variant Button */}
              {!isLocked && (
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsCreatingVariant(true)}
                    icon={Plus}
                    iconPosition="left"
                  >
                    Add Variant
                  </Button>
                </div>
              )}

              {/* Variants List */}
              <div className="space-y-3">
                {variants.map((variant) => (
                  <div
                    key={variant._id}
                    className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold text-gray-900">{variant.name}</h4>
                        {variant.isControl && (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                            Control
                          </span>
                        )}
                        <span className="text-sm text-gray-500">
                          {variant.trafficPercentage}% traffic
                        </span>
                      </div>
                      {!isLocked && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingVariantId(variant._id)}
                            icon={Edit}
                            iconPosition="left"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeleteVariant(variant._id)}
                            icon={Trash2}
                            iconPosition="left"
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Variant Config Preview */}
                    {(variant.config.hero?.ctaText ||
                      variant.config.banner?.badgeText ||
                      variant.config.packages?.highlightPackage) && (
                      <div className="text-xs text-gray-500 space-y-1">
                        {variant.config.hero?.ctaText && (
                          <div>Hero CTA: {variant.config.hero.ctaText}</div>
                        )}
                        {variant.config.banner?.badgeText && (
                          <div>Banner: {variant.config.banner.badgeText}</div>
                        )}
                        {variant.config.packages?.highlightPackage && (
                          <div>Highlight Package: {variant.config.packages.highlightPackage}</div>
                        )}
                      </div>
                    )}

                    {/* Variant Editor */}
                    {editingVariantId === variant._id && (
                      <VariantConfigEditor
                        variant={variant}
                        experimentId={experimentId}
                        onSave={async (updatedVariant) => {
                          try {
                            await updateVariantMutation.mutateAsync({
                              experimentId,
                              variantId: variant._id,
                              payload: updatedVariant,
                            });
                            setEditingVariantId(null);
                            refetch();
                          } catch (error) {
                            alert(error instanceof Error ? error.message : "Failed to update variant");
                          }
                        }}
                        onCancel={() => setEditingVariantId(null)}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Empty State */}
              {variants.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                  <Target className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-500 mb-2">No variants yet</p>
                  {!isLocked && (
                    <Button
                      variant="primary"
                      onClick={() => setIsCreatingVariant(true)}
                      icon={Plus}
                      iconPosition="left"
                    >
                      Create First Variant
                    </Button>
                  )}
                </div>
              )}
            </div>
          </FormSection>

          {/* Create Variant Form */}
          {isCreatingVariant && (
            <VariantConfigEditor
              experimentId={experimentId}
              onSave={async (newVariant) => {
                try {
                  await createVariantMutation.mutateAsync({
                    experimentId,
                    payload: newVariant,
                  });
                  setIsCreatingVariant(false);
                  refetch();
                } catch (error) {
                  alert(error instanceof Error ? error.message : "Failed to create variant");
                }
              }}
              onCancel={() => setIsCreatingVariant(false)}
            />
          )}
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
