"use client";

import React, { useState } from "react";
import {
  User,
  Mail,
  ShieldCheck,
  Lock,
  CheckCircle2,
  Phone,
  Sparkles,
  ArrowUpRight,
  Info,
  Pencil,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
import { cn } from "@/utils/cn";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import {
  Card,
  SectionHeader,
  Field,
  SettingsInput,
  SettingsButton,
  SettingsBadge,
} from "./ui/primitives";

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
    subscription?: { isActive: boolean };
    enrichedOneTimePackages?: Array<{ isActive: boolean }>;
  };
}

export default function ProfileTab({ user }: ProfileTabProps) {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const requestModal = useModalPriorityStore((state) => state.requestModal);
  const router = useRouter();

  const [mobile, setMobile] = useState(user.mobile || "");
  const [state, setState] = useState(user.state || "");
  const [profession, setProfession] = useState(user.profession || "");
  const [birthdate, setBirthdate] = useState(
    user.birthdate ? String(user.birthdate).slice(0, 10) : ""
  );
  const [isSavingMobile, setIsSavingMobile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  // State / Profession show as design cards; clicking opens the real input.
  const [editingState, setEditingState] = useState(false);
  const [editingProfession, setEditingProfession] = useState(false);

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
  const isIneligible = isGiveawayIneligible(state, birthdate || user.birthdate);

  const hasFailed = hasFailedRenewal(user as unknown as import("@/models/User").IUser);
  const isGuest =
    !hasFailed &&
    !user.subscription?.isActive &&
    !(user.enrichedOneTimePackages?.some((p) => p.isActive));

  return (
    <div className="space-y-6">
      {/* Guest upsell strip */}
      {isGuest && (
        <Card className="overflow-hidden shadow-lift dark:shadow-lift-dark">
          <div className="grid sm:grid-cols-[1fr_auto] items-center gap-4 p-5 bg-gradient-to-br from-neutral-900 to-neutral-950 text-white rounded-2xl">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              <div>
                <p className="font-poppins font-bold text-base">
                  Unlock the full Tools Australia experience
                </p>
                <p className="text-sm text-white/70 mt-0.5">
                  Become a member to enter giveaways, claim partner discounts and accumulate entries.
                </p>
              </div>
            </div>
            <SettingsButton
              variant="dark"
              size="md"
              icon={ArrowUpRight}
              onClick={() =>
                router.push("/my-account/settings?tab=subscription", { scroll: false })
              }
            >
              Join a plan
            </SettingsButton>
          </div>
        </Card>
      )}

      {/* Personal Information */}
      <section>
        <SectionHeader title="Personal Information" icon={User} accent="red" />

        <div className="grid sm:grid-cols-2 gap-3">
          {/* Full name identity card */}
          <Card className="p-4 shadow-lift dark:shadow-lift-dark">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center">
                <User className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                  Full name
                  <Lock className="w-3 h-3" strokeWidth={2.25} aria-hidden />
                </p>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate mt-0.5">
                  {formatDisplayName(user.firstName, user.lastName)}
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Contact support to change
                </p>
              </div>
            </div>
          </Card>

          {/* Email identity card */}
          <Card className="p-4 shadow-lift dark:shadow-lift-dark">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center">
                <Mail className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                  Email
                  <Lock className="w-3 h-3" strokeWidth={2.25} aria-hidden />
                </p>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate mt-0.5">
                  {user.email}
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Contact support to change
                </p>
              </div>
            </div>
          </Card>

          {/* Email verification row */}
          <Card className="sm:col-span-2 p-4 shadow-lift dark:shadow-lift-dark">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                    Email verification
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    Used for sign-in &amp; receipts
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {user.isEmailVerified ? (
                  <SettingsBadge tone="success" icon={CheckCircle2}>
                    Verified
                  </SettingsBadge>
                ) : (
                  <>
                    <SettingsBadge tone="warning">Not verified</SettingsBadge>
                    <SettingsButton
                      variant="primary"
                      size="sm"
                      onClick={() => requestModal("user-setup", true, { initialStep: 3 })}
                    >
                      Verify Email
                    </SettingsButton>
                  </>
                )}
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Contact & Details */}
      <section>
        <SectionHeader
          title="Contact & Details"
          description="Used for giveaway eligibility and important account alerts."
          icon={Phone}
          accent="red"
        />

        <div className="space-y-5">
          {/* Phone number + Date of birth — same row */}
          <div className="grid sm:grid-cols-2 gap-5 items-start">
            <Field label="Phone number" hint="Used for renewal alerts and 2FA.">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 text-xs font-semibold border-r border-neutral-200 dark:border-neutral-700 pr-2.5 pointer-events-none">
                  <span className="text-base">🇦🇺</span>
                  <span>+61</span>
                </div>
                <SettingsInput
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="Enter phone number"
                  inputMode="tel"
                  className="pl-[5.5rem]"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <SettingsButton
                  variant="primary"
                  size="md"
                  onClick={handleSaveMobile}
                  disabled={isSavingMobile}
                >
                  {isSavingMobile ? "Saving..." : "Save phone"}
                </SettingsButton>
                <SettingsButton
                  variant="secondary"
                  size="md"
                  onClick={() => setMobile(user.mobile || "")}
                >
                  Reset
                </SettingsButton>
              </div>
            </Field>

            <div className="space-y-1.5">
              <BirthdatePicker
                value={birthdate}
                onChange={setBirthdate}
                label="Date of birth"
                maxDate={new Date()}
                placeholder="Select date of birth"
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
          </div>

          {/* State + Profession — design cards; click opens the real input */}
          <div className="grid sm:grid-cols-2 gap-5 items-start">
            {/* State */}
            <div className="space-y-1.5">
              {editingState ? (
                <Dropdown
                  options={AUSTRALIAN_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))}
                  value={state}
                  onChange={setState}
                  placeholder="Select state"
                  label="State"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingState(true)}
                  className="w-full text-left rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3.5 py-3 flex items-center justify-between gap-3 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] font-bold tracking-[0.14em] uppercase text-neutral-500 dark:text-neutral-400">
                      State
                    </span>
                    <span
                      className={cn(
                        "block text-sm font-semibold truncate mt-0.5",
                        state ? "text-neutral-900 dark:text-white" : "text-neutral-400 dark:text-neutral-500",
                      )}
                    >
                      {AUSTRALIAN_STATES.find((s) => s.code === state)?.name ?? "Select state"}
                    </span>
                  </span>
                  <Pencil className="w-4 h-4 text-neutral-400 shrink-0" strokeWidth={2} aria-hidden />
                </button>
              )}
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

            {/* Profession */}
            <div className="space-y-1.5">
              {editingProfession ? (
                <Field label="Profession">
                  <SettingsInput
                    value={profession}
                    onChange={(e) => setProfession(e.target.value)}
                    placeholder="Enter profession"
                    maxLength={100}
                    autoFocus
                  />
                </Field>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingProfession(true)}
                  className="w-full text-left rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3.5 py-3 flex items-center justify-between gap-3 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] font-bold tracking-[0.14em] uppercase text-neutral-500 dark:text-neutral-400">
                      Profession
                    </span>
                    <span
                      className={cn(
                        "block text-sm font-semibold truncate mt-0.5",
                        profession
                          ? "text-neutral-900 dark:text-white"
                          : "text-neutral-400 dark:text-neutral-500",
                      )}
                    >
                      {profession || "Add your profession"}
                    </span>
                  </span>
                  <Pencil className="w-4 h-4 text-neutral-400 shrink-0" strokeWidth={2} aria-hidden />
                </button>
              )}
            </div>
          </div>

          {/* Eligibility callout — positive */}
          {!isIneligible && !!state && !!(birthdate || user.birthdate) && (
            <div
              className={cn(
                "rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50",
                "bg-emerald-50/60 dark:bg-emerald-950/20 px-4 py-3 flex items-start gap-3"
              )}
            >
              <CheckCircle2
                className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                strokeWidth={2.25}
              />
              <p className="text-xs sm:text-sm text-emerald-800 dark:text-emerald-200">
                <span className="font-semibold">You&apos;re eligible to win.</span>{" "}
                Your state, age and verification all check out.
              </p>
            </div>
          )}

          {/* Ineligibility notice */}
          <GiveawayEligibilityNotice
            show={isIneligible}
            className="pt-1"
          />

          {/* Save / Reset profile */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <SettingsButton
              variant="secondary"
              size="md"
              onClick={() => {
                setState(user.state || "");
                setProfession(user.profession || "");
                setBirthdate(user.birthdate ? String(user.birthdate).slice(0, 10) : "");
              }}
            >
              Reset
            </SettingsButton>
            <SettingsButton
              variant="primary"
              size="md"
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
            >
              {isSavingProfile ? "Saving..." : "Save profile"}
            </SettingsButton>
          </div>
        </div>
      </section>
    </div>
  );
}
