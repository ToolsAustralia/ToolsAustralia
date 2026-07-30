"use client";

import React from "react";
import { AlertTriangle, Calendar } from "lucide-react";
import { DateTimePicker, FormSection } from "../../ui";
import { cn } from "@/utils/cn";
import type { FieldChangeEvent, RestrictedMonth, ScheduledDraw } from "./types";

interface TimeWarning {
  message: string;
  isWarning: boolean;
  isError: boolean;
}

interface DateConfigSectionProps {
  drawDate: string;
  activationDate: string;
  freezeEntriesAt: string;
  errors: Record<string, string>;
  restrictedMonths: RestrictedMonth[];
  scheduledDraws: ScheduledDraw[];
  timeWarning: TimeWarning | null;
  onFieldChange: (e: FieldChangeEvent) => void;
}

const DateConfigSection: React.FC<DateConfigSectionProps> = ({
  drawDate,
  activationDate,
  freezeEntriesAt,
  errors,
  restrictedMonths,
  scheduledDraws,
  timeWarning,
  onFieldChange,
}) => (
  <FormSection title="Draw Date Configuration" icon={Calendar}>
    <div className="space-y-4">
      <DateTimePicker
        id="drawDate"
        name="drawDate"
        value={drawDate}
        onChange={onFieldChange}
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
            value={activationDate}
            onChange={onFieldChange}
            label="Activation Date"
            error={errors.activationDate}
          />

          <DateTimePicker
            id="freezeEntriesAt"
            name="freezeEntriesAt"
            value={freezeEntriesAt}
            onChange={onFieldChange}
            label="Freeze Entries At"
            error={errors.freezeEntriesAt}
          />
        </div>

        {timeWarning && (
          <div
            className={`mt-3 p-3 rounded-lg border ${
              timeWarning.isError ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"
            }`}
          >
            <div className="flex items-center space-x-2">
              <AlertTriangle className={cn("w-4 h-4", timeWarning.isError ? "text-red-600" : "text-yellow-600")} />
              <span
                className={cn("text-sm font-medium", timeWarning.isError ? "text-red-800" : "text-yellow-800")}
              >
                {timeWarning.isError ? "Time Gap Issue" : "Time Gap Warning"}
              </span>
            </div>
            <p className={cn("text-xs mt-1", timeWarning.isError ? "text-red-700" : "text-yellow-700")}>
              {timeWarning.message}
            </p>
          </div>
        )}
      </div>
    </div>
  </FormSection>
);

export default DateConfigSection;
