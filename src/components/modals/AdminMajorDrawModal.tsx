"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Package, Trophy, AlertTriangle, Sparkles, Plus, Trash2, X } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  IconPickerModal,
} from "./ui";
import { convertUTCToAEST, createAESTDateAsUTC } from "@/utils/common/timezone";
import { fromZonedTime } from "date-fns-tz";

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
    components: Array<{
      title: string;
      description: string;
      icon?: string;
    }>;
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
      components: [
        {
          title: "",
          description: "",
          icon: "",
        },
      ],
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
  // Track which highlight card is editing its icon so we can reopen the picker with context.
  const [iconPickerState, setIconPickerState] = useState<{ open: boolean; componentIndex: number | null }>({
    open: false,
    componentIndex: null,
  });

  // Allow highlight cards to render an icon by name while gracefully falling back to Sparkles.
  const resolveIconComponent = (iconName?: string): LucideIcon => {
    const iconsMap = LucideIcons as unknown as Record<string, LucideIcon>;
    if (!iconName) {
      return iconsMap.Sparkles ?? Sparkles;
    }
    const formatIconKey = (value: string) =>
      value
        .split(/[\s-_]+/)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join("");

    const candidates = [iconName, iconName.charAt(0).toUpperCase() + iconName.slice(1), formatIconKey(iconName)];
    for (const key of candidates) {
      if (iconsMap[key]) {
        return iconsMap[key];
      }
    }
    return iconsMap.Sparkles ?? Sparkles;
  };

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

        // Create 8:30 PM AEST for today
        const todayAEST = new Date(nowAEST);
        todayAEST.setHours(20, 30, 0, 0); // 8:30 PM AEST

        // If 8:30 PM AEST today has passed, set it for tomorrow
        if (todayAEST <= nowAEST) {
          todayAEST.setDate(todayAEST.getDate() + 1);
        }

        // Convert AEST date to UTC for storage
        // Create the date string in AEST timezone format
        const year = todayAEST.getFullYear();
        const month = todayAEST.getMonth() + 1; // getMonth() returns 0-11, but we need 1-12
        const day = todayAEST.getDate();
        const hour = 20; // 8 PM
        const minute = 30; // 30 minutes

        // Create date string in AEST timezone
        const dateString = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(
          hour
        ).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;

        // Convert from AEST to UTC using the timezone utility
        const utcDrawDate = fromZonedTime(dateString, "Australia/Sydney");

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

        // Convert to AEST, add 1 day, set to midnight AEST, then convert back to UTC
        const previousDrawAEST = convertUTCToAEST(mostRecentPreviousDraw);
        const nextDayAEST = new Date(previousDrawAEST);
        nextDayAEST.setDate(nextDayAEST.getDate() + 1); // Day after previous draw
        nextDayAEST.setHours(0, 0, 0, 0); // 12:00 AM (midnight) AEST
        activationDate = fromZonedTime(nextDayAEST, "Australia/Sydney");
      } else {
        // No previous draws, set activation date to the day after draw date
        const drawDateAEST = convertUTCToAEST(drawDate);
        const nextDayAEST = new Date(drawDateAEST);
        nextDayAEST.setDate(nextDayAEST.getDate() + 1); // Next day
        nextDayAEST.setHours(0, 0, 0, 0); // 12:00 AM (midnight) AEST
        activationDate = fromZonedTime(nextDayAEST, "Australia/Sydney");
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

  const handleComponentChange = (index: number, field: "title" | "description" | "icon", value: string) => {
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize,
        components: prev.prize.components.map((component, i) =>
          i === index ? { ...component, [field]: value } : component
        ),
      },
    }));

    if (errors["prize.components"]) {
      setErrors((prev) => ({ ...prev, "prize.components": "" }));
    }
  };

  const addComponent = () => {
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize,
        components: [
          ...prev.prize.components,
          {
            title: "",
            description: "",
            icon: "",
          },
        ],
      },
    }));

    if (errors["prize.components"]) {
      setErrors((prev) => ({ ...prev, "prize.components": "" }));
    }
  };

  const removeComponent = (index: number) => {
    setFormData((prev) => {
      const nextComponents = prev.prize.components.filter((_, i) => i !== index);
      return {
        ...prev,
        prize: {
          ...prev.prize,
          components:
            nextComponents.length > 0
              ? nextComponents
              : [
                  {
                    title: "",
                    description: "",
                    icon: "",
                  },
                ],
        },
      };
    });

    if (errors["prize.components"]) {
      setErrors((prev) => ({ ...prev, "prize.components": "" }));
    }
  };

  const openIconPicker = (index: number) => {
    setIconPickerState({ open: true, componentIndex: index });
  };

  const handleIconSelect = (iconName: string) => {
    // If we lost the index somehow, close the modal and do nothing.
    if (iconPickerState.componentIndex === null) {
      setIconPickerState({ open: false, componentIndex: null });
      return;
    }

    // Update the specific highlight entry with the selected icon.
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize,
        components: prev.prize.components.map((component, i) =>
          i === iconPickerState.componentIndex ? { ...component, icon: iconName } : component
        ),
      },
    }));
    if (errors["prize.components"]) {
      setErrors((prev) => ({ ...prev, "prize.components": "" }));
    }
    setIconPickerState({ open: false, componentIndex: null });
  };

  const clearIcon = (index: number) => {
    // Reset the icon to an empty string so the highlight falls back to the default sparkle.
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize,
        components: prev.prize.components.map((component, i) => (i === index ? { ...component, icon: "" } : component)),
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
    const validComponents = formData.prize.components.filter(
      (component) => component.title.trim() && component.description.trim()
    );
    if (validComponents.length === 0) {
      newErrors["prize.components"] = "Add at least one prize highlight";
    }

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
          components: formData.prize.components.map((component) => ({ ...component })),
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

      submitData.prize.components = submitData.prize.components
        .filter((component) => component.title.trim() && component.description.trim())
        .map((component) => ({
          title: component.title.trim(),
          description: component.description.trim(),
          ...(component.icon && component.icon.trim() ? { icon: component.icon.trim() } : {}),
        }));

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
        components: [
          {
            title: "",
            description: "",
            icon: "",
          },
        ],
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

          <FormSection title="Prize Highlights" icon={Sparkles}>
            <div className="space-y-3">
              {formData.prize.components.map((component, index) => (
                <div key={index} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                  <div className="flex items-start gap-3">
                    <Input
                      value={component.title}
                      onChange={(e) => handleComponentChange(index, "title", e.target.value)}
                      label="Highlight Title"
                      placeholder="e.g., 13 Milwaukee Power Tools"
                      className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3 flex-1"
                    />
                    {formData.prize.components.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeComponent(index)}
                        className="text-red-600 hover:text-red-800 text-xs font-semibold mt-6 flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    )}
                  </div>

                  <Textarea
                    value={component.description}
                    onChange={(e) => handleComponentChange(index, "description", e.target.value)}
                    label="Highlight Description"
                    placeholder="Briefly describe this part of the prize..."
                    rows={2}
                    className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
                  />

                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide block">
                      Icon (optional)
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <Button type="button" variant="outline" onClick={() => openIconPicker(index)} className="text-xs">
                        Choose Icon
                      </Button>
                      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                        <span className="flex items-center justify-center w-7 h-7 rounded-md bg-gray-100">
                          {(() => {
                            const PreviewIcon = resolveIconComponent(component.icon);
                            return <PreviewIcon className="w-4 h-4 text-red-600" />;
                          })()}
                        </span>
                        <span>{component.icon || "None selected"}</span>
                      </div>
                      {component.icon && (
                        <button
                          type="button"
                          onClick={() => clearIcon(index)}
                          className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                        >
                          <X className="w-3 h-3" />
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addComponent}
                className="text-blue-600 hover:text-blue-800 text-sm font-semibold flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Highlight
              </button>

              {errors["prize.components"] && <p className="text-red-600 text-sm">{errors["prize.components"]}</p>}
            </div>
          </FormSection>

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

      <IconPickerModal
        isOpen={iconPickerState.open}
        onClose={() => setIconPickerState({ open: false, componentIndex: null })}
        onSelect={handleIconSelect}
        title="Select Highlight Icon"
      />
    </ModalContainer>
  );
};

export default AdminMajorDrawModal;
