"use client";

import React from "react";
import Dropdown from "../ui/Dropdown";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { formatDisplayName } from "@/utils/display-name";

interface ProfileTabProps {
  firstName: string;
  lastName: string;
  email: string;
  isEmailVerified?: boolean;
  initialMobile: string;
  initialState: string;
  initialProfession: string;
  mobile: string;
  state: string;
  profession: string;
  onMobileChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onProfessionChange: (value: string) => void;
  onSaveMobile: () => void;
  onSaveProfile: () => void;
  isSavingMobile: boolean;
  isSavingProfile: boolean;
}

const ProfileTab: React.FC<ProfileTabProps> = ({
  firstName,
  lastName,
  email,
  isEmailVerified,
  initialMobile,
  initialState,
  initialProfession,
  mobile,
  state,
  profession,
  onMobileChange,
  onStateChange,
  onProfessionChange,
  onSaveMobile,
  onSaveProfile,
  isSavingMobile,
  isSavingProfile,
}) => {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/85">
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-neutral-100">Profile Details</h3>

        <div className="mt-2 sm:mt-3 space-y-2 sm:space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200">Name</label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 dark:border-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-200 cursor-default">
              {formatDisplayName(firstName, lastName)}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200">Email</label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 dark:border-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-200 cursor-default">
              {email}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200">Email verification</label>
            <div
              className={`rounded-lg border px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold ${
                isEmailVerified
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-yellow-200 bg-yellow-50 text-yellow-700"
              }`}
            >
              {isEmailVerified ? "Verified" : "Not verified"}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200">Phone number</label>
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <input
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-900 placeholder:text-gray-500 focus:border-red-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                value={mobile}
                onChange={(e) => onMobileChange(e.target.value)}
                placeholder="Enter phone number"
              />
              <div className="flex gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={onSaveMobile}
                  disabled={isSavingMobile}
                  className="rounded-lg bg-gradient-to-r from-red-600 to-red-400 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:from-red-675 hover:to-red-650 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingMobile ? "Saving..." : "Save phone"}
                </button>
                <button
                  type="button"
                  onClick={() => onMobileChange(initialMobile)}
                  className="rounded-lg border border-gray-300 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-gray-700 dark:border-neutral-600 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Dropdown
              options={AUSTRALIAN_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))}
              value={state}
              onChange={onStateChange}
              placeholder="Select state"
              label="State"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200">Profession</label>
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <input
                className="rounded-lg border border-gray-300 px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-red-500 focus:outline-none"
                value={profession}
                onChange={(e) => onProfessionChange(e.target.value)}
                placeholder="Enter profession"
                maxLength={100}
              />
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2 sm:col-span-2 sm:justify-end">
            <button
              type="button"
              onClick={onSaveProfile}
              disabled={isSavingProfile}
              className="rounded-lg bg-gradient-to-r from-red-600 to-red-400 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:from-red-675 hover:to-red-650 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingProfile ? "Saving..." : "Save profile"}
            </button>
            <button
              type="button"
              onClick={() => {
                onStateChange(initialState);
                onProfessionChange(initialProfession);
              }}
              className="rounded-lg border border-gray-300 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-gray-700 dark:border-neutral-600 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileTab;
