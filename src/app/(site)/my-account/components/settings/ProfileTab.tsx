"use client";

import { useState } from "react";
import { AlertTriangle, ShieldCheck, Info } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { PROFESSIONS } from "@/data/professions";
import { GENDERS } from "@/data/genders";
import { useToast } from "@/components/ui/Toast";
import { queryKeys } from "@/lib/queryKeys";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import BirthdatePicker from "@/components/ui/BirthdatePicker";
import SelectMenu from "@/components/ui/SelectMenu";
import { isGiveawayIneligible, getGiveawayIneligibilityReasons } from "@/utils/giveaway-eligibility";
import { cn } from "@/utils/cn";

interface ProfileTabProps {
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    isEmailVerified?: boolean;
    isMobileVerified?: boolean;
    mobile?: string;
    state?: string;
    profession?: string;
    birthdate?: string;
    gender?: string;
  };
}

const fieldClass =
  "w-full rounded-xl border border-token bg-page px-3.5 py-3 text-sm text-primary-token placeholder:text-muted-token focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/25 dark:text-white";

/** Field label + a per-field "incomplete" indicator (amber "Required" chip) shown
 *  when that specific field is still empty — replaces the old descriptive sentence. */
function FieldLabel({ htmlFor, children, incomplete }: { htmlFor?: string; children: React.ReactNode; incomplete?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-primary-token dark:text-white">
      <span>{children}</span>
      {incomplete && (
        <span
          title="Required for the draw"
          className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
        >
          <AlertTriangle className="h-2.5 w-2.5" /> Required
        </span>
      )}
    </label>
  );
}

/**
 * Personal details for the consolidated Account settings page (Claude clean
 * design): email-verification banner + Mobile / DOB / Profession / State rows,
 * saved by ONE "Save changes" button (single POST to /api/user/update-profile).
 */
export default function ProfileTab({ user }: ProfileTabProps) {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const requestModal = useModalPriorityStore((s) => s.requestModal);

  const [mobile, setMobile] = useState(user.mobile || "");
  const [state, setState] = useState(user.state || "");
  const [profession, setProfession] = useState(user.profession || "");
  const [birthdate, setBirthdate] = useState(user.birthdate ? String(user.birthdate).slice(0, 10) : "");
  const [gender, setGender] = useState(user.gender || "");
  const [isSaving, setIsSaving] = useState(false);

  // Keep an out-of-list saved profession selectable.
  const professionOptions =
    !profession || PROFESSIONS.some((p) => p.value === profession)
      ? PROFESSIONS
      : [{ value: profession, label: profession }, ...PROFESSIONS];
  const stateOptions = AUSTRALIAN_STATES.map((s) => ({
    value: s.code,
    label: `${s.code} — ${s.name}${s.code === "SA" || s.code === "ACT" ? " (not eligible)" : ""}`,
  }));

  const reasons = getGiveawayIneligibilityReasons(state, birthdate || user.birthdate);
  const ineligible = isGiveawayIneligible(state, birthdate || user.birthdate);

  // Completeness indicator — which personal-detail fields are still empty (live from
  // the edited values, so the prompt shrinks as the user fills them in). Email
  // verification has its own banner below, so it's not counted here.
  const missing = [
    !mobile.trim() && "mobile number",
    !birthdate.trim() && "date of birth",
    !profession.trim() && "profession",
    !state.trim() && "state",
  ].filter(Boolean) as string[];

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const res = await fetch("/api/user/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile,
          state: state ? state.toUpperCase() : undefined,
          profession: profession?.trim() || undefined,
          birthdate: birthdate?.trim() || undefined,
          // Always sent (even as "") so clearing a previously-set gender persists — the route
          // keys off the property being present, not off it being truthy.
          gender: gender?.trim() || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save changes");
      showToast({ type: "success", title: "Saved", message: "Your details were updated." });
      if (session?.user?.id) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.users.account(session.user.id) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(session.user.id) });
      }
    } catch (error) {
      showToast({
        type: "error",
        title: "Save failed",
        message: error instanceof Error ? error.message : "Could not save changes",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Contact verification — email AND mobile.
          Either one satisfies the account requirement (it is the recovery
          credential for the password set at signup), so the outer banner reads
          "at least one", while each row still shows its own state and offers its
          own Verify. Both buttons open setup step 3, which now carries the
          channel picker. */}
      {(() => {
        const emailVerified = !!user.isEmailVerified;
        const mobileVerified = !!user.isMobileVerified;
        const anyVerified = emailVerified || mobileVerified;

        const row = (
          key: string,
          label: string,
          value: string | undefined,
          verified: boolean,
          missingHint: string,
        ) => (
          <div key={key} className="flex items-center gap-3">
            <span
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                verified
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                  : "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
              )}
            >
              {verified ? <ShieldCheck className="h-4.5 w-4.5" /> : <AlertTriangle className="h-4.5 w-4.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-primary-token dark:text-white">
                  {value || <span className="text-muted-token italic">No {label.toLowerCase()} on file</span>}
                </p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    verified
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
                  )}
                >
                  {verified ? "Verified" : "Unverified"}
                </span>
              </div>
              <p className="text-xs text-muted-token">{verified ? `Your ${label.toLowerCase()} is confirmed.` : missingHint}</p>
            </div>
            {!verified && value && (
              <button
                type="button"
                onClick={() => requestModal("user-setup", true, { initialStep: 3 })}
                className="shrink-0 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              >
                Verify
              </button>
            )}
          </div>
        );

        return (
          <div
            className={cn(
              "space-y-4 rounded-2xl border p-4 shadow-sm",
              anyVerified
                ? "border-token bg-surface"
                : "border-amber-300/60 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20",
            )}
          >
            {!anyVerified && (
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                Verify your email or your mobile — it&apos;s how you get back in if you forget your password.
              </p>
            )}
            {row("email", "Email", user.email, emailVerified, "Confirm your email to secure your account.")}
            {row(
              "mobile",
              "Mobile",
              user.mobile,
              mobileVerified,
              "Confirm your mobile so you can sign in by text.",
            )}
          </div>
        );
      })()}

      {/* Personal details */}
      <div className={cn("rounded-2xl border bg-surface p-5 shadow-sm", missing.length > 0 ? "border-amber-300/60" : "border-token")}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Personal details</p>
          {missing.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" /> {missing.length} to complete
            </span>
          )}
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <FieldLabel htmlFor="mobile" incomplete={!mobile.trim()}>Mobile number</FieldLabel>
            <input
              id="mobile"
              type="tel"
              inputMode="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="0412 345 678"
              className={fieldClass}
            />
          </div>

          <div>
            <FieldLabel htmlFor="birthdate" incomplete={!birthdate.trim()}>Date of birth</FieldLabel>
            <BirthdatePicker
              id="birthdate"
              value={birthdate}
              onChange={setBirthdate}
              maxDate={new Date()}
              placeholder="Select date of birth"
              popoverClassName="left-auto right-0 w-[min(22rem,calc(100vw-1.5rem))] sm:left-0 sm:right-0 sm:w-full"
            />
          </div>

          <div>
            <FieldLabel htmlFor="profession" incomplete={!profession.trim()}>Profession</FieldLabel>
            <SelectMenu id="profession" value={profession} onChange={setProfession} options={professionOptions} placeholder="Select profession" />
          </div>

          <div>
            <FieldLabel htmlFor="state" incomplete={!state.trim()}>State</FieldLabel>
            <SelectMenu id="state" value={state} onChange={setState} options={stateOptions} placeholder="Select state" />
          </div>

          {/* Gender is the one OPTIONAL field on this form, so it deliberately gets no
              `incomplete` chip and is excluded from `missing` above — an amber "Required"
              badge on a field nobody has to fill would be a lie. */}
          <div>
            <FieldLabel htmlFor="gender">
              Gender <span className="font-normal text-muted-token">(optional)</span>
            </FieldLabel>
            <SelectMenu
              id="gender"
              value={gender}
              onChange={setGender}
              options={GENDERS}
              placeholder="Prefer not to say"
            />
          </div>

          {ineligible && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/20">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                {reasons.under18 ? "You must be 18 or over to enter giveaways. " : ""}
                {reasons.state ? "SA and ACT residents can't enter giveaways." : ""}
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="mt-5 w-full rounded-xl bg-gradient-to-b from-red-500 to-red-700 py-3 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60 motion-safe:active:translate-y-px"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
