"use client";

/**
 * SupportChatWidget.tsx
 *
 * Floating chat bubble + slide-up panel for the AI support assistant ("Cobber").
 *
 * Design decisions:
 * - z-index 9000: below Z_INDEX.MODAL_BASE (10000) so upsell/renewal/gate modals always win.
 * - Entry points: the floating bubble everywhere EXCEPT /my-account, where the dashboard
 *   "Ask Cobber" card is the canonical launcher (it dispatches OPEN_SUPPORT_CHAT_EVENT).
 *   The bubble is suppressed there to avoid a duplicate affordance; the panel still opens
 *   via the event and is closed by its own header ✕.
 * - The panel hides while a dashboard overlay sheet (Support/Payment/Manage — SheetShell
 *   portaled to <body> at z-[120]) is open, so Cobber never floats over it.
 * - Labelled "AI support mate" in the header AND the welcome block.
 * - 4-6 quick-reply buttons shown before the text input (no LLM cost on deflection).
 * - hCaptcha rendered when the server returns captcha_required (anonymous guests only).
 * - If NEXT_PUBLIC_HCAPTCHA_SITEKEY is unset: show "sign in to chat" hint instead.
 * - Members (isAuthenticated) never see the captcha UI.
 * - Uses useSupportChat() for all state/streaming logic.
 * - Pure UI: no DB, no business logic, no direct model calls. Talks only to /api/chat.
 *
 * Adaptive brand accent ("Workshop v2"):
 * - The launcher fill, header band, YOUR message bubbles, the send button, quick-reply
 *   chips and the "Cobber" name highlight are all driven by usePromoTheme() — which
 *   DEFAULTS to Milwaukee (Tools Australia red) off a prize page, so non-promo surfaces
 *   get red automatically. Applied as CSS custom properties (--cob-acc / --cob-acc-deep /
 *   --cob-acc-ink) on the launcher + panel, consumed via Tailwind arbitrary values.
 * - Semantics stay FIXED regardless of accent: online dot = green, notices = amber,
 *   hard error = red.
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import Image from "next/image";
import type { UIMessage } from "ai";
import { Z_INDEX } from "@/constants/z-index";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { OPEN_SUPPORT_CHAT_EVENT } from "@/lib/support-chat/widget-events";
import { useSupportChat } from "./useSupportChat";
import { useDodgeFloatingObstacles } from "./useDodgeFloatingObstacles";
import {
  hasAcknowledgedDisclosure,
  acknowledgeDisclosure,
} from "@/lib/support-chat/chatStorage";
import ChatMarkdown from "./ChatMarkdown";

const HCaptcha = dynamic(() => import("@hcaptcha/react-hcaptcha"), {
  ssr: false,
});

// Cobber avatar — the owner ships a real image; keep it everywhere (no mascot SVG).
const COBBER_AVATAR = "/images/icons/cobber.png";
const COBBER_ALT = "Cobber — Tools Australia AI support assistant";

// Subtle bubble entry — reuse the existing globals.css keyframe (opacity + translateY),
// gated behind motion-safe: so it never fires when prefers-reduced-motion is set.
const BUBBLE_RISE =
  "motion-safe:animate-[ta-sheet-pop_0.28s_cubic-bezier(0.2,0.7,0.3,1)_both]";

// ── Accent ink helper ─────────────────────────────────────────────────────────
// Pick a legible text colour for a filled accent surface by the accent's relative
// luminance. LIGHT accents (DeWalt yellow #FDB813, Ryobi lime #e0ff00) → dark ink;
// everything else (Milwaukee red, blues, greens) → white. Pure; handles #RGB and
// #RRGGBB; falls back to white on any parse failure.
function accentInk(hex: string): string {
  const fallback = "#FFFFFF";
  if (typeof hex !== "string") return fallback;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return fallback;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return fallback;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#1A1400" : fallback;
}

// ── Message grouping ──────────────────────────────────────────────────────────
// Collapse consecutive same-role messages into one visual turn (one avatar per run).
type MessageGroup = { role: UIMessage["role"]; msgs: UIMessage[] };
function groupMessages(messages: UIMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.role === msg.role) {
      last.msgs.push(msg);
    } else {
      groups.push({ role: msg.role, msgs: [msg] });
    }
  }
  return groups;
}

// ── First-run privacy disclosure notice ──────────────────────────────────────
// Shown once per device (device-level localStorage key: ta_support_chat_disclosure_ack).
// NOT a site-wide cookie banner — appears only inside the chat panel on first open.
// Acknowledgement is device-level: sign-out does NOT clear it (by design — it is a
// generic AI notice, not per-user data; see chatStorage.ts for rationale).
function DisclosureNotice({ onAcknowledge }: { onAcknowledge: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-4">
      <div className="rounded-2xl border border-[#E7D3B8] dark:border-[#463617] bg-[#F6ECDC] dark:bg-[#2C2314] p-4 text-sm text-gray-800 dark:text-gray-200 space-y-3">
        <p className="flex items-center gap-2 font-extrabold text-[#7A5A2E] dark:text-[#E7C58C]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"
            />
          </svg>
          Before you start — a quick note
        </p>
        <ul className="space-y-2 text-xs leading-relaxed list-disc list-inside marker:text-[#C9A063]">
          <li>
            You&apos;re chatting with an <strong>AI assistant</strong>, not a
            person.
          </li>
          <li>
            Messages may be processed by a third-party AI provider, possibly{" "}
            <strong>overseas</strong> — so don&apos;t share card numbers or
            passwords.
          </li>
          <li>
            Chats are stored <strong>in Australia</strong>, deleted after{" "}
            <strong>90 days</strong>; members can clear theirs anytime.
          </li>
        </ul>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Read our{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[#7A5A2E] dark:text-[#E7C58C] hover:opacity-80 transition-opacity"
          >
            privacy policy
          </a>{" "}
          for more information.
        </p>
        <button
          type="button"
          onClick={onAcknowledge}
          className="w-full mt-1 rounded-xl bg-gray-900 hover:bg-black dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white text-sm font-semibold py-2 px-4 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
        >
          Got it — start chatting
        </button>
      </div>
    </div>
  );
}

// ── Quick-reply questions (matched to FAQ deflection entries) ────────────────
const QUICK_REPLIES = [
  "When is the Major Draw?",
  "What are the membership prices?",
  "How do I get more entries?",
  "What can I win?",
  "Refund policy",
] as const;

// ── Message text extraction ───────────────────────────────────────────────────
function extractText(msg: UIMessage): string {
  if (!msg.parts) return "";
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

// Small cobber avatar disc reused for each assistant turn.
function CobberMini() {
  return (
    <div className="mt-0.5 w-7 h-7 rounded-full overflow-hidden bg-[#F1DDC2] dark:bg-[#2C2314] ring-1 ring-black/5 dark:ring-white/10 shrink-0">
      <Image
        src={COBBER_AVATAR}
        alt={COBBER_ALT}
        width={28}
        height={28}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

// ── Main widget component ─────────────────────────────────────────────────────
interface SupportChatWidgetProps {
  /**
   * Which screen corner the floating bubble + panel dock to. Default "right".
   * Set to "left" where the bottom-right corner is already taken (e.g. the
   * promotions pages, where the guest theme toggle + account FAB live there).
   */
  side?: "left" | "right";
}

export default function SupportChatWidget({ side = "right" }: SupportChatWidgetProps) {
  // Horizontal dock — same inset on either side so the bubble/panel line up.
  const sideClass = side === "left" ? "left-5" : "right-5";
  const {
    messages,
    status,
    error,
    captchaRequired,
    captchaSitekey,
    isAuthenticated,
    rateLimited,
    rateLimitMinutesLeft,
    unavailable,
    input,
    setInput,
    sendUserMessage,
    onCaptchaVerify,
    stop,
    clearError,
    resetConversation,
  } = useSupportChat();

  // Adaptive accent — reads the current promo theme (defaults to Milwaukee = TA red
  // off a prize page). Exposed to the tree as CSS custom properties so both the
  // launcher and the panel colour themselves from one source.
  const theme = usePromoTheme();
  const accent = theme.primary;
  const accentDeep = theme.primaryDark;
  const accentVars = {
    ["--cob-acc" as string]: accent,
    ["--cob-acc-deep" as string]: accentDeep,
    ["--cob-acc-ink" as string]: accentInk(accent),
  } as React.CSSProperties;

  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Increment to force-reset the HCaptcha widget after a successful verification
  const [captchaKey, setCaptchaKey] = useState(0);
  const [deleteState, setDeleteState] = useState<"idle" | "confirming" | "deleting">("idle");
  // First-run disclosure: initialise lazily from localStorage (device-level key).
  // `null` means "not yet checked" (SSR-safe); checked on first panel open.
  const [disclosureAcked, setDisclosureAcked] = useState<boolean | null>(null);

  const pathname = usePathname();
  // On /my-account the dashboard "Ask Cobber" card is the canonical Cobber entry
  // point, so the floating bubble is suppressed there (no duplicate affordance).
  const onDashboard = pathname?.startsWith("/my-account") ?? false;
  // Dashboard overlay sheets (Support / Payment / Manage) portal to <body> BELOW
  // this widget's z-index; hide the panel while one is open so Cobber never floats
  // over it. ("Start a chat" closes the Support sheet before opening the panel, so
  // this mainly guards the panel against a later-opened sheet.)
  const dashboardSheetOpen = useDashboardSheetStore((s) => s.sheet !== null);

  // Open the panel when any surface dispatches the shared open-chat event (e.g. the
  // dashboard "Ask Cobber" card). Mirrors the site's openMembershipModal contract.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_SUPPORT_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_SUPPORT_CHAT_EVENT, handler);
  }, []);

  // Collision-aware placement: lift the floating bubble above any other bottom-anchored
  // floating element (draw countdown banner, "get entries" bar, upsell gift) that would
  // overlap its corner. Only while the bubble is actually shown AND closed — an open
  // panel (z-9000) already covers those obstacles (z ≤ 50), so no lift is needed then.
  const dodgeBottom = useDodgeFloatingObstacles(side, !onDashboard && !open);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, captchaRequired]);

  // Focus input when panel opens; also check the device-level disclosure ack on first open.
  useEffect(() => {
    if (open) {
      setHasOpened(true);
      // Check localStorage once (client-only; hasAcknowledgedDisclosure() is SSR-safe).
      if (disclosureAcked === null) {
        setDisclosureAcked(hasAcknowledgedDisclosure());
      }
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || status === "submitted" || status === "streaming") return;
    await sendUserMessage(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleQuickReply = (text: string) => {
    if (status === "submitted" || status === "streaming") return;
    void sendUserMessage(text);
  };

  // ── First-run disclosure acknowledgement ─────────────────────────────────
  const handleAcknowledge = useCallback(() => {
    acknowledgeDisclosure();
    setDisclosureAcked(true);
    // Focus the input after acknowledging
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ── Delete my chat history (authenticated members only) ──────────────────
  const handleDeleteHistory = useCallback(async () => {
    if (deleteState === "confirming") {
      setDeleteState("deleting");
      try {
        const res = await fetch("/api/chat/history", { method: "DELETE" });
        if (!res.ok) {
          console.error("[SupportChatWidget] delete history failed", res.status);
        } else {
          resetConversation();
        }
      } catch (err) {
        console.error("[SupportChatWidget] delete history error", err);
      } finally {
        setDeleteState("idle");
      }
    } else {
      setDeleteState("confirming");
    }
  }, [deleteState, resetConversation]);

  const isStreaming = status === "submitted" || status === "streaming";
  const showIntro = hasOpened && messages.length === 0;
  const isRateLimited = rateLimited !== null;
  // Block free-text input while a pending captcha, a rate-limit, or an
  // unavailable state is showing — typing a new message would silently abandon
  // the captcha turn / send into a wall.
  const inputBlocked = isRateLimited || captchaRequired || unavailable;

  return (
    <>
      {/* Floating bubble — suppressed on /my-account, where the dashboard
          "Ask Cobber" card is the canonical entry point (no duplicate affordance). */}
      {!onDashboard && (
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open AI support chat"}
        className={`fixed bottom-5 ${sideClass} w-14 h-14 rounded-full text-[var(--cob-acc-ink)] shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[var(--cob-acc)] focus:ring-offset-2`}
        style={{
          zIndex: Z_INDEX.MODAL_BASE - 1000,
          background: "linear-gradient(180deg, var(--cob-acc), var(--cob-acc-deep))",
          ...accentVars,
          // Lift above a colliding bottom floater (0 = keep the default bottom-5).
          // `transition-all` animates the move, so it slides rather than jumps.
          ...(dodgeBottom > 0 ? { bottom: `${dodgeBottom}px` } : {}),
        }}
      >
        {open ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <div className="w-full h-full rounded-full overflow-hidden ring-2 ring-white/30">
            <Image
              src={COBBER_AVATAR}
              alt={COBBER_ALT}
              width={56}
              height={56}
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </button>
      )}

      {/* Panel — hidden while a dashboard overlay sheet is open so Cobber never
          floats over it (see dashboardSheetOpen). */}
      {open && !dashboardSheetOpen && (
        <div
          className={`fixed bottom-24 ${sideClass} w-[22rem] max-w-[calc(100vw-2.5rem)] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl flex flex-col border border-gray-200 dark:border-neutral-700 overflow-hidden`}
          style={{
            zIndex: Z_INDEX.MODAL_BASE - 1000,
            height: "min(560px, calc(100svh - 8rem))",
            ...accentVars,
          }}
        >
          {/* Header — slim accent band, cobber in a light disc, green Online pill */}
          <div
            className="relative flex items-center gap-2.5 px-3.5 py-2.5 text-[var(--cob-acc-ink)] shrink-0"
            style={{ background: "linear-gradient(180deg, var(--cob-acc), var(--cob-acc-deep))" }}
          >
            <div className="w-9 h-9 rounded-full overflow-hidden bg-[#F1DDC2] ring-2 ring-white/40 shrink-0">
              <Image
                src={COBBER_AVATAR}
                alt={COBBER_ALT}
                width={36}
                height={36}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-extrabold text-[15px] leading-tight">Cobber</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Online
                </span>
              </div>
              <p className="text-[11px] opacity-90 leading-tight">
                AI support mate · Tools Australia
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition-colors shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            {/* 2px hazard stripe under the header band */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 opacity-50"
              style={{
                background:
                  "repeating-linear-gradient(45deg, rgba(0,0,0,.22) 0 8px, rgba(255,255,255,.18) 8px 16px)",
              }}
            />
          </div>

          {/* First-run privacy disclosure notice (shown before anything else, once per device) */}
          {disclosureAcked === false && (
            <DisclosureNotice onAcknowledge={handleAcknowledge} />
          )}

          {/* Messages — hidden until disclosure is acknowledged */}
          <div className={`flex-1 overflow-y-auto px-3.5 py-4 flex flex-col gap-4 ${disclosureAcked === false ? "hidden" : ""}`}>
            {/* Welcome / empty state — one block: big cobber, greeting, quick-reply chips */}
            {showIntro && !captchaRequired && (
              <div className="flex flex-col items-center text-center px-2 pt-3 pb-1">
                <div className="w-[76px] h-[76px] rounded-full overflow-hidden bg-[#F1DDC2] dark:bg-[#2C2314] ring-4 ring-[#F6ECDC] dark:ring-[#2C2314] shadow-sm mb-3">
                  <Image
                    src={COBBER_AVATAR}
                    alt={COBBER_ALT}
                    width={76}
                    height={76}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-gray-100">
                  G&apos;day, I&apos;m{" "}
                  <span className="text-[var(--cob-acc)]">Cobber</span>
                </h3>
                <p className="mt-1 max-w-[32ch] text-[13.5px] text-gray-500 dark:text-gray-400">
                  Your Tools Australia support mate. I can help with memberships,
                  draws, entries and more. For complex issues I&apos;ll connect
                  you to our team, who reply within one business day.
                </p>
                <p className="mt-4 mb-2 text-xs text-gray-500 dark:text-gray-400">
                  Pick a question to get started
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {QUICK_REPLIES.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleQuickReply(q)}
                      disabled={isStreaming}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--cob-acc)] bg-[color-mix(in_srgb,var(--cob-acc)_12%,transparent)] text-[var(--cob-acc)] hover:bg-[var(--cob-acc)] hover:text-[var(--cob-acc-ink)] transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Grouped conversation — one avatar per run of same-role messages */}
            {groupMessages(messages).map((group, gi) => {
              const isUser = group.role === "user";
              const rendered = group.msgs
                .map((m) => ({ id: m.id, text: extractText(m) }))
                .filter((m) => m.text);
              if (rendered.length === 0) return null;
              return (
                <div
                  key={group.msgs[0]?.id ?? gi}
                  className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}
                >
                  {!isUser && <CobberMini />}
                  <div
                    className={`flex flex-col gap-1 min-w-0 max-w-[82%] ${isUser ? "items-end" : "items-start"}`}
                  >
                    {rendered.map((m) =>
                      isUser ? (
                        <div
                          key={m.id}
                          className={`w-fit max-w-full rounded-2xl first:rounded-tr-sm px-3 py-2 text-sm leading-relaxed text-[var(--cob-acc-ink)] shadow-sm ${BUBBLE_RISE}`}
                          style={{
                            background:
                              "linear-gradient(180deg, var(--cob-acc), var(--cob-acc-deep))",
                          }}
                        >
                          {m.text}
                        </div>
                      ) : (
                        <div
                          key={m.id}
                          className={`w-fit max-w-full rounded-2xl first:rounded-tl-sm px-3 py-2 text-sm leading-relaxed bg-[#FBF6F0] dark:bg-[#2A211A] text-gray-900 dark:text-gray-100 border border-[#E7DCD1] dark:border-[#372B21] shadow-sm [&_a]:text-[var(--cob-acc)] ${BUBBLE_RISE}`}
                        >
                          <ChatMarkdown>{m.text}</ChatMarkdown>
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {isStreaming && (
              <div className="flex items-start gap-2">
                <CobberMini />
                <div className="bg-[#FBF6F0] dark:bg-[#2A211A] border border-[#E7DCD1] dark:border-[#372B21] rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm">
                  <div className="flex gap-1 items-center h-4">
                    <span
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Generic error — hidden when a specific gate notice (captcha / rate-limit
                / unavailable) is showing, so the user never sees a stacked
                "something went wrong" over the actionable message. Red = hard error. */}
            {error && !captchaRequired && !isRateLimited && !unavailable && (
              <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2.5 text-xs">
                <p className="font-bold text-red-700 dark:text-red-300 mb-0.5">
                  That didn&apos;t go through
                </p>
                <span className="text-gray-700 dark:text-gray-200">
                  Something went wrong.{" "}
                </span>
                <button
                  onClick={clearError}
                  className="underline font-semibold text-red-700 dark:text-red-300"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Service-unavailable notice (kill-switch / daily budget → 503). Amber. */}
            {unavailable && !captchaRequired && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-3 text-xs">
                <p className="font-bold text-amber-700 dark:text-amber-300 mb-1">
                  Cobber&apos;s taking a short break
                </p>
                <p className="text-gray-700 dark:text-gray-200">
                  Our assistant is temporarily unavailable. Please try again shortly,
                  or{" "}
                  <a
                    href="/contact"
                    className="underline font-semibold text-amber-700 dark:text-amber-300"
                  >
                    leave us a message
                  </a>{" "}
                  and our team will help.
                </p>
              </div>
            )}

            {/* Generative rate-limit notice — quick-replies still work (FAQ deflection is free). Amber. */}
            {isRateLimited && !captchaRequired && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-3 text-xs">
                <p className="font-bold text-amber-700 dark:text-amber-300 mb-1">
                  You&apos;ve reached the chat limit for now
                  {rateLimitMinutesLeft !== null ? ` (resets in ~${rateLimitMinutesLeft} min)` : ""}.
                </p>
                <p className="text-gray-700 dark:text-gray-200">
                  Meanwhile, tap a question below for an instant answer:
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {QUICK_REPLIES.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleQuickReply(q)}
                      disabled={isStreaming}
                      className="text-xs px-2.5 py-1 rounded-full border border-amber-400 dark:border-amber-600 text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/40 transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* hCaptcha gate. Amber. */}
            {captchaRequired && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-3 text-xs">
                {/* Defense-in-depth: never render the captcha for a member. The
                    server never 401s an authenticated session, so this branch only
                    fires for anonymous guests — but the !isAuthenticated guard means
                    a member never sees a captcha even if the state machine misfires. */}
                {captchaSitekey && !isAuthenticated ? (
                  <>
                    <p className="mb-2 font-bold text-amber-700 dark:text-amber-300">
                      Quick verification needed
                    </p>
                    <HCaptcha
                      key={captchaKey}
                      sitekey={captchaSitekey}
                      size="compact"
                      onVerify={(token) => {
                        setCaptchaKey((k) => k + 1);
                        onCaptchaVerify(token);
                      }}
                      // hCaptcha tokens expire (~2 min) and the widget can error
                      // (network/script). Remount a FRESH challenge so the user is
                      // never left staring at a dead/expired box.
                      onExpire={() => setCaptchaKey((k) => k + 1)}
                      onChalExpired={() => setCaptchaKey((k) => k + 1)}
                      onError={() => setCaptchaKey((k) => k + 1)}
                    />
                    <p className="mt-1.5 text-gray-700 dark:text-gray-200">
                      Or{" "}
                      <a
                        href="/login"
                        className="underline font-semibold text-amber-700 dark:text-amber-300"
                      >
                        sign in
                      </a>{" "}
                      for a faster experience.
                    </p>
                  </>
                ) : (
                  <p className="text-gray-700 dark:text-gray-200">
                    Please{" "}
                    <a
                      href="/login"
                      className="underline font-semibold text-amber-700 dark:text-amber-300"
                    >
                      sign in
                    </a>{" "}
                    to continue chatting.
                  </p>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area — hidden until disclosure acknowledged */}
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className={`px-3.5 pb-3 pt-2.5 shrink-0 border-t border-gray-100 dark:border-neutral-800 ${disclosureAcked === false ? "hidden" : ""}`}
          >
            {/* Persistent PII micro-hint — always visible above the input */}
            <p className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500 mb-1.5 leading-snug">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-3 h-3 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              Don&apos;t share card numbers, passwords, or other sensitive
              details.
            </p>
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  captchaRequired
                    ? "Complete the check above to continue…"
                    : unavailable
                    ? "Cobber's unavailable right now…"
                    : isRateLimited
                    ? "Tap a quick question above to continue…"
                    : "Type a message…"
                }
                disabled={inputBlocked}
                rows={1}
                className={`flex-1 resize-none text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--cob-acc)] max-h-24 overflow-auto${inputBlocked ? " opacity-50 cursor-not-allowed" : ""}`}
                style={{ lineHeight: "1.5" }}
              />
              {/* Stop button — shown while streaming (dark) */}
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop generating"
                  className="shrink-0 w-9 h-9 rounded-xl bg-gray-900 hover:bg-black text-white flex items-center justify-center transition-transform active:scale-95"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                </button>
              ) : (
                /* Send button — accent fill, springy press */
                <button
                  type="submit"
                  disabled={!input.trim() || inputBlocked}
                  aria-label="Send message"
                  className="shrink-0 w-9 h-9 rounded-xl text-[var(--cob-acc-ink)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-transform active:scale-95"
                  style={{
                    background:
                      "linear-gradient(180deg, var(--cob-acc), var(--cob-acc-deep))",
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </button>
              )}
            </div>
          </form>

          {/* Delete history — authenticated members only, after disclosure acked */}
          {isAuthenticated && disclosureAcked !== false && (
            <div className="px-3.5 pb-2 shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => void handleDeleteHistory()}
                disabled={deleteState === "deleting" || isStreaming}
                className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {deleteState === "confirming"
                  ? "Tap again to confirm delete"
                  : deleteState === "deleting"
                  ? "Deleting…"
                  : "Delete my chat history"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
