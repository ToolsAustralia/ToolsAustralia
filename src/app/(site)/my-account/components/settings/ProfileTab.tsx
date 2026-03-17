"use client";

import React, { useState } from "react";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { useToast } from "@/components/ui/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { queryKeys } from "@/lib/queryKeys";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";

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

  return (
    <div className="space-y-4">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4">Profile Details</h3>

      <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
            <div className="rounded-lg border border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 cursor-default">
              {user.firstName} {user.lastName}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <div className="rounded-lg border border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 cursor-default">
              {user.email}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email verification</label>
            <div className="flex flex-col gap-2">
              <div
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  user.isEmailVerified
                    ? "border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                    : "border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400"
                }`}
              >
                {user.isEmailVerified ? "Verified" : "Not verified"}
              </div>
              {!user.isEmailVerified && (
                <button
                  type="button"
                  onClick={() => requestModal("user-setup", true, { initialStep: 3 })}
                  className="rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-[#cc0000] hover:to-[#e60000]"
                >
                  Verify Email
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone number</label>
            <div className="flex flex-col gap-2">
              <input
                className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-red-500 dark:focus:border-red-500 focus:outline-none"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="Enter phone number"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveMobile}
                  disabled={isSavingMobile}
                  className="rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-[#cc0000] hover:to-[#e60000] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingMobile ? "Saving..." : "Save phone"}
                </button>
                <button
                  type="button"
                  onClick={() => setMobile(user.mobile || "")}
                  className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-700"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">State</label>
            <div className="flex flex-col gap-2">
              <select
                className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-red-500 dark:focus:border-red-500 focus:outline-none"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                <option value="">Select state</option>
                {AUSTRALIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Profession</label>
            <div className="flex flex-col gap-2">
              <input
                className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-red-500 dark:focus:border-red-500 focus:outline-none"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="Enter profession"
                maxLength={100}
              />
            </div>
          </div>

          <div className="flex gap-2 sm:col-span-2 sm:justify-end">
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-[#cc0000] hover:to-[#e60000] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingProfile ? "Saving..." : "Save profile"}
            </button>
            <button
              type="button"
              onClick={() => {
                setState(user.state || "");
                setProfession(user.profession || "");
              }}
              className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-700"
            >
              Reset
            </button>
          </div>
        </div>
    </div>
  );
}
