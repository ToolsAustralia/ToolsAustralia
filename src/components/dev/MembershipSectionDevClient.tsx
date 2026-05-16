"use client";

import React, { useMemo, useState } from "react";
import { membershipPackages, type StaticMembershipPackage } from "@/data/membershipPackages";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getAdditionalPackDiscount } from "@/utils/membership/additional-pack-discount";
import { isOneTimeBestValuePlanId } from "@/utils/membership/member-package-mapping";
import ElectricPackageCard from "@/components/sections/membership/ElectricPackageCard";

type UserState = "guest" | "subscriber" | "entries";
type Tab = "one-time" | "membership";
type Mult = 1 | 2 | 5 | 10;

function toLocalPlan(pkg: StaticMembershipPackage, mult: Mult): LocalMembershipPlan {
  const baseEntries = pkg.type === "subscription" ? pkg.entriesPerMonth ?? 0 : pkg.totalEntries ?? 0;
  const id = pkg.isMemberOnly ? `${pkg._id}-member` : pkg._id;
  const multiplied = mult > 1;
  return {
    id,
    name: pkg.name,
    price: pkg.price,
    period: pkg.type === "subscription" ? "mo" : "one-time",
    features: pkg.features.map((text) => ({ text })),
    buttonText: "Enter Now",
    buttonStyle: "primary",
    isMemberOnly: pkg.isMemberOnly,
    metadata: {
      entriesCount: multiplied ? baseEntries * mult : baseEntries,
      originalEntries: baseEntries,
      promoMultiplier: mult,
      isPromoActive: multiplied,
    },
  };
}

const BTN = "px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors";

export default function MembershipSectionDevClient() {
  const [userState, setUserState] = useState<UserState>("guest");
  const [tab, setTab] = useState<Tab>("one-time");
  const [mult, setMult] = useState<Mult>(1);
  const [dark, setDark] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [lockedPreview, setLockedPreview] = useState(false);
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const hasAccess = userState === "subscriber" || userState === "entries";

  const plans = useMemo(() => {
    if (tab === "membership") {
      return membershipPackages
        .filter((p) => p.type === "subscription" && p.isActive)
        .map((p) => toLocalPlan(p, mult));
    }
    const oneTime = membershipPackages.filter((p) => p.type === "one-time" && p.isActive);
    const showMemberOnly = hasAccess || lockedPreview;
    const filtered = showMemberOnly
      ? oneTime.filter((p) => p.isMemberOnly === true)
      : oneTime.filter((p) => !p.isMemberOnly);
    return filtered.map((p) => toLocalPlan(p, mult));
  }, [tab, hasAccess, mult, lockedPreview]);

  return (
    <div className={dark ? "dark" : ""}>
      <div
        className={
          "min-h-screen bg-white p-6 dark:bg-neutral-950 " +
          (reducedMotion ? "[&_*]:!transition-none [&_*]:!animate-none" : "")
        }
      >
        <h1 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
          /dev/membershipsection — Electric card preview
        </h1>

        <div className="mb-6 flex flex-wrap gap-2 text-gray-900 dark:text-white">
          {(["guest", "subscriber", "entries"] as UserState[]).map((s) => (
            <button key={s} onClick={() => setUserState(s)}
              className={BTN + (userState === s ? " bg-blue-600 text-white border-blue-600" : " border-gray-400")}>
              {s}
            </button>
          ))}
          <span className="mx-2 opacity-40">|</span>
          {(["one-time", "membership"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={BTN + (tab === t ? " bg-blue-600 text-white border-blue-600" : " border-gray-400")}>
              {t}
            </button>
          ))}
          <span className="mx-2 opacity-40">|</span>
          {([1, 2, 5, 10] as Mult[]).map((m) => (
            <button key={m} onClick={() => setMult(m)}
              className={BTN + (mult === m ? " bg-blue-600 text-white border-blue-600" : " border-gray-400")}>
              {m}x
            </button>
          ))}
          <span className="mx-2 opacity-40">|</span>
          <button onClick={() => setDark((v) => !v)} className={BTN + " border-gray-400"}>
            {dark ? "dark" : "light"}
          </button>
          <button onClick={() => setReducedMotion((v) => !v)} className={BTN + " border-gray-400"}>
            reduced-motion: {reducedMotion ? "on" : "off"}
          </button>
          <button onClick={() => setShowOld((v) => !v)} className={BTN + " border-gray-400"}>
            old-vs-new: {showOld ? "on" : "off"}
          </button>
          <button onClick={() => setLockedPreview((v) => !v)} className={BTN + " border-gray-400"}>
            locked-preview: {lockedPreview ? "on" : "off"}
          </button>
        </div>

        {lastSelected && (
          <p className="mb-4 text-sm text-green-600 dark:text-emerald-400">
            Selected: {lastSelected}
          </p>
        )}

        <div
          className={
            "mx-auto grid w-full max-w-7xl grid-cols-1 gap-x-6 gap-y-14 overflow-visible px-2 sm:grid-cols-2 " +
            (plans.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-3")
          }
        >
          {plans.map((plan) => {
            const colorScheme =
              tab === "membership"
                ? getMembershipSectionColorScheme(plan.id, true)
                : getElectricPackageColorScheme(plan.id);
            const discount =
              tab === "one-time"
                ? getAdditionalPackDiscount(plan.id)
                : null;
            const locked = tab === "one-time" && plan.isMemberOnly === true && !hasAccess;
            const showBestValue =
              tab === "membership"
                ? plan.id.includes("boss")
                : isOneTimeBestValuePlanId(plan.id);
            const ribbon = !showBestValue && plan.id.includes("foreman") ? "MOST POPULAR" : null;
            return (
              <div key={plan.id} className="overflow-visible px-2 pt-12">
                <ElectricPackageCard
                  plan={plan}
                  colorScheme={colorScheme}
                  state={{ locked, lockReason: "Subscription or Entries Required", isCurrent: false }}
                  discount={discount ? { regularPrice: discount.regularPrice, percentOff: discount.percentOff } : null}
                  onSelect={(p) => setLastSelected(`${p.name} ($${p.price})`)}
                  showBestValue={showBestValue}
                  ribbon={ribbon}
                />
                {showOld && (
                  <p className="mt-2 text-center text-xs text-gray-500 dark:text-neutral-400">
                    (old card comparison: open the live section in another tab)
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
