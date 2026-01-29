"use client";

import React, { useState, useEffect } from "react";
import { Calendar, AlertTriangle, Loader2 } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent, Input, Textarea, Button, DateTimePicker, FormSection } from "./ui";
import {
  useCreateScheduledPromo,
  useUpdateScheduledPromo,
  useScheduledPromos,
} from "@/hooks/queries/useScheduledPromoQueries";
import type {
  ScheduledPromo,
  ScheduledPromoType,
  ScheduledPromoMultiplier,
  CreateScheduledPromoPayload,
  UpdateScheduledPromoPayload,
} from "@/types/admin";
import {
  createAESTDateAsUTC,
  convertUTCToLocal,
  convertLocalToUTC,
  resolveLocalDisplayTimeZone,
} from "@/utils/common/timezone";

interface AdminScheduledPromoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editingPromo?: ScheduledPromo | null;
}

interface ScheduledPromoFormData {
  type: ScheduledPromoType;
  multiplier: ScheduledPromoMultiplier;
  startDate: string;
  endDate: string;
  name: string;
  description: string;
}

const MULTIPLIER_OPTIONS: ScheduledPromoMultiplier[] = [2, 3, 5, 10];

const AdminScheduledPromoModal: React.FC<AdminScheduledPromoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingPromo,
}) => {
  const createMutation = useCreateScheduledPromo();
  const updateMutation = useUpdateScheduledPromo();
  const { refetch: refetchPromos } = useScheduledPromos();

  const [formData, setFormData] = useState<ScheduledPromoFormData>({
    type: "membership-packages",
    multiplier: 5,
    startDate: "",
    endDate: "",
    name: "",
    description: "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof ScheduledPromoFormData, string>>>({});
  const [overlapError, setOverlapError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingPromo) {
        setFormData({
          type: editingPromo.type,
          multiplier: editingPromo.multiplier,
          startDate: editingPromo.startDate,
          endDate: editingPromo.endDate,
          name: editingPromo.name || "",
          description: editingPromo.description || "",
        });
      } else {
        const now = new Date();
        const localTimeZone = resolveLocalDisplayTimeZone();
        const localNow = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
        const startDateUTC = convertLocalToUTC(localNow, localTimeZone);
        const endDateLocal = new Date(localNow);
        endDateLocal.setDate(endDateLocal.getDate() + 2);
        endDateLocal.setHours(23, 59, 59, 999);
        const endDateUTC = convertLocalToUTC(endDateLocal, localTimeZone);

        setFormData({
          type: "membership-packages",
          multiplier: 5,
          startDate: startDateUTC.toISOString(),
          endDate: endDateUTC.toISOString(),
          name: "",
          description: "",
        });
      }
      setErrors({});
      setOverlapError(null);
    }
  }, [isOpen, editingPromo]);

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof ScheduledPromoFormData, string>> = {};

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

  const handleDateChange = (
    field: "startDate" | "endDate",
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    const utcDateFromPicker = new Date(value);
    const localTimeZone = resolveLocalDisplayTimeZone();
    const localDate = convertUTCToLocal(utcDateFromPicker, localTimeZone);

    const selectedYear = localDate.getFullYear();
    const selectedMonth = localDate.getMonth() + 1;
    const selectedDay = localDate.getDate();
    const selectedHour = localDate.getHours();
    const selectedMinute = localDate.getMinutes();

    const aestDateUTC = createAESTDateAsUTC(
      selectedYear,
      selectedMonth,
      selectedDay,
      selectedHour,
      selectedMinute
    );

    setFormData((prev) => ({
      ...prev,
      [field]: aestDateUTC.toISOString(),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverlapError(null);

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      if (editingPromo) {
        const updateData: UpdateScheduledPromoPayload = {
          type: formData.type,
          multiplier: formData.multiplier,
          startDate: formData.startDate,
          endDate: formData.endDate,
          name: formData.name || undefined,
          description: formData.description || undefined,
        };
        await updateMutation.mutateAsync({ id: editingPromo.id, data: updateData });
      } else {
        const createData: CreateScheduledPromoPayload = {
          type: formData.type,
          multiplier: formData.multiplier,
          startDate: formData.startDate,
          endDate: formData.endDate,
          name: formData.name || undefined,
          description: formData.description || undefined,
        };
        try {
          await createMutation.mutateAsync(createData);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.toLowerCase().includes("overlap")) {
            setOverlapError(
              "A scheduled promo for this package type already exists in this date range. Please choose a different range or edit the existing phase."
            );
            setIsSubmitting(false);
            return;
          }
          throw err;
        }
      }

      await refetchPromos();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to save scheduled promo:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader
        title={editingPromo ? "Edit Scheduled Promo" : "Schedule Promo"}
        onClose={onClose}
        showLogo={false}
      />

      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {overlapError && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-800">{overlapError}</p>
              </div>
            </div>
          )}

          <FormSection title="Package Type">
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  type: e.target.value as ScheduledPromoType,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              disabled={isSubmitting || !!editingPromo}
            >
              <option value="membership-packages">Membership Packages</option>
              <option value="one-time-packages">One-Time Packages</option>
              <option value="mini-packages">Mini Draw Packages</option>
            </select>
          </FormSection>

          <FormSection title="Multiplier">
            <select
              value={formData.multiplier}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  multiplier: parseInt(e.target.value, 10) as ScheduledPromoMultiplier,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              disabled={isSubmitting}
            >
              {MULTIPLIER_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}x entries
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-500">
              Entry multiplier applied when the current time falls within this phase.
            </p>
          </FormSection>

          <FormSection title="Promo Period">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date & Time</label>
                <DateTimePicker
                  id="startDate"
                  name="startDate"
                  value={formData.startDate}
                  onChange={(e) => handleDateChange("startDate", e)}
                  error={errors.startDate}
                  disabled={isSubmitting}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Time is interpreted as AEST/AEDT, regardless of your location.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date & Time</label>
                <DateTimePicker
                  id="endDate"
                  name="endDate"
                  value={formData.endDate}
                  onChange={(e) => handleDateChange("endDate", e)}
                  error={errors.endDate}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Name (Optional)">
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Phase 1: Launch"
              maxLength={200}
              disabled={isSubmitting}
            />
          </FormSection>

          <FormSection title="Description (Optional)">
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Admin notes for this phase"
              rows={3}
              maxLength={500}
              disabled={isSubmitting}
            />
          </FormSection>

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
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {editingPromo ? "Updating..." : "Creating..."}
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4 mr-2" />
                  {editingPromo ? "Update Phase" : "Create Phase"}
                </>
              )}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
};

export default AdminScheduledPromoModal;
