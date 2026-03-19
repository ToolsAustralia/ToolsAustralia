"use client";

import React from "react";
import { Mail, Phone, Calendar } from "lucide-react";
import { formatDateInLocal } from "@/utils/common/timezone";
import { formatDisplayName } from "@/utils/display-name";

interface SubmissionContactInfoProps {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  submittedAt: string;
}

export default function SubmissionContactInfo({
  firstName,
  lastName,
  email,
  phone,
  submittedAt,
}: SubmissionContactInfoProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
        Contact Information
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-900">
            {formatDisplayName(firstName, lastName)}
          </span>
        </div>
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-red-600 transition-colors"
        >
          <Mail className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{email}</span>
        </a>
        <a
          href={`tel:${phone}`}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-red-600 transition-colors"
        >
          <Phone className="w-4 h-4 flex-shrink-0" />
          <span>{phone}</span>
        </a>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          <span>
            {formatDateInLocal(
              new Date(submittedAt),
              "dd MMM yyyy, hh:mm a"
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
