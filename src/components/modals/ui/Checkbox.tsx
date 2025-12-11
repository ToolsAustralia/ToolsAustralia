"use client";

import React from "react";
import { Check } from "lucide-react";

interface CheckboxProps {
  id?: string;
  name?: string;
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

const Checkbox: React.FC<CheckboxProps> = ({
  id,
  name,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = "",
}) => {
  // Ensure checked is always a boolean to prevent controlled/uncontrolled switching
  const isChecked = Boolean(checked);
  return (
    <div className={`flex items-start gap-2.5 sm:gap-3 ${className}`}>
      {/* Custom Checkbox */}
      <div className="relative flex items-center">
        <input
          type="checkbox"
          id={id}
          name={name}
          checked={isChecked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only"
        />
        <div
          className={`w-4 h-4 sm:w-4 sm:h-4 lg:w-5 lg:h-5 border-2 rounded transition-all duration-200 flex items-center justify-center cursor-pointer focus-within:ring-2 focus-within:ring-red-500/20 ${
            isChecked ? "bg-red-600 border-red-600" : "border-gray-300 hover:border-red-400"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() =>
            !disabled &&
            onChange({ target: { name: name || "", checked: !isChecked } } as React.ChangeEvent<HTMLInputElement>)
          }
        >
          {isChecked && <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />}
        </div>
      </div>

      {/* Label and Description */}
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <label
              htmlFor={id}
              className={`font-medium text-gray-700 cursor-pointer ${className ? "" : "text-xs sm:text-sm"} ${
                disabled ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {label}
            </label>
          )}
          {description && <p className="text-xs text-gray-500 mt-0.5 sm:mt-1">{description}</p>}
        </div>
      )}
    </div>
  );
};

export default Checkbox;
