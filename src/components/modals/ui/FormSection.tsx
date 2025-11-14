"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

interface FormSectionProps {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

const FormSection: React.FC<FormSectionProps> = ({ title, icon: Icon, children, className = "" }) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Section Header */}
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5" />}
        {title}
      </h3>

      {/* Section Content */}
      <div className="space-y-4">{children}</div>
    </div>
  );
};

export default FormSection;
