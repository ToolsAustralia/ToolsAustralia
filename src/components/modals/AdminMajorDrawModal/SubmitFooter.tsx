"use client";

import React from "react";
import { Button } from "../ui";

interface SubmitFooterProps {
  isSubmitting: boolean;
  submitError?: string;
  onCancel: () => void;
}

const SubmitFooter: React.FC<SubmitFooterProps> = ({ isSubmitting, submitError, onCancel }) => (
  <>
    {submitError && (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
        <p className="text-red-600 text-sm">{submitError}</p>
      </div>
    )}

    <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
      <Button type="button" onClick={onCancel} variant="secondary" fullWidth>
        Cancel
      </Button>
      <Button type="submit" variant="primary" fullWidth disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create Major Draw"}
      </Button>
    </div>
  </>
);

export default SubmitFooter;
