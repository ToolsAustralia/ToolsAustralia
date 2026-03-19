"use client";

import React, { useState } from "react";
import { Lock } from "lucide-react";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import Dropdown from "@/components/modals/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { queryKeys } from "@/lib/queryKeys";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { formatDisplayName } from "@/utils/display-name";
import GiveawayEligibilityNotice from "@/components/ui/GiveawayEligibilityNotice";
import BirthdatePicker from "@/components/ui/BirthdatePicker";
import { isGiveawayIneligible, getGiveawayIneligibilityReasons } from "@/utils/giveaway-eligibility";
import { Info } from "lucide-react";

interface ProfileTabProps {
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    isEmailVerified?: boolean;
    mobile?: string;
    state?: string;
    profession?: string;
    birthdate?: string;
  };
}

export default function ProfileTab({ user }: ProfileTabProps) {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const requestModal = useModalPriorityStore((state) => state.requestModal);

  const [mobile, setMobile] = useState(user.mobile || "");
  const [state, setState] = useState(user.state || "");
  const [profession, setProfession] = useState(user.profession || "");
  const [birthdate, setBirthdate] = useState(
    user.birthdate ? String(user.birthdate).slice(0, 10) : ""
  );
  const [isSavingMobile, setIsSavingMobile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const invalidateAccountData = async () => {
    if (!session?.user?.id) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.account(session.user.id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(session.user.id) });
  };

  const handleSaveMobile = async () => {
    try {
      setIsSavingMobile(true);
      const res = await fetch("/api/user/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update phone number");
      }

      showToast({
        type: "success",
        title: "Phone updated",
        message: "The phone number was updated successfully.",
      });
      await invalidateAccountData();
    } catch (error) {
      showToast({
        type: "error",
        title: "Update failed",
        message: error instanceof Error ? error.message : "Could not update phone number",
      });
    } finally {
      setIsSavingMobile(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setIsSavingProfile(true);
      const res = await fetch("/api/user/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: state ? state.toUpperCase() : undefined,
          profession: profession?.trim() || undefined,
          birthdate: birthdate?.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile");
      }

      showToast({
        type: "success",
        title: "Profile updated",
        message: "Your profile information was updated successfully.",
      });
      await invalidateAccountData();
    } catch (error) {
      showToast({
        type: "error",
        title: "Update failed",
        message: error instanceof Error ? error.message : "Could not update profile",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const ineligibilityReasons = getGiveawayIneligibilityReasons(state, birthdate || user.birthdate);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white pb-3 border-b border-gray-200 dark:border-neutral-700">
          Personal Information
        </h3>
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            Name
          </label>
          <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/50 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400 cursor-not-allowed">
            {formatDisplayName(user.firstName, user.lastName)}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            Email
          </label>
          <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/50 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400 cursor-not-allowed">
            {user.email}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email verification</label>
          <div className="flex flex-col gap-2">
            <div
              className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                user.isEmailVerified
                  ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                  : "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400"
              }`}
            >
              {user.isEmailVerified ? "Verified" : "Not verified"}
            </div>
            {!user.isEmailVerified && (
              <button
                type="button"
                onClick={() => requestModal("user-setup", true, { initialStep: 3 })}
                className="rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-[#cc0000] hover:to-[#e60000] hover:shadow-md"
              >
                Verify Email
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-gray-200 dark:border-neutral-700">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white pb-3 border-b border-gray-200 dark:border-neutral-700">
          Contact & Details
        </h3>
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone number</label>
          <input
            className="w-full rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:border-red-500 dark:focus:border-red-500 focus:border-l-2 focus:border-l-red-500 focus:outline-none transition-all"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="Enter phone number"
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSaveMobile}
              disabled={isSavingMobile}
              className="rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-[#cc0000] hover:to-[#e60000] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingMobile ? "Saving..." : "Save phone"}
            </button>
            <button
              type="button"
              onClick={() => setMobile(user.mobile || "")}
              className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <div>
            <Dropdown
              options={AUSTRALIAN_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))}
              value={state}
              onChange={setState}
              placeholder="Select state"
              label="State"
            />
            {ineligibilityReasons.state && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300" role="status">
                <Info className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                SA and ACT residents cannot participate in giveaways.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div>
            <BirthdatePicker
              value={birthdate}
              onChange={setBirthdate}
              label="Date of birth"
              maxDate={new Date()}
              placeholder="Select date of birth"
            />
            {ineligibilityReasons.under18 && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300" role="status">
                <Info className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                You must be 18 or over to participate in giveaways.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Profession</label>
          <input
            className="w-full rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:border-red-500 dark:focus:border-red-500 focus:border-l-2 focus:border-l-red-500 focus:outline-none transition-all"
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            placeholder="Enter profession"
            maxLength={100}
          />
        </div>

        <GiveawayEligibilityNotice
          show={isGiveawayIneligible(state, birthdate || user.birthdate)}
          className="pt-1"
        />

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={() => {
              setState(user.state || "");
              setProfession(user.profession || "");
              setBirthdate(user.birthdate ? String(user.birthdate).slice(0, 10) : "");
            }}
            className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={isSavingProfile}
            className="rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-[#cc0000] hover:to-[#e60000] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingProfile ? "Saving..." : "Save profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
