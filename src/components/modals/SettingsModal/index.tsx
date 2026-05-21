"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ModalContainer, ModalHeader, ModalContent } from "../ui";
import { useToast } from "@/components/ui/Toast";
import SubscriptionManagementModal from "../SubscriptionManagementModal";
import PaymentMethodsTab from "../PaymentMethodsTab";
import { queryKeys } from "@/lib/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import TabSwitcher, { type SettingsSection } from "./TabSwitcher";
import ProfileTab from "./ProfileTab";
import PasswordTab from "./PasswordTab";

type SubscriptionUser = React.ComponentProps<typeof SubscriptionManagementModal>["user"];

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** When set, modal opens directly to this tab (e.g. "subscription" from "Resolve payment" CTA). */
  initialTab?: SettingsSection;
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
  membershipModal: ReturnType<typeof import("@/hooks/useMembershipModal").useMembershipModal>;
};

/**
 * Unified Settings modal that centralizes profile, subscription, and password management.
 */
const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab,
  user,
  membershipModal,
}) => {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const didApplyInitialTab = useRef(false);

  const [activeTab, setActiveTab] = useState<SettingsSection>("profile");

  useEffect(() => {
    if (!isOpen) {
      didApplyInitialTab.current = false;
      return;
    }
    if (initialTab && !didApplyInitialTab.current) {
      setActiveTab(initialTab);
      didApplyInitialTab.current = true;
    }
  }, [isOpen, initialTab]);
  const [mobile, setMobile] = useState(user.mobile || "");
  const [state, setState] = useState(user.state || "");
  const [profession, setProfession] = useState(user.profession || "");
  const [isSavingMobile, setIsSavingMobile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  // Check for failed renewal
  // Note: user type in SettingsModal doesn't include subscription, but SubscriptionManagementModal receives it
  // We check subscription status via SubscriptionManagementModal's user prop
  const subscriptionUser = user as SubscriptionUser;
  const hasFailed = subscriptionUser.subscription?.status === "past_due" && !subscriptionUser.subscription?.isActive;

  const invalidateAccountData = useCallback(async () => {
    if (!session?.user?.id) return;
    // Invalidate user account/detail queries so UI reflects latest profile/subscription changes
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.account(session.user.id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(session.user.id) });
  }, [queryClient, session?.user?.id]);

  const handleSaveMobile = useCallback(async () => {
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
  }, [invalidateAccountData, mobile, showToast]);

  const handleSaveProfile = useCallback(async () => {
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
  }, [invalidateAccountData, state, profession, showToast]);

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      showToast({
        type: "error",
        title: "Password too short",
        message: "Your new password must be at least 6 characters long.",
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      showToast({
        type: "error",
        title: "Passwords do not match",
        message: "New password and confirmation do not match. Please try again.",
      });
      return;
    }

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
      setConfirmNewPassword("");
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
        message: "Check your inbox for the reset link/code.",
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

  const handleClearPasswords = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
  };

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

  const paymentView = (
    <div className="rounded-xl border border-gray-200 bg-white p-2 sm:p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/85">
      <PaymentMethodsTab user={user} />
    </div>
  );

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false}>
      <ModalHeader title="Settings" onClose={onClose} showLogo={false} />

      <ModalContent padding="lg">
        <TabSwitcher activeTab={activeTab} onChange={setActiveTab} hasFailed={hasFailed} />

        {activeTab === "profile" && (
          <ProfileTab
            firstName={user.firstName}
            lastName={user.lastName}
            email={user.email}
            isEmailVerified={user.isEmailVerified}
            initialMobile={user.mobile || ""}
            initialState={user.state || ""}
            initialProfession={user.profession || ""}
            mobile={mobile}
            state={state}
            profession={profession}
            onMobileChange={setMobile}
            onStateChange={setState}
            onProfessionChange={setProfession}
            onSaveMobile={handleSaveMobile}
            onSaveProfile={handleSaveProfile}
            isSavingMobile={isSavingMobile}
            isSavingProfile={isSavingProfile}
          />
        )}
        {activeTab === "subscription" && subscriptionView}
        {activeTab === "password" && (
          <PasswordTab
            currentPassword={currentPassword}
            newPassword={newPassword}
            confirmNewPassword={confirmNewPassword}
            onCurrentPasswordChange={setCurrentPassword}
            onNewPasswordChange={setNewPassword}
            onConfirmNewPasswordChange={setConfirmNewPassword}
            onChangePassword={handleChangePassword}
            onClearPasswords={handleClearPasswords}
            onRequestReset={handleRequestReset}
            isUpdatingPassword={isUpdatingPassword}
            isRequestingReset={isRequestingReset}
          />
        )}
        {activeTab === "payment" && paymentView}
      </ModalContent>

    </ModalContainer>
  );
};

export default SettingsModal;
