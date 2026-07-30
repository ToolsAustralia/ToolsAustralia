"use client";

import React, { useEffect, useMemo, useState } from "react";
import DrawModalShell from "../DrawModalShell";
import { calculateActivationDate, convertUTCToAEST, createAESTDateAsUTC } from "@/utils/common/timezone";
import BasicInfoSection from "./BasicInfoSection";
import PrizeDetailsSection from "./PrizeDetailsSection";
import PrizeImageUpload from "./PrizeImageUpload";
import DateConfigSection from "./DateConfigSection";
import TermsSection from "./TermsSection";
import SubmitFooter from "./SubmitFooter";
import type { FieldChangeEvent, MajorDrawFormData, RestrictedMonth, ScheduledDraw } from "./types";

interface AdminMajorDrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const INITIAL_FORM_DATA: MajorDrawFormData = {
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
};

const AdminMajorDrawModal: React.FC<AdminMajorDrawModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<MajorDrawFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [restrictedMonths, setRestrictedMonths] = useState<RestrictedMonth[]>([]);
  const [scheduledDraws, setScheduledDraws] = useState<ScheduledDraw[]>([]);

  /** Warning when freeze ↔ draw aren't exactly 30 minutes apart (AEST). */
  const timeWarning = useMemo(() => {
    if (!formData.drawDate || !formData.freezeEntriesAt) return null;

    const drawDateString = formData.drawDate.includes("Z") ? formData.drawDate : formData.drawDate + ":00.000Z";
    const drawDateUTC = new Date(drawDateString);
    const freezeDateUTC = new Date(formData.freezeEntriesAt);
    const drawDateAEST = convertUTCToAEST(drawDateUTC);
    const freezeDateAEST = convertUTCToAEST(freezeDateUTC);
    const timeDiffMinutes = Math.abs(drawDateAEST.getTime() - freezeDateAEST.getTime()) / (1000 * 60);

    if (Math.abs(timeDiffMinutes - 30) > 0.1) {
      const hours = Math.floor(timeDiffMinutes / 60);
      const minutes = Math.round(timeDiffMinutes % 60);
      const timeString = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      return {
        message: `Time difference is ${timeString} (should be 30 minutes)`,
        isWarning: timeDiffMinutes < 30,
        isError: timeDiffMinutes > 30,
      };
    }

    return null;
  }, [formData.drawDate, formData.freezeEntriesAt]);

  /** Fetch restricted months & set default draw date when modal opens. */
  useEffect(() => {
    if (!isOpen) return;

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

    /** Default draw date = 8:30 PM AEST today, or tomorrow if today's slot has passed. */
    const now = new Date();
    const nowAEST = convertUTCToAEST(now);
    let targetYear = nowAEST.getFullYear();
    let targetMonth = nowAEST.getMonth() + 1;
    let targetDay = nowAEST.getDate();
    const todayAt830PM = createAESTDateAsUTC(targetYear, targetMonth, targetDay, 20, 30);
    const todayAt830PM_AEST = convertUTCToAEST(todayAt830PM);

    if (todayAt830PM_AEST <= nowAEST) {
      const tomorrow = new Date(nowAEST);
      tomorrow.setDate(tomorrow.getDate() + 1);
      targetYear = tomorrow.getFullYear();
      targetMonth = tomorrow.getMonth() + 1;
      targetDay = tomorrow.getDate();
    }

    const utcDrawDate = createAESTDateAsUTC(targetYear, targetMonth, targetDay, 20, 30);
    setFormData((prev) => ({ ...prev, drawDate: utcDrawDate.toISOString() }));
  }, [isOpen]);

  /** Auto-calculate activation + freeze when draw date changes. */
  useEffect(() => {
    if (!formData.drawDate) return;
    const drawDate = new Date(formData.drawDate);
    if (isNaN(drawDate.getTime())) return;

    const previousDraws = scheduledDraws
      .filter((draw) => new Date(draw.drawDate) < drawDate)
      .sort((a, b) => new Date(b.drawDate).getTime() - new Date(a.drawDate).getTime());

    const activationDate =
      previousDraws.length > 0
        ? calculateActivationDate(new Date(previousDraws[0].drawDate))
        : calculateActivationDate(drawDate);

    const drawDateAEST = convertUTCToAEST(drawDate);
    const freezeDate = createAESTDateAsUTC(
      drawDateAEST.getFullYear(),
      drawDateAEST.getMonth() + 1,
      drawDateAEST.getDate(),
      20,
      0
    );

    setFormData((prev) => {
      const newActivationDate = activationDate.toISOString();
      const newFreezeDate = freezeDate.toISOString();
      if (prev.activationDate === newActivationDate && prev.freezeEntriesAt === newFreezeDate) {
        return prev;
      }
      return { ...prev, activationDate: newActivationDate, freezeEntriesAt: newFreezeDate };
    });
  }, [formData.drawDate, scheduledDraws]);

  const handleInputChange = (e: FieldChangeEvent) => {
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

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleTermsChange = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      prize: { ...prev.prize, terms: prev.prize.terms.map((term, i) => (i === index ? value : term)) },
    }));
  };

  const addTerm = () => {
    setFormData((prev) => ({ ...prev, prize: { ...prev.prize, terms: [...prev.prize.terms, ""] } }));
  };

  const removeTerm = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      prize: { ...prev.prize, terms: prev.prize.terms.filter((_, i) => i !== index) },
    }));
  };

  const handleImagesChange = (images: (string | File)[]) => {
    setFormData((prev) => ({ ...prev, prize: { ...prev.prize, images } }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.description.trim()) newErrors.description = "Description is required";
    if (!formData.drawDate) newErrors.drawDate = "Draw date is required";
    if (!formData.prize.name.trim()) newErrors["prize.name"] = "Prize name is required";
    if (!formData.prize.description.trim()) newErrors["prize.description"] = "Prize description is required";
    if (formData.prize.value <= 0) newErrors["prize.value"] = "Prize value must be greater than 0";
    if (formData.prize.images.length === 0) newErrors["prize.images"] = "At least one prize image is required";

    if (formData.activationDate && formData.drawDate) {
      const drawDateString = formData.drawDate.includes("Z") ? formData.drawDate : formData.drawDate + ":00.000Z";
      const activationDateAEST = convertUTCToAEST(new Date(formData.activationDate));
      const drawDateAEST = convertUTCToAEST(new Date(drawDateString));
      if (activationDateAEST >= drawDateAEST) {
        newErrors.activationDate = "Activation date must be before draw date";
      }
    }
    if (formData.freezeEntriesAt && formData.drawDate) {
      const drawDateString = formData.drawDate.includes("Z") ? formData.drawDate : formData.drawDate + ":00.000Z";
      const freezeDateAEST = convertUTCToAEST(new Date(formData.freezeEntriesAt));
      const drawDateAEST = convertUTCToAEST(new Date(drawDateString));
      if (freezeDateAEST >= drawDateAEST) {
        newErrors.freezeEntriesAt = "Freeze entries date must be before draw date";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Invoked by DrawModalShell's primary, which sits outside the <form>.
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const submitData: MajorDrawFormData = {
        ...formData,
        prize: {
          ...formData.prize,
          images: [...formData.prize.images],
          terms: [...formData.prize.terms],
          specifications: { ...formData.prize.specifications },
        },
      };

      const formatDateToISO = (dateString: string): string => {
        if (!dateString) return dateString;
        if (dateString.includes("Z") || dateString.includes("+") || dateString.includes("-")) return dateString;
        if (dateString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) return dateString + ":00.000Z";
        if (dateString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) return dateString + ".000Z";
        return dateString;
      };

      submitData.drawDate = formatDateToISO(submitData.drawDate);
      submitData.activationDate = formatDateToISO(submitData.activationDate);
      submitData.freezeEntriesAt = formatDateToISO(submitData.freezeEntriesAt);

      if (submitData.prize.images && submitData.prize.images.length > 0) {
        const uploadedImages: string[] = [];
        for (const image of submitData.prize.images) {
          if (typeof image === "string") {
            if (image) uploadedImages.push(image);
            continue;
          }

          if (image && typeof image === "object" && "size" in image && "type" in image) {
            try {
              const uploadFormData = new FormData();
              uploadFormData.append("file", image);
              uploadFormData.append("folder", "major-draws");
              const response = await fetch("/api/upload/cloudinary", { method: "POST", body: uploadFormData });

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

      const trimmedBrand = submitData.prize.brand?.trim?.() ?? "";
      if (trimmedBrand) {
        submitData.prize.brand = trimmedBrand;
      } else {
        delete (submitData.prize as { brand?: string }).brand;
      }

      const response = await fetch("/api/admin/major-draw/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      });

      const result = await response.json();

      if (result.success) {
        onSuccess?.();
        handleClose();
      } else {
        if (result.error === "A major draw already exists for this month") {
          setErrors({ drawDate: result.details || "A major draw already exists for this month" });
        } else if (result.details && Array.isArray(result.details)) {
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

  const handleClose = () => {
    setFormData(INITIAL_FORM_DATA);
    setErrors({});
    onClose();
  };

  return (
    <DrawModalShell
      isOpen={isOpen}
      onClose={handleClose}
      size="4xl"
      eyebrow="Major draw · new"
      title="Create major draw"
      primaryLabel="Create draw"
      onPrimary={() => void handleSubmit()}
      isSubmitting={isSubmitting}
      submittingLabel="Creating…"
      // Field errors only — `submit` is a request failure shown as a banner.
      errorCount={Object.keys(errors).filter((k) => k !== "submit").length}
    >
        <div className="space-y-3 sm:space-y-6">
          <BasicInfoSection
            name={formData.name}
            description={formData.description}
            errors={errors}
            onFieldChange={handleInputChange}
          />

          <PrizeDetailsSection
            prizeName={formData.prize.name}
            prizeValue={formData.prize.value}
            prizeDescription={formData.prize.description}
            brand={formData.prize.brand}
            errors={errors}
            onFieldChange={handleInputChange}
          />

          <PrizeImageUpload
            images={formData.prize.images}
            onImagesChange={handleImagesChange}
            error={errors["prize.images"]}
          />

          <DateConfigSection
            drawDate={formData.drawDate}
            activationDate={formData.activationDate}
            freezeEntriesAt={formData.freezeEntriesAt}
            errors={errors}
            restrictedMonths={restrictedMonths}
            scheduledDraws={scheduledDraws}
            timeWarning={timeWarning}
            onFieldChange={handleInputChange}
          />

          <TermsSection
            terms={formData.prize.terms}
            onTermChange={handleTermsChange}
            onAddTerm={addTerm}
            onRemoveTerm={removeTerm}
          />

          {/* Cancel/Create moved into the shell footer; this now only surfaces
              a failed submit. */}
          <SubmitFooter submitError={errors.submit} />
        </div>
    </DrawModalShell>
  );
};

export default AdminMajorDrawModal;
