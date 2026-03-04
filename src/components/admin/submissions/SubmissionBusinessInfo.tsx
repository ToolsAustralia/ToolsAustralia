"use client";

import React from "react";
import { Building, Hash } from "lucide-react";

interface SubmissionBusinessInfoProps {
  businessName: string;
  abn?: string;
  acn?: string;
  goals?: string;
}

export default function SubmissionBusinessInfo({
  businessName,
  abn,
  acn,
  goals,
}: SubmissionBusinessInfoProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
        Business Details
      </h4>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Building className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="font-medium text-gray-900">{businessName}</span>
        </div>
        {abn && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span>ABN: {abn}</span>
          </div>
        )}
        {acn && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span>ACN: {acn}</span>
          </div>
        )}
        {goals && (
          <div className="mt-2">
            <p className="text-xs font-medium text-gray-500 mb-1">
              Partnership Goals
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
              {goals}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
