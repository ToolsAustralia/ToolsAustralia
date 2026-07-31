"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ExternalLink, EyeOff, Tag } from "lucide-react";
import { cn } from "@/utils/cn";
import type { PartnerSsoSharedField } from "@/utils/partner-discounts/partner-consent";

export interface PortalConsentProps {
  /** Server-derived disclosure list — exactly what the SSO hand-off will send. */
  fields: PartnerSsoSharedField[];
  /** Shown inline when recording consent fails. */
  errorMessage?: string | null;
  /** True while `POST /api/partner-discount/consent` is in flight. */
  submitting?: boolean;
  onAgree: () => void;
  onCancel: () => void;
}

/**
 * The partner's OWN policy documents — these are the exact URLs MyRewards links from the
 * footer of `myrewards.com.au`, i.e. the operator's canonical pair, verified 2026-07-31
 * (both 200 with matching `<title>`s; that host returns a real 404 for a bogus path, so
 * the 200s are meaningful).
 *
 * DO NOT GUESS THESE. An earlier draft used `myrewards.com.au/terms-conditions`, which
 * silently renders the marketing homepage — the member would have ticked "I accept the
 * partner's Terms" against a page that is not the terms. If the vendor moves them, re-verify
 * against a known-bad control path rather than trusting a 200.
 */
const PARTNER_PRIVACY_URL = "https://www.myrewardsinternational.com/privacy-policy/";
const PARTNER_TERMS_URL = "https://www.myrewardsinternational.com/terms-and-conditions/";

/**
 * PortalConsent — informed consent before ANY member data crosses to the partner.
 *
 * WHY THE FIELD LIST IS A PROP, NOT A CONSTANT: it arrives from the 409 the SSO route
 * returns, built by `buildPartnerSsoSharedFields` — the same function the hand-off is
 * derived from. The sheet therefore cannot show a field we don't send, or omit one we do.
 * Hard-coding the rows here is exactly the drift this design is meant to prevent.
 *
 * SCOPE (deliberate omissions, owner's call): no marketing opt-in, no remember-this-device
 * tick, and no "withdraw in Account → Connected services" line — we do not ship a
 * Connected-services surface, so promising one would be a false statement on a privacy
 * screen. One required tick, nothing bundled. Bundled consent is not valid consent under
 * the Australian Privacy Act / APPs, and with the optional ticks gone there is nothing to
 * bundle.
 *
 * Desktop: centred dialog. Mobile: bottom sheet. Both `role="dialog" aria-modal="true"`,
 * labelled by the title, focus-trapped, `Esc` = Not now. The tick is a real
 * `<input type="checkbox">` wired to the disclosure list via `aria-describedby`.
 */
export default function PortalConsent({
  fields,
  errorMessage,
  submitting = false,
  onAgree,
  onCancel,
}: PortalConsentProps) {
  const [agreed, setAgreed] = useState(false);
  const titleId = useId();
  const listId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFocusRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href]'
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-[rgba(8,8,10,.68)] backdrop-blur-[5px] dark:bg-[rgba(8,8,10,.74)]"
        style={{ animation: "ta-sheet-fade .26s cubic-bezier(.22,1,.36,1) both" }}
        onClick={onCancel}
        aria-hidden
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[94%] w-full flex-col overflow-auto rounded-t-[22px] bg-white sm:max-h-full sm:w-[478px] sm:rounded-[18px] dark:bg-[#161617]"
        style={{
          animation: "ta-sheet-up .34s cubic-bezier(.22,1,.36,1) both",
          boxShadow: "0 40px 80px -40px rgba(15,23,42,.45)",
        }}
      >
        {/* Header */}
        <div className="border-b border-[rgba(15,23,42,.08)] px-[18px] pb-4 pt-[18px] sm:px-6 dark:border-[rgba(255,255,255,.09)]">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-gradient-to-br from-[#ff2a2a] to-[#c40d0d] font-poppins text-[11px] font-black leading-none text-white">
              TA
            </span>
            <ArrowRight className="h-[17px] w-[17px] flex-none text-[#8a93a1] dark:text-[#737373]" />
            <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-[#d4af37]/55 bg-[#fffdf5] text-[#9c7614] dark:border-[#d4af37]/50 dark:bg-[#16161a] dark:text-[#f7d768]">
              <Tag className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </span>
            <span className="ml-auto rounded-full bg-[rgba(15,23,42,.05)] px-[9px] py-[7px] text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#8a93a1] dark:bg-[rgba(255,255,255,.05)] dark:text-[#737373]">
              Step 1 of 2
            </span>
          </div>

          <h2
            id={titleId}
            className="mt-[13px] font-poppins text-[19px] font-extrabold leading-[1.25] tracking-[-0.01em] text-[#15181f] sm:mt-3 dark:text-white"
          >
            Continue to Tools Australia Rewards
          </h2>
          <p className="mt-1.5 text-[12.5px] font-normal leading-[1.55] text-[#5b6573] dark:text-[#a3a3a3]">
            We&rsquo;ll share these details to set up your account:
          </p>
        </div>

        {/* Shared fields — server-derived, never hard-coded here. */}
        <div className="px-[18px] sm:px-6">
          <ul id={listId} className="m-0 list-none p-0">
            {fields.map((f) => (
              <li
                key={f.key}
                className="flex items-center justify-between gap-3 border-b border-[rgba(15,23,42,.06)] py-2 last:border-b-0 dark:border-[rgba(255,255,255,.07)]"
              >
                <span className="text-[12.5px] font-bold text-[#15181f] dark:text-white">{f.label}</span>
                <span
                  className={cn(
                    "min-w-0 truncate text-right text-[12.5px] font-semibold",
                    f.accent ? "text-[#ee0000] dark:text-[#ff4444]" : "text-[#5b6573] dark:text-[#a3a3a3]"
                  )}
                >
                  {f.value}
                </span>
              </li>
            ))}
          </ul>

          {/* Above the tick on purpose — the boundary does more for trust than the list does. */}
          <div className="mt-2.5 flex gap-2.5 rounded-[12px] border border-[rgba(15,23,42,.07)] bg-[#f7f8fa] px-3 py-[11px] dark:border-[rgba(255,255,255,.07)] dark:bg-[rgba(255,255,255,.03)]">
            <EyeOff className="mt-[1px] h-[15px] w-[15px] flex-none text-[#0f9d6b] dark:text-[#34d399]" />
            <div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[#0f9d6b] dark:text-[#34d399]">
                Never shared
              </div>
              <p className="mt-0.5 text-[11.5px] font-normal leading-[1.5] text-[#5b6573] dark:text-[#a3a3a3]">
                Payment details, billing address and your draw entries stay with Tools Australia.
              </p>
            </div>
          </div>

          {/* Single required tick. Nothing optional, so nothing bundled. */}
          <label className="mt-3.5 flex cursor-pointer items-start gap-2.5 pb-1">
            <input
              ref={firstFocusRef}
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              aria-describedby={listId}
              className="mt-[1px] h-[19px] w-[19px] flex-none cursor-pointer rounded-[6px] accent-[#ee0000] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            />
            <span className="text-[12px] font-medium leading-[1.5] text-[#15181f] dark:text-[#f5f5f5]">
              I agree to share these details with Tools Australia Rewards and accept their{" "}
              <a
                href={PARTNER_PRIVACY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#ee0000] underline"
                onClick={(e) => e.stopPropagation()}
              >
                Privacy Policy
              </a>{" "}
              and{" "}
              <a
                href={PARTNER_TERMS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#ee0000] underline"
                onClick={(e) => e.stopPropagation()}
              >
                Terms
              </a>
              .
            </span>
          </label>
        </div>

        {errorMessage && (
          <p className="px-[18px] text-[11.5px] font-semibold text-[#c40d0d] sm:px-6 dark:text-[#ff6b6b]" role="alert">
            {errorMessage}
          </p>
        )}

        {/* Actions — mobile stacks primary-on-top. */}
        <div className="flex flex-col-reverse gap-2.5 px-[18px] pb-[18px] pt-3.5 sm:flex-row sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[11px] border border-[rgba(15,23,42,.14)] bg-white px-[18px] py-3.5 text-[13px] font-extrabold text-[#5b6573] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-[rgba(255,255,255,.14)] dark:bg-transparent dark:text-[#a3a3a3]"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onAgree}
            /* Inert, not merely styled — no token is requested until consent is recorded. */
            disabled={!agreed || submitting}
            aria-disabled={!agreed || submitting}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-[11px] px-[18px] py-[15px] text-[13.5px] font-extrabold transition-all duration-[180ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600",
              agreed && !submitting
                ? "cursor-pointer bg-gradient-to-b from-[#f7d768] to-[#d4af37] text-[#241a02]"
                : "cursor-not-allowed bg-[rgba(15,23,42,.07)] text-[rgba(15,23,42,.34)] dark:bg-[rgba(255,255,255,.07)] dark:text-[rgba(255,255,255,.3)]"
            )}
            style={agreed && !submitting ? { boxShadow: "0 12px 24px -12px rgba(212,175,55,.9)" } : undefined}
          >
            {submitting ? "Saving…" : "Agree & continue"}
            {!submitting && <ExternalLink className="h-[15px] w-[15px]" />}
          </button>
        </div>
      </div>
    </div>
  );
}
