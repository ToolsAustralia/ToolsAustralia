"use client";

import React from "react";
import { AlertTriangle, Trophy } from "lucide-react";
import { FormSection, Input } from "../../ui";
import RichTextEditor from "@/components/ui/RichTextEditor";
import type { FieldChangeEvent } from "./types";

interface PrizeDetailsSectionProps {
  prizeName: string;
  prizeValue: number;
  prizeDescription: string;
  brand: string;
  errors: Record<string, string>;
  onFieldChange: (e: FieldChangeEvent) => void;
}

const PrizeDetailsSection: React.FC<PrizeDetailsSectionProps> = ({
  prizeName,
  prizeValue,
  prizeDescription,
  brand,
  errors,
  onFieldChange,
}) => (
  <FormSection title="Prize Details" icon={Trophy}>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
      <Input
        id="prize.name"
        name="prize.name"
        value={prizeName}
        onChange={onFieldChange}
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
        value={prizeValue}
        onChange={onFieldChange}
        label="Prize Value"
        placeholder="e.g., 75,000.00"
        min={0}
        step={0.01}
        required
        error={errors["prize.value"]}
        className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
      />
    </div>

    <div>
      <label htmlFor="prize.description" className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">
        Prize Description <span className="text-red-500">*</span>
      </label>
      {errors["prize.description"] && (
        <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
          <AlertTriangle className="w-4 h-4" />
          {errors["prize.description"]}
        </p>
      )}
      <RichTextEditor
        value={prizeDescription}
        onChange={(html) => {
          const syntheticEvent = {
            target: { name: "prize.description", value: html },
          } as React.ChangeEvent<HTMLInputElement>;
          onFieldChange(syntheticEvent);
        }}
        placeholder="Describe the prize, its features, and what makes it special..."
        minHeight="150px"
      />
    </div>

    <Input
      id="prize.brand"
      name="prize.brand"
      value={brand}
      onChange={onFieldChange}
      label="Brand (optional)"
      placeholder="e.g., Milwaukee"
      className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
    />
  </FormSection>
);

export default PrizeDetailsSection;
