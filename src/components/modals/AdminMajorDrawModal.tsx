"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Package, Trophy, AlertTriangle } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  Input,
  Textarea,
  Button,
  DateTimePicker,
  FormSection,
  ImageUpload,
} from "./ui";
import { convertUTCToAEST, createAESTDateAsUTC, calculateActivationDate } from "@/utils/common/timezone";

interface AdminMajorDrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface MajorDrawFormData {
  name: string;
  description: string;
  drawDate: string;
  activationDate: string;
  freezeEntriesAt: string;
  prize: {
    name: string;
    description: string;
    value: number;
    images: (string | File)[];
    brand: string;
    terms: string[];
    specifications: Record<string, string | number | string[]>;
  };
}

const AdminMajorDrawModal: React.FC<AdminMajorDrawModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<MajorDrawFormData>({
    name: "",
    description: "",
    drawDate: "",
    activationDate: "",
    freezeEntriesAt: "",
    prize: {
      name: "",
      description: "",
      value: 0,
      images: [],
      brand: "",
      terms: [""],
      specifications: {},
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [restrictedMonths, setRestrictedMonths] = useState<Array<{ year: number; month: number; monthName: string }>>(
    []
  );
  const [scheduledDraws, setScheduledDraws] = useState<
    Array<{ id: string; name: string; drawDate: string; status: string }>
  >([]);

  // Check if freeze and draw times are exactly 30 minutes apart
  const getTimeDifferenceWarning = () => {
    if (!formData.drawDate || !formData.freezeEntriesAt) return null;

    // Ensure draw date is properly formatted as UTC
    const drawDateString = formData.drawDate.includes("Z") ? formData.drawDate : formData.drawDate + ":00.000Z";

    // Parse the ISO strings and convert to AEST for comparison
    const drawDateUTC = new Date(drawDateString);
    const freezeDateUTC = new Date(formData.freezeEntriesAt);

    // Convert to AEST for accurate time comparison
    const drawDateAEST = convertUTCToAEST(drawDateUTC);
    const freezeDateAEST = convertUTCToAEST(freezeDateUTC);

    // Calculate difference in minutes using AEST times
    const timeDiffMinutes = Math.abs(drawDateAEST.getTime() - freezeDateAEST.getTime()) / (1000 * 60);

    // Check if it's exactly 30 minutes
    if (Math.abs(timeDiffMinutes - 30) > 0.1) {
      // Allow small floating point differences
      const hours = Math.floor(timeDiffMinutes / 60);
      const minutes = Math.round(timeDiffMinutes % 60);

      let timeString = "";
      if (hours > 0) {
        timeString = `${hours}h ${minutes}m`;
      } else {
        timeString = `${minutes}m`;
      }

      return {
        message: `Time difference is ${timeString} (should be 30 minutes)`,
        isWarning: timeDiffMinutes < 30, // Warning if less than 30 minutes
        isError: timeDiffMinutes > 30, // Error if more than 30 minutes
      };
    }

    return null;
  };

  // Fetch restricted months and set default draw date when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchRestrictedMonths = async () => {
        try {
          const response = await fetch("/api/admin/major-draw/scheduled-months");
          if (response.ok) {
            const data = await response.json();
            setRestrictedMonths(data.data.restrictedMonths);
            setScheduledDraws(data.data.scheduledDraws);
          }
        } catch (error) {
          console.error("Failed to fetch restricted months:", error);
        }
      };
      fetchRestrictedMonths();

      // Set default draw date to 8:30 PM AEST today (or next available day)
      const setDefaultDrawDate = () => {
        const now = new Date();

        // Get current time in AEST
        const nowAEST = convertUTCToAEST(now);

        // Determine target date (today or tomorrow)
        let targetYear = nowAEST.getFullYear();
        let targetMonth = nowAEST.getMonth() + 1; // getMonth() returns 0-11, but we need 1-12
        let targetDay = nowAEST.getDate();

        // Create 8:30 PM AEST for today using createAESTDateAsUTC
        const todayAt830PM = createAESTDateAsUTC(targetYear, targetMonth, targetDay, 20, 30);
        const todayAt830PM_AEST = convertUTCToAEST(todayAt830PM);

        // If 8:30 PM AEST today has passed, set it for tomorrow
        if (todayAt830PM_AEST <= nowAEST) {
          // Add one day to the date
          const tomorrow = new Date(nowAEST);
          tomorrow.setDate(tomorrow.getDate() + 1);
          targetYear = tomorrow.getFullYear();
          targetMonth = tomorrow.getMonth() + 1;
          targetDay = tomorrow.getDate();
        }

        // Create the UTC date using createAESTDateAsUTC (handles DST automatically)
        const utcDrawDate = createAESTDateAsUTC(targetYear, targetMonth, targetDay, 20, 30);
        const isoString = utcDrawDate.toISOString();

        setFormData((prev) => ({
          ...prev,
          drawDate: isoString,
        }));
      };

      setDefaultDrawDate();
    }
  }, [isOpen]);

  // Auto-calculate dates when draw date changes
  useEffect(() => {
    if (formData.drawDate) {
      const drawDate = new Date(formData.drawDate);

      // Only auto-calculate if the draw date is valid
      if (isNaN(drawDate.getTime())) return;

      // Find the most recent scheduled draw before the selected draw date
      const previousDraws = scheduledDraws
        .filter((draw) => {
          const drawDateObj = new Date(draw.drawDate);
          const isBefore = drawDateObj < drawDate;

          return isBefore;
        })
        .sort((a, b) => new Date(b.drawDate).getTime() - new Date(a.drawDate).getTime());

      let activationDate: Date;

      if (previousDraws.length > 0) {
        // Set activation date to the day after the most recent previous draw
        const mostRecentPreviousDraw = new Date(previousDraws[0].drawDate);
        // Use calculateActivationDate to ensure it's always at midnight AEST
        activationDate = calculateActivationDate(mostRecentPreviousDraw);
      } else {
        // No previous draws, set activation date to the day after draw date
        // Use calculateActivationDate to ensure it's always at midnight AEST
        activationDate = calculateActivationDate(drawDate);
      }

      // Set freeze date to 8:00 PM AEST (fixed time, not calculated)
      // Get the draw date in AEST to use the same date
      const drawDateAEST = convertUTCToAEST(drawDate);
      const freezeDate = createAESTDateAsUTC(
        drawDateAEST.getFullYear(),
        drawDateAEST.getMonth() + 1, // getMonth() is 0-indexed
        drawDateAEST.getDate(),
        20, // 8 PM
        0 // 0 minutes
      );

      // Auto-populate the calculated dates
      setFormData((prev) => {
        const newActivationDate = activationDate.toISOString();
        const newFreezeDate = freezeDate.toISOString();

        // Only update if the values are actually different to prevent unnecessary re-renders
        if (prev.activationDate === newActivationDate && prev.freezeEntriesAt === newFreezeDate) {
          return prev;
        }

        const newFormData = {
          ...prev,
          activationDate: newActivationDate,
          freezeEntriesAt: newFreezeDate,
        };

        return newFormData;
      });
    }
  }, [formData.drawDate, scheduledDraws]);

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    if (name.startsWith("prize.")) {
      const prizeField = name.replace("prize.", "");
      setFormData((prev) => ({
        ...prev,
        prize: {
          ...prev.prize,
          [prizeField]: type === "number" ? parseFloat(value) || 0 : value,
        },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === "number" ? parseFloat(value) || 0 : value,
      }));
    }

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // Handle terms array changes
  const handleTermsChange = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize,
        terms: prev.prize.terms.map((term, i) => (i === index ? value : term)),
      },
    }));
  };

  const addTerm = () => {
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize,
        terms: [...prev.prize.terms, ""],
      },
    }));
  };

  const removeTerm = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize,
        terms: prev.prize.terms.filter((_, i) => i !== index),
      },
    }));
  };


  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.description.trim()) newErrors.description = "Description is required";
    if (!formData.drawDate) newErrors.drawDate = "Draw date is required";
    if (!formData.prize.name.trim()) newErrors["prize.name"] = "Prize name is required";
    if (!formData.prize.description.trim()) newErrors["prize.description"] = "Prize description is required";
    if (formData.prize.value <= 0) newErrors["prize.value"] = "Prize value must be greater than 0";
    if (formData.prize.images.length === 0) newErrors["prize.images"] = "At least one prize image is required";

    // Validate date relationships using AEST times
    if (formData.activationDate && formData.drawDate) {
      // Ensure draw date is properly formatted as UTC
      const drawDateString = formData.drawDate.includes("Z") ? formData.drawDate : formData.drawDate + ":00.000Z";

      const activationDateAEST = convertUTCToAEST(new Date(formData.activationDate));
      const drawDateAEST = convertUTCToAEST(new Date(drawDateString));

      if (activationDateAEST >= drawDateAEST) {
        newErrors.activationDate = "Activation date must be before draw date";
      }
    }
    if (formData.freezeEntriesAt && formData.drawDate) {
      // Ensure draw date is properly formatted as UTC
      const drawDateString = formData.drawDate.includes("Z") ? formData.drawDate : formData.drawDate + ":00.000Z";

      const freezeDateUTC = new Date(formData.freezeEntriesAt);
      const drawDateUTC = new Date(drawDateString);
      const freezeDateAEST = convertUTCToAEST(freezeDateUTC);
      const drawDateAEST = convertUTCToAEST(drawDateUTC);

      if (freezeDateAEST >= drawDateAEST) {
        newErrors.freezeEntriesAt = "Freeze entries date must be before draw date";
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

    try {
      // Prepare form data for submission
      const submitData: MajorDrawFormData = {
        ...formData,
        prize: {
          ...formData.prize,
          images: [...formData.prize.images],
          terms: [...formData.prize.terms],
          specifications: { ...formData.prize.specifications },
        },
      };

      // Fix all date formats to proper UTC ISO strings
      const formatDateToISO = (dateString: string): string => {
        if (!dateString) return dateString;

        // If already has timezone info, return as is
        if (dateString.includes("Z") || dateString.includes("+") || dateString.includes("-")) {
          return dateString;
        }

        // If missing seconds, add them
        if (dateString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
          return dateString + ":00.000Z";
        }

        // If missing milliseconds, add them
        if (dateString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) {
          return dateString + ".000Z";
        }

        return dateString;
      };

      submitData.drawDate = formatDateToISO(submitData.drawDate);
      submitData.activationDate = formatDateToISO(submitData.activationDate);
      submitData.freezeEntriesAt = formatDateToISO(submitData.freezeEntriesAt);

      // Handle image uploads (upload new files, retain existing URLs)
      if (submitData.prize.images && submitData.prize.images.length > 0) {
        const uploadedImages: string[] = [];
        for (const image of submitData.prize.images) {
          if (typeof image === "string") {
            if (image) {
              uploadedImages.push(image);
            }
            continue;
          }

          if (image && typeof image === "object" && "size" in image && "type" in image) {
            try {
              const uploadFormData = new FormData();
              uploadFormData.append("file", image);
              uploadFormData.append("folder", "major-draws");

              const response = await fetch("/api/upload/cloudinary", {
                method: "POST",
                body: uploadFormData,
              });

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to upload image");
              }

              const data = await response.json();
              uploadedImages.push(data.url);
            } catch (uploadError) {
              console.error("Failed to upload image:", uploadError);
              setErrors({ submit: "Failed to upload image. Please try again." });
              return;
            }
          }
        }

        submitData.prize.images = uploadedImages;
      }

      // Clean up the optional brand before sending it to the API.
      const trimmedBrand = submitData.prize.brand?.trim?.() ?? "";
      if (trimmedBrand) {
        submitData.prize.brand = trimmedBrand;
      } else {
        delete (submitData.prize as { brand?: string }).brand;
      }


      const response = await fetch("/api/admin/major-draw/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submitData),
      });

      const result = await response.json();

      if (result.success) {
        onSuccess?.();
        handleClose();
      } else {
        // Handle API errors
        if (result.error === "A major draw already exists for this month") {
          setErrors({
            drawDate: result.details || "A major draw already exists for this month",
          });
        } else if (result.details && Array.isArray(result.details)) {
          // Handle validation errors from API
          const apiErrors: Record<string, string> = {};
          result.details.forEach((detail: { field: string; message: string }) => {
            apiErrors[detail.field] = detail.message;
          });
          setErrors(apiErrors);
        } else {
          setErrors({ submit: result.error || "Failed to create major draw" });
        }
      }
    } catch (error) {
      console.error("Error creating major draw:", error);
      setErrors({ submit: "Network error. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle modal close
  const handleClose = () => {
    setFormData({
      name: "",
      description: "",
      drawDate: "",
      activationDate: "",
      freezeEntriesAt: "",
      prize: {
        name: "",
        description: "",
        value: 0,
        images: [],
        brand: "",
        terms: [""],
        specifications: {},
      },
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="4xl" height="fixed" closeOnBackdrop={false}>
      <ModalHeader
        title="Create New Major Draw"
        subtitle="Set up a new major draw with monthly restriction validation"
        onClose={handleClose}
        showLogo={false}
      />

      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-6">
          <FormSection title="Basic Information" icon={Package}>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              label="Major Draw Name"
              placeholder="e.g., December 2024 Major Draw"
              required
              error={errors.name}
              className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
            />

            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              label="Description"
              placeholder="Describe the major draw and what makes it special..."
              required
              error={errors.description}
              rows={4}
              className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
            />
          </FormSection>

          <FormSection title="Prize Details" icon={Trophy}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
              <Input
                id="prize.name"
                name="prize.name"
                value={formData.prize.name}
                onChange={handleInputChange}
                label="Prize Name"
                placeholder="e.g., DeWalt 20V Max Cordless Drill Kit"
                required
                error={errors["prize.name"]}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />

              <Input
                id="prize.value"
                name="prize.value"
                type="number"
                value={formData.prize.value}
                onChange={handleInputChange}
                label="Prize Value"
                placeholder="e.g., 75,000.00"
                min={0}
                step={0.01}
                required
                error={errors["prize.value"]}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />
            </div>

            <Textarea
              id="prize.description"
              name="prize.description"
              value={formData.prize.description}
              onChange={handleInputChange}
              label="Prize Description"
              placeholder="Describe the prize, its features, and what makes it special..."
              required
              error={errors["prize.description"]}
              rows={3}
              className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
            />

            <Input
              id="prize.brand"
              name="prize.brand"
              value={formData.prize.brand}
              onChange={handleInputChange}
              label="Brand (optional)"
              placeholder="e.g., Milwaukee"
              className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
            />
          </FormSection>

          <div className="space-y-2">
            <ImageUpload
              label="Prize Gallery"
              images={formData.prize.images}
              onImagesChange={(images) =>
                setFormData((prev) => ({
                  ...prev,
                  prize: {
                    ...prev.prize,
                    images,
                  },
                }))
              }
              maxImages={25}
              maxFileSize={10}
              required
              error={errors["prize.images"]}
              uploadToCloudinary={false}
              storeLocally={true}
            />
          </div>

          <FormSection title="Draw Date Configuration" icon={Calendar}>
            <div className="space-y-4">
              <DateTimePicker
                id="drawDate"
                name="drawDate"
                value={formData.drawDate}
                onChange={handleInputChange}
                label="Draw Date"
                required
                error={errors.drawDate}
                restrictedMonths={restrictedMonths}
                scheduledDraws={scheduledDraws}
              />

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <DateTimePicker
                    id="activationDate"
                    name="activationDate"
                    value={formData.activationDate}
                    onChange={handleInputChange}
                    label="Activation Date"
                    error={errors.activationDate}
                  />

                  <DateTimePicker
                    id="freezeEntriesAt"
                    name="freezeEntriesAt"
                    value={formData.freezeEntriesAt}
                    onChange={handleInputChange}
                    label="Freeze Entries At"
                    error={errors.freezeEntriesAt}
                  />
                </div>

                {/* Time Difference Warning */}
                {(() => {
                  const warning = getTimeDifferenceWarning();
                  if (!warning) return null;

                  return (
                    <div
                      className={`mt-3 p-3 rounded-lg border ${
                        warning.isError ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className={`w-4 h-4 ${warning.isError ? "text-red-600" : "text-yellow-600"}`} />
                        <span className={`text-sm font-medium ${warning.isError ? "text-red-800" : "text-yellow-800"}`}>
                          {warning.isError ? "Time Gap Issue" : "Time Gap Warning"}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 ${warning.isError ? "text-red-700" : "text-yellow-700"}`}>
                        {warning.message}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </FormSection>

          <FormSection title="Terms & Conditions">
            <div className="space-y-3">
              {formData.prize.terms.map((term, index) => (
                <div key={index} className="flex space-x-2">
                  <Input
                    value={term}
                    onChange={(e) => handleTermsChange(index, e.target.value)}
                    placeholder={`Term ${index + 1}`}
                    className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
                  />
                  {formData.prize.terms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTerm(index)}
                      className="px-3 py-2 text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addTerm} className="text-blue-600 hover:text-blue-800 text-sm">
                + Add Term
              </button>
            </div>
          </FormSection>

          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{errors.submit}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
            <Button type="button" onClick={handleClose} variant="secondary" fullWidth>
              Cancel
            </Button>
            <Button type="submit" variant="primary" fullWidth disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Major Draw"}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
};

export default AdminMajorDrawModal;
