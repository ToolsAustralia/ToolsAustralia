"use client";

import React, { useState, useEffect } from "react";
import { useCreatePromo } from "@/hooks/queries/usePromoQueries";
import { ModalContainer, ModalHeader, ModalContent, Select, Button, Checkbox, DateTimePicker, Input } from "./ui";
import { X, AlertTriangle, Clock, Zap } from "lucide-react";

interface AdminPromoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ConflictModalProps {
  isOpen: boolean;
  existingPromo: {
    id: string;
    type: string;
    multiplier: string;
    endDate: string;
  };
  newPromoData: {
    type: string;
    multiplier: string;
    duration: number;
  };
  onConfirm: () => void;
  onCancel: () => void;
}

const ConflictModal: React.FC<ConflictModalProps> = ({ isOpen, existingPromo, newPromoData, onConfirm, onCancel }) => {
  if (!isOpen || !existingPromo || !newPromoData) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onCancel} size="sm" className="z-[10000]">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Active Promo Conflict</h2>
              <p className="text-xs sm:text-sm text-gray-600">An active promo is already running</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
          <h4 className="font-semibold text-gray-900 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base">
            <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
            Current Active Promo
          </h4>
          <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Type:</span>
              <span className="font-medium capitalize">{existingPromo.type.replace("-", " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Multiplier:</span>
              <span className="font-medium bg-red-100 text-red-800 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full text-xs">
                {existingPromo.multiplier}x
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Ends:</span>
              <span className="font-medium text-xs">{new Date(existingPromo.endDate).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
          <h4 className="font-semibold text-gray-900 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base">
            <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
            New Promo
          </h4>
          <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Type:</span>
              <span className="font-medium capitalize">{newPromoData.type.replace("-", " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Multiplier:</span>
              <span className="font-medium bg-green-100 text-green-800 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full text-xs">
                {newPromoData.multiplier}x
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Duration:</span>
              <span className="font-medium">{newPromoData.duration} hours</span>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg sm:rounded-xl p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-yellow-800">
            <strong>Note:</strong> Starting a new promo will immediately end the current active promo. This action
            cannot be undone.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 sm:p-6 border-t border-gray-200">
        <div className="flex gap-2 sm:gap-3">
          <Button onClick={onCancel} variant="outline" size="md" className="flex-1">
            Cancel
          </Button>
          <Button onClick={onConfirm} variant="danger" size="md" className="flex-1">
            End Current & Start New
          </Button>
        </div>
      </div>
    </ModalContainer>
  );
};

const AdminPromoModal: React.FC<AdminPromoModalProps> = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    type: "one-time-packages" as "one-time-packages" | "mini-packages",
    multiplier: 2 as 2 | 3 | 5 | 10,
    duration: 24,
    startDate: "",
    endDate: "",
    useCustomDates: false,
  });

  const [conflictData, setConflictData] = useState<{
    isOpen: boolean;
    existingPromo: {
      id: string;
      type: string;
      multiplier: string;
      endDate: string;
    } | null;
    newPromoData: {
      type: string;
      multiplier: string;
      duration: number;
    } | null;
  }>({
    isOpen: false,
    existingPromo: null,
    newPromoData: null,
  });

  const createPromoMutation = useCreatePromo();

  // Initialize start date when modal opens and reset form when modal closes
  useEffect(() => {
    if (isOpen) {
      if (!formData.startDate) {
        const now = new Date();
        // Set start date to 1 minute in the future to avoid immediate expiration
        now.setMinutes(now.getMinutes() + 1);
        setFormData((prev) => ({ ...prev, startDate: now.toISOString() }));
      }
    } else {
      // Reset form when modal closes
      setFormData({
        type: "one-time-packages" as "one-time-packages" | "mini-packages",
        multiplier: 2 as 2 | 3 | 5 | 10,
        duration: 24,
        startDate: "",
        endDate: "",
        useCustomDates: false,
      });
    }
  }, [isOpen, formData.startDate]);

  // Calculate end date when duration changes
  useEffect(() => {
    if (!formData.useCustomDates && formData.startDate) {
      const start = new Date(formData.startDate);
      const end = new Date(start.getTime() + formData.duration * 60 * 60 * 1000);
      setFormData((prev) => ({ ...prev, endDate: end.toISOString() }));
    }
  }, [formData.duration, formData.startDate, formData.useCustomDates]);

  const handleSubmit = async (forceCreate = false) => {
    try {
      const submitData = {
        type: formData.type,
        multiplier: formData.multiplier.toString(), // Convert number to string for API
        startDate: formData.startDate,
        endDate: formData.endDate,
        duration: formData.duration,
        forceCreate,
      };

      const result = await createPromoMutation.mutateAsync(submitData);

      if (result.conflict && !forceCreate) {
        // Show conflict modal
        setConflictData({
          isOpen: true,
          existingPromo: {
            ...result.conflict.existingPromo,
            multiplier: result.conflict.existingPromo.multiplier.toString(), // Convert number to string
          },
          newPromoData: {
            type: submitData.type,
            multiplier: submitData.multiplier, // Keep as string for conflict modal
            duration: submitData.duration,
          },
        });
        return;
      }

      // Success - close modal (form will be reset by useEffect)
      onClose();
    } catch (error) {
      console.error("Error creating promo:", error);
    }
  };

  const handleConflictConfirm = () => {
    setConflictData({ isOpen: false, existingPromo: null, newPromoData: null });
    handleSubmit(true);
  };

  const handleConflictCancel = () => {
    setConflictData({ isOpen: false, existingPromo: null, newPromoData: null });
  };

  return (
    <>
      <ModalContainer isOpen={isOpen} onClose={onClose} size="2xl" height="auto">
        <ModalHeader
          title="Create New Promo"
          subtitle="Set up promotional campaigns with entry multipliers"
          onClose={onClose}
        />

        <ModalContent>
          {/* Promo Type and Multiplier Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
            {/* Promo Type */}
            <Select
              label="Promo Type"
              value={formData.type}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, type: e.target.value as "one-time-packages" | "mini-packages" }))
              }
              options={[
                { value: "one-time-packages", label: "One-Time Packages" },
                { value: "mini-packages", label: "Mini Packages" },
              ]}
              required
            />

            {/* Multiplier */}
            <Select
              label="Entry Multiplier"
              value={formData.multiplier.toString()}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, multiplier: parseInt(e.target.value) as 2 | 3 | 5 | 10 }))
              }
              options={[
                { value: "2", label: "2x Entries" },
                { value: "3", label: "3x Entries" },
                { value: "5", label: "5x Entries" },
                { value: "10", label: "10x Entries" },
              ]}
              required
            />
          </div>

          {/* Duration Options */}
          <div>
            w<label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">Duration</label>
            <div className="space-y-3 sm:space-y-4">
              {/* Quick Select */}
              <div>
                <div className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Quick Select:</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                  {[
                    { label: "1 Day", hours: 24 },
                    { label: "2 Days", hours: 48 },
                    { label: "3 Days", hours: 72 },
                    { label: "1 Week", hours: 168 },
                  ].map((option) => (
                    <Button
                      key={option.hours}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          duration: option.hours,
                          useCustomDates: false,
                        }))
                      }
                      variant={formData.duration === option.hours && !formData.useCustomDates ? "primary" : "outline"}
                      size="sm"
                      className="text-xs sm:text-sm"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Custom Duration */}
              <div>
                <div className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Custom Duration:</div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <Input
                    type="number"
                    min={1}
                    value={formData.duration}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        duration: parseInt(e.target.value) || 1,
                        useCustomDates: false,
                      }))
                    }
                    placeholder="Enter hours"
                    className="flex-1"
                  />
                  <span className="text-xs sm:text-sm text-gray-600 font-medium">hours</span>
                </div>
              </div>

              {/* Custom Dates Toggle */}
              <Checkbox
                id="useCustomDates"
                checked={formData.useCustomDates}
                onChange={(e) => setFormData((prev) => ({ ...prev, useCustomDates: e.target.checked }))}
                label="Use custom start/end dates"
                description="Override duration with specific start and end times"
              />
            </div>
          </div>

          {/* Date Pickers */}
          {formData.useCustomDates && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">
                  Start Date & Time
                </label>
                <DateTimePicker
                  value={formData.startDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                  placeholder="Select start date and time"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">
                  End Date & Time
                </label>
                <DateTimePicker
                  value={formData.endDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                  placeholder="Select end date and time"
                />
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 sm:p-6 border border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
              <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
              Promo Preview
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Type:</span>
                  <span className="font-medium capitalize">{formData.type.replace("-", " ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Multiplier:</span>
                  <span className="font-medium bg-red-100 text-red-800 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full text-xs">
                    {formData.multiplier}x
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Duration:</span>
                  <span className="font-medium">{formData.duration} hours</span>
                </div>
              </div>
              <div className="space-y-2 sm:space-y-3">
                {formData.startDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Start:</span>
                    <span className="font-medium text-xs">{new Date(formData.startDate).toLocaleString()}</span>
                  </div>
                )}
                {formData.endDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">End:</span>
                    <span className="font-medium text-xs">{new Date(formData.endDate).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ModalContent>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-200">
          <div className="flex gap-2 sm:gap-3">
            <Button onClick={onClose} variant="outline" size="md" className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={() => handleSubmit()}
              disabled={
                createPromoMutation.isPending || !formData.startDate || !formData.endDate || formData.duration < 1
              }
              loading={createPromoMutation.isPending}
              variant="primary"
              size="md"
              className="flex-1"
            >
              {createPromoMutation.isPending ? "Creating..." : "Create Promo"}
            </Button>
          </div>
        </div>
      </ModalContainer>

      {/* Conflict Modal */}
      {conflictData.existingPromo && conflictData.newPromoData && (
        <ConflictModal
          isOpen={conflictData.isOpen}
          existingPromo={conflictData.existingPromo}
          newPromoData={conflictData.newPromoData}
          onConfirm={handleConflictConfirm}
          onCancel={handleConflictCancel}
        />
      )}
    </>
  );
};

export default AdminPromoModal;
