"use client";

import React from "react";
import { FormSection, Input } from "../../ui";

interface TermsSectionProps {
  terms: string[];
  onTermChange: (index: number, value: string) => void;
  onAddTerm: () => void;
  onRemoveTerm: (index: number) => void;
}

const TermsSection: React.FC<TermsSectionProps> = ({ terms, onTermChange, onAddTerm, onRemoveTerm }) => (
  <FormSection title="Terms & Conditions">
    <div className="space-y-3">
      {terms.map((term, index) => (
        <div key={index} className="flex space-x-2">
          <Input
            value={term}
            onChange={(e) => onTermChange(index, e.target.value)}
            placeholder={`Term ${index + 1}`}
            className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
          />
          {terms.length > 1 && (
            <button
              type="button"
              onClick={() => onRemoveTerm(index)}
              className="px-3 py-2 text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={onAddTerm} className="text-blue-600 hover:text-blue-800 text-sm">
        + Add Term
      </button>
    </div>
  </FormSection>
);

export default TermsSection;
