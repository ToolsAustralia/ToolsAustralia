"use client";

import React from "react";
import { AlertTriangle, Package } from "lucide-react";
import { FormSection, Input } from "../ui";
import RichTextEditor from "@/components/ui/RichTextEditor";
import type { FieldChangeEvent } from "./types";

interface BasicInfoSectionProps {
  name: string;
  description: string;
  errors: Record<string, string>;
  onFieldChange: (e: FieldChangeEvent) => void;
}

const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({ name, description, errors, onFieldChange }) => (
  <FormSection title="Basic Information" icon={Package}>
    <Input
      id="name"
      name="name"
      value={name}
      onChange={onFieldChange}
      label="Major Draw Name"
      placeholder="e.g., December 2024 Major Draw"
      required
      error={errors.name}
      className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
    />

    <div>
      <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">
        Description <span className="text-red-500">*</span>
      </label>
      {errors.description && (
        <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
          <AlertTriangle className="w-4 h-4" />
          {errors.description}
        </p>
      )}
      <RichTextEditor
        value={description}
        onChange={(html) => {
          const syntheticEvent = {
            target: { name: "description", value: html },
          } as React.ChangeEvent<HTMLInputElement>;
          onFieldChange(syntheticEvent);
        }}
        placeholder="Describe the major draw and what makes it special..."
        minHeight="150px"
      />
    </div>
  </FormSection>
);

export default BasicInfoSection;
