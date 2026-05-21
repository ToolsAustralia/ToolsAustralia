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
      <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
        Business Details
      </h4>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Building className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-neutral-500" />
          <span className="font-medium text-gray-900 dark:text-neutral-100">{businessName}</span>
        </div>
        {abn && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-400">
            <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span>ABN: {abn}</span>
          </div>
        )}
        {acn && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-400">
            <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span>ACN: {acn}</span>
          </div>
        )}
        {goals && (
          <div className="mt-2">
            <p className="mb-1 text-xs font-medium text-gray-500 dark:text-neutral-400">
              Partnership Goals
            </p>
            <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-800 dark:bg-neutral-800 dark:text-neutral-200">
              {goals}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
