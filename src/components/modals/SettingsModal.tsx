"use client";

import React, { useMemo, useState } from "react";
import { ModalContainer, ModalHeader, ModalContent } from "./ui";
import { useToast } from "@/components/ui/Toast";
import SubscriptionManagementModal from "./SubscriptionManagementModal";
import { queryKeys } from "@/lib/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

type SettingsSection = "profile" | "subscription" | "password";
type SubscriptionUser = React.ComponentProps<typeof SubscriptionManagementModal>["user"];

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    isEmailVerified?: boolean;
    mobile?: string;
  };
  membershipModal: ReturnType<typeof import("@/hooks/useMembershipModal").useMembershipModal>;
};

const tabButtonClass = (active: boolean) =>
  `flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
    active ? "bg-[#ee0000] text-white border-[#ee0000]" : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
  }`;

/**
 * Unified Settings modal that centralizes profile, subscription, and password management.
 */
const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, user, membershipModal }) => {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<SettingsSection>("profile");
  const [mobile, setMobile] = useState(user.mobile || "");
  const [isSavingMobile, setIsSavingMobile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);

  const invalidateAccountData = async () => {
    if (!session?.user?.id) return;
    // Invalidate user account/detail queries so UI reflects latest profile/subscription changes
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

  const handleChangePassword = async () => {
    try {
      setIsUpdatingPassword(true);
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to change password");
      }
      showToast({
        type: "success",
        title: "Password changed",
        message: "Your password has been updated.",
      });
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      showToast({
        type: "error",
        title: "Change failed",
        message: error instanceof Error ? error.message : "Could not change password",
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleRequestReset = async () => {
    try {
      setIsRequestingReset(true);
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to request reset");
      }
      showToast({
        type: "success",
        title: "Reset email sent",
        message: "Check the inbox for the reset link/code.",
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Request failed",
        message: error instanceof Error ? error.message : "Could not send reset email",
      });
    } finally {
      setIsRequestingReset(false);
    }
  };

  const profileView = useMemo(
    () => (
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">Profile Details</h3>
          <p className="text-xs text-gray-500">Name and email are read-only here; phone is editable.</p>
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">Name</label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {user.firstName} {user.lastName}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {user.email}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">Email verification</label>
              <div
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  user.isEmailVerified
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-yellow-200 bg-yellow-50 text-yellow-700"
                }`}
              >
                {user.isEmailVerified ? "Verified" : "Not verified"}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">Phone number</label>
              <div className="flex flex-col gap-2">
                <input
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
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
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    [isSavingMobile, mobile, user.email, user.firstName, user.isEmailVerified, user.lastName, user.mobile]
  );

  const passwordView = (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900">Change Password</h3>
        <p className="text-xs text-gray-500">Minimum length is enforced; current password required.</p>
        <div className="mt-3 space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Current password</label>
            <input
              type="password"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">New password</label>
            <input
              type="password"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={isUpdatingPassword}
              className="rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-[#cc0000] hover:to-[#e60000] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUpdatingPassword ? "Updating..." : "Update password"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentPassword("");
                setNewPassword("");
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900">Forgot password</h3>
        <p className="text-xs text-gray-500">Send a reset link/code to the account email.</p>
        <button
          type="button"
          onClick={handleRequestReset}
          disabled={isRequestingReset}
          className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRequestingReset ? "Sending..." : "Send reset email"}
        </button>
      </div>
    </div>
  );

  const subscriptionView = (
    <div className="rounded-xl border border-gray-200 bg-white p-2 sm:p-3 shadow-sm">
      <SubscriptionManagementModal
        isOpen
        onClose={onClose}
        user={user as SubscriptionUser}
        membershipModal={membershipModal}
        renderAsPanel
      />
    </div>
  );

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false}>
      <ModalHeader title="Settings" onClose={onClose} showLogo={false} />

      <ModalContent padding="lg">
        <div className="mb-4 flex gap-2">
          <button className={tabButtonClass(activeTab === "profile")} onClick={() => setActiveTab("profile")}>
            Profile Details
          </button>
          <button className={tabButtonClass(activeTab === "subscription")} onClick={() => setActiveTab("subscription")}>
            Subscription
          </button>
          <button className={tabButtonClass(activeTab === "password")} onClick={() => setActiveTab("password")}>
            Password
          </button>
        </div>

        {activeTab === "profile" && profileView}
        {activeTab === "subscription" && subscriptionView}
        {activeTab === "password" && passwordView}
      </ModalContent>
    </ModalContainer>
  );
};

export default SettingsModal;
