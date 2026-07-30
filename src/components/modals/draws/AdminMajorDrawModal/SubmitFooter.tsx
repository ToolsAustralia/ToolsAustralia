"use client";

import React from "react";

interface SubmitFooterProps {
  submitError?: string;
}

/**
 * Submit-failure banner for the create-major-draw form.
 *
 * The Cancel / Create buttons that used to live here moved into
 * `DrawModalShell`'s footer, so every draws modal has its actions in the same
 * place with the same pending treatment. What remains is the request-level
 * error — field-level errors render inline against their own inputs.
 */
const SubmitFooter: React.FC<SubmitFooterProps> = ({ submitError }) => {
  if (!submitError) return null;

  return (
    <div
      role="alert"
      className="rounded-[9px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-[12px] py-[10px]"
    >
      <p className="text-[12px] leading-[1.5] text-[var(--danger)]">{submitError}</p>
    </div>
  );
};

export default SubmitFooter;
