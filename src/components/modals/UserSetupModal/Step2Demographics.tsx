"use client";

import React from "react";
import { Info, MapPin } from "lucide-react";
import { Select } from "../ui";
import Dropdown, { type DropdownOption } from "../ui/Dropdown";
import BirthdatePicker from "@/components/ui/BirthdatePicker";
import GiveawayEligibilityNotice from "@/components/ui/GiveawayEligibilityNotice";
import { isGiveawayIneligible, getGiveawayIneligibilityReasons } from "@/utils/giveaway-eligibility";

interface Step2DemographicsProps {
  selectedState: string;
  selectedProfession: string;
  customProfession: string;
  selectedBirthdate: string;
  /** Optional field — never gates step 2. See `onGenderChange`. */
  selectedGender: string;
  stateOptions: DropdownOption[];
  professionOptions: DropdownOption[];
  genderOptions: DropdownOption[];
  inlineErrors: {
    profession?: string;
    customProfession?: string;
    birthdate?: string;
  };
  error: string | null;
  isStep2OverlayOpen: boolean;
  isBirthdatePickerOpen: boolean;
  birthdateSectionRef: React.Ref<HTMLDivElement>;
  onStateChange: (value: string) => void;
  onProfessionChange: (value: string) => void;
  onCustomProfessionChange: (value: string) => void;
  onBirthdateChange: (value: string) => void;
  /**
   * Optional. Leaving gender unset must NEVER block "Continue" — the field exists here purely
   * for coverage, and the step-2 validation in index.tsx deliberately does not check it.
   */
  onGenderChange: (value: string) => void;
  onStateDropdownChange: (open: boolean) => void;
  onProfessionDropdownChange: (open: boolean) => void;
  onGenderDropdownChange: (open: boolean) => void;
  onBirthdateOpenChange: (open: boolean) => void;
}

const Step2Demographics: React.FC<Step2DemographicsProps> = ({
  selectedState,
  selectedProfession,
  customProfession,
  selectedBirthdate,
  selectedGender,
  stateOptions,
  professionOptions,
  genderOptions,
  inlineErrors,
  error,
  isStep2OverlayOpen,
  isBirthdatePickerOpen,
  birthdateSectionRef,
  onStateChange,
  onProfessionChange,
  onCustomProfessionChange,
  onBirthdateChange,
  onGenderChange,
  onStateDropdownChange,
  onProfessionDropdownChange,
  onGenderDropdownChange,
  onBirthdateOpenChange,
}) => {
  const ineligibilityReasons = getGiveawayIneligibilityReasons(
    selectedState,
    selectedBirthdate || undefined
  );
  return (
    <div
      className={`space-y-3 ${
        !isStep2OverlayOpen ? "" : isBirthdatePickerOpen ? "pb-96" : "pb-48"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/10 dark:bg-red-500/15">
          <MapPin className="h-4 w-4 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
          About you
        </h3>
      </div>
      <div>
        <Select
          options={stateOptions}
          value={selectedState}
          onChange={(e) => onStateChange(e.target.value)}
          placeholder="Select your state or territory"
          label="Australian State or Territory"
          required
          error={error && !selectedState ? "Please select your state" : undefined}
          onOpenChange={onStateDropdownChange}
        />
        {ineligibilityReasons.state && (
          <p
            className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"
            role="status"
          >
            <Info className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
            SA and ACT residents cannot participate in giveaways.
          </p>
        )}
      </div>
      <Dropdown
        options={professionOptions}
        value={selectedProfession}
        onChange={onProfessionChange}
        placeholder="Select your profession"
        label="Profession"
        required
        error={inlineErrors.profession}
        onOpenChange={onProfessionDropdownChange}
        showCustomInput={true}
        customInputValue={customProfession}
        onCustomInputChange={onCustomProfessionChange}
        customInputPlaceholder="Enter your profession"
        customInputError={inlineErrors.customProfession}
      />
      <div ref={birthdateSectionRef}>
        <BirthdatePicker
          value={selectedBirthdate}
          onChange={onBirthdateChange}
          onOpenChange={onBirthdateOpenChange}
          label="Date of Birth"
          required
          error={inlineErrors.birthdate}
          maxDate={new Date()}
          placeholder="Select date of birth"
          aria-invalid={!!inlineErrors.birthdate}
        />
        {ineligibilityReasons.under18 && (
          <p
            className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"
            role="status"
          >
            <Info className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
            You must be 18 or over to participate in giveaways.
          </p>
        )}
      </div>
      {/* Optional — no `required`, no error slot, and step-2 validation ignores it entirely.
          Placed last so the three fields that DO gate progress read as the ask, and this one
          as a bonus. Empty stays empty: the member can continue without touching it. */}
      <Dropdown
        options={genderOptions}
        value={selectedGender}
        onChange={onGenderChange}
        placeholder="Prefer not to say"
        label="Gender (optional)"
        onOpenChange={onGenderDropdownChange}
      />
      <GiveawayEligibilityNotice
        show={isGiveawayIneligible(selectedState, selectedBirthdate || undefined)}
      />
    </div>
  );
};

export default Step2Demographics;
