"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { cn } from "@/utils/cn";

const SUBJECTS = ["General Inquiry", "Support", "Partnership", "Feedback"];
const fieldClass =
  "w-full rounded-xl border border-token bg-page px-3.5 py-3 text-sm text-primary-token placeholder:text-muted-token focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/25 dark:text-white";
const labelClass = "block text-sm font-medium text-primary-token dark:text-white";

/**
 * Compact, design-system contact form for the Support sheet — same submission
 * (`/api/contact-submissions`) + pixel `trackLead` as the site `ContactForm`, but
 * clean bordered inputs / pill subject / red button instead of the full-page
 * form's underline inputs + MetallicButton (which looked off inside the sheet).
 * The section header ("Send us a message") lives in SupportSheet, so no title here.
 */
export default function SupportContactForm() {
  const { trackLead } = usePixelTracking();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", subject: "General Inquiry", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const valid =
    form.firstName.trim() !== "" &&
    form.lastName.trim() !== "" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
    form.phone.trim() !== "" &&
    form.message.trim().length >= 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/contact-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) {
          const retry = data.retryAfter || 300;
          const mins = Math.floor(retry / 60);
          setError(`Too many messages — please wait ${mins > 0 ? `${mins} minute${mins > 1 ? "s" : ""}` : `${retry} seconds`} before trying again.`);
          return;
        }
        throw new Error(data.message || data.error || "Failed to send message");
      }
      trackLead({
        content_type: "contact_form",
        content_name: `Contact Form - ${form.subject}`,
        content_category: "lead_generation",
        value: 0,
        currency: "AUD",
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white">
          <Check className="h-6 w-6" strokeWidth={3} />
        </span>
        <p className="font-['Poppins'] text-base font-bold text-primary-token dark:text-white">Message sent</p>
        <p className="text-sm text-muted-token">Thanks for reaching out — we&apos;ll get back to you soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="sc-first" className={labelClass}>First name</label>
          <input id="sc-first" className={fieldClass} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="First name" autoComplete="given-name" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sc-last" className={labelClass}>Last name</label>
          <input id="sc-last" className={fieldClass} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Last name" autoComplete="family-name" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="sc-email" className={labelClass}>Email</label>
        <input id="sc-email" type="email" className={fieldClass} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" autoComplete="email" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="sc-phone" className={labelClass}>Phone number</label>
        <input id="sc-phone" type="tel" className={fieldClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0412 345 678" autoComplete="tel" />
      </div>

      <div className="space-y-1.5">
        <span className={labelClass}>Subject</span>
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set("subject", s)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600",
                form.subject === s
                  ? "border-red-600 bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                  : "border-token bg-surface text-muted-token hover:text-primary-token",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="sc-message" className={labelClass}>Message</label>
          <span className={cn("text-xs", form.message.trim().length < 10 ? "text-muted-token" : "text-emerald-600 dark:text-emerald-400")}>
            {form.message.length}/500
          </span>
        </div>
        <textarea
          id="sc-message"
          rows={4}
          maxLength={500}
          className={cn(fieldClass, "resize-none")}
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
          placeholder="Write your message (minimum 10 characters)…"
        />
      </div>

      <button
        type="submit"
        disabled={!valid || submitting}
        className="w-full rounded-xl bg-gradient-to-b from-red-500 to-red-700 py-3 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60 motion-safe:active:translate-y-px"
      >
        {submitting ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
