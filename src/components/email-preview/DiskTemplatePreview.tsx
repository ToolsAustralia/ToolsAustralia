"use client";

import React from "react";
import { DESIGN_SAMPLES } from "./designSamples.generated";

/**
 * Renders a Klaviyo paste-ready email template's design (sample data filled in) in an iframe.
 * The source of truth is email-templates/klaviyo/*.html (Klaviyo merge vars); this preview
 * shows the rendered look with realistic sample values.
 */
const DiskTemplatePreview: React.FC<{ templateKey: string; title: string; badge?: string }> = ({
  templateKey,
  title,
  badge,
}) => {
  const html = DESIGN_SAMPLES[templateKey] ?? "<p style='padding:24px;font-family:sans-serif'>Preview unavailable.</p>";
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">{title}</h3>
        {badge ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">{badge}</span>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        <iframe
          title={title}
          srcDoc={html}
          className="h-[1000px] w-full border-0"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
};

export default DiskTemplatePreview;
