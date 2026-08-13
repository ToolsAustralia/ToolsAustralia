"use client";

/**
 * SupportChatWidget.tsx
 *
 * Slide-up PANEL for the AI support assistant ("Cobber") — the heavy half of the widget
 * (react-markdown + AI SDK + hCaptcha). It is LAZY: `SupportChatWidgetMount` renders the
 * eager launcher (ChatBubbleButton) and only `next/dynamic`-imports THIS panel on the
 * first open. The panel therefore owns no launcher of its own — it receives `open` /
 * `onClose` props from the mount and renders the panel when `open` is true.
 *
 * Design decisions:
 * - z-index 9000: below Z_INDEX.MODAL_BASE (10000) so upsell/renewal/gate modals always win.
 * - Open state + open paths (the bubble click, and OPEN_SUPPORT_CHAT_EVENT from the
 *   dashboard "Ask Cobber" card) live in the mount; the launcher is suppressed on
 *   /my-account so the card is the canonical entry there. The panel is closed by its own
 *   header ✕ (onClose).
 * - The panel hides while a dashboard overlay sheet (Support/Payment/Manage — SheetShell
 *   portaled to <body> at z-[9500]) is open, so Cobber never floats over it. That z was raised
 *   from 120 on 2026-08-12: the launcher sits at MODAL_BASE - 1000 = 9000, so at 120 a SheetShell
 *   on a PUBLIC route (where the launcher is not suppressed) rendered under the robot.
 * - Labelled "AI support mate" in the header AND the welcome block.
 * - 4-6 quick-reply buttons shown before the text input (no LLM cost on deflection).
 * - hCaptcha rendered when the server returns captcha_required (anonymous guests only).
 * - If NEXT_PUBLIC_HCAPTCHA_SITEKEY is unset: show "sign in to chat" hint instead.
 * - Members (isAuthenticated) never see the captcha UI.
 * - Uses useSupportChat() for all state/streaming logic.
 * - Pure UI: no DB, no business logic, no direct model calls. Talks only to /api/chat.
 *
 * Adaptive brand accent ("Workshop v2"):
 * - The header band, YOUR message bubbles, the send button, quick-reply chips and the
 *   "Cobber" name highlight are all driven by usePromoTheme() (via useCobberAccentVars) —
 *   which DEFAULTS to Milwaukee (Tools Australia red) off a prize page, so non-promo
 *   surfaces get red automatically. Applied as CSS custom properties (--cob-acc /
 *   --cob-acc-deep / --cob-acc-ink) on the panel root, consumed via Tailwind arbitrary
 *   values. The eager launcher (ChatBubbleButton) themes itself from the same module.
 * - Semantics stay FIXED regardless of accent: online dot = green, notices = amber,
 *   hard error = red.
 */

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import type { UIMessage } from "ai";
import { Z_INDEX } from "@/constants/z-index";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { useSupportChat } from "./useSupportChat";
import {
  hasAcknowledgedDisclosure,
  acknowledgeDisclosure,
} from "@/lib/support-chat/chatStorage";
import ChatMarkdown from "./ChatMarkdown";
import { useCobberAccentVars, COBBER_AVATAR, COBBER_ALT } from "./cobberAccent";

const HCaptcha = dynamic(() => import("@hcaptcha/react-hcaptcha"), {
  ssr: false,
});

// Subtle bubble entry — reuse the existing globals.css keyframe (opacity + translateY),
// gated behind motion-safe: so it never fires when prefers-reduced-motion is set.
const BUBBLE_RISE =
  "motion-safe:animate-[ta-sheet-pop_0.28s_cubic-bezier(0.2,0.7,0.3,1)_both]";

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
      <div className="rounded-2xl border border-white/[0.09] bg-[#1b1f26] p-4 text-sm text-[#c3c9d1] space-y-3">
        <p className="flex items-center gap-2 font-extrabold text-[#E7C58C]">
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
        </ul>
        <p className="text-xs text-[#8a9099]">
          Read our{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[#E7C58C] hover:opacity-80 transition-opacity"
          >
            privacy policy
          </a>{" "}
          for more information.
        </p>
        <button
          type="button"
          onClick={onAcknowledge}
          className="w-full mt-1 rounded-xl bg-white text-gray-900 hover:bg-gray-100 text-sm font-semibold py-2.5 px-4 transition-colors focus:outline-none focus:ring-2 focus:ring-white/60"
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
    <div className="mt-0.5 w-7 h-7 rounded-full overflow-hidden bg-[#F1DDC2] ring-1 ring-white/10 shrink-0">
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

// ── Main panel component ──────────────────────────────────────────────────────
interface SupportChatWidgetProps {
  /**
   * Which screen corner the panel docks to. Default "right". Set to "left" where the
   * bottom-right corner is already taken (e.g. the promotions pages, where the guest
   * theme toggle + account FAB live there). Must match the launcher's `side`.
   */
  side?: "left" | "right";
  /** Whether the panel is open. Owned by SupportChatWidgetMount (eager). */
  open: boolean;
  /** Close the panel (header ✕). Owned by SupportChatWidgetMount. */
  onClose: () => void;
}

export default function SupportChatWidget({ side = "right", open, onClose }: SupportChatWidgetProps) {
  // Horizontal dock — same inset on either side so the panel lines up with the launcher.
  // Corner dock applies from `lg` only — below that the panel is a full-bleed sheet (see the
  // panel's className), so a horizontal inset there would fight the `inset-x-0`. BOTH sides are
  // written literally (and the opposite one reset to `auto`) because Tailwind's JIT scans source
  // text: a class assembled from an expression is never generated.
  const sideClass =
    side === "left" ? "lg:left-5 lg:right-auto" : "lg:right-5 lg:left-auto";
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

  // Adaptive accent — CSS custom properties applied to the panel root; descendants
  // consume them via Tailwind arbitrary values. Same source the eager launcher themes
  // itself from (see cobberAccent.ts).
  const accentVars = useCobberAccentVars();

  const [hasOpened, setHasOpened] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Increment to force-reset the HCaptcha widget after a successful verification
  const [captchaKey, setCaptchaKey] = useState(0);
  const [deleteState, setDeleteState] = useState<"idle" | "confirming" | "deleting">("idle");
  // First-run disclosure: initialise lazily from localStorage (device-level key).
  // `null` means "not yet checked" (SSR-safe); checked on first panel open.
  const [disclosureAcked, setDisclosureAcked] = useState<boolean | null>(null);

  // Dashboard overlay sheets (Support / Payment / Manage) portal to <body> BELOW
  // this widget's z-index; hide the panel while one is open so Cobber never floats
  // over it. ("Start a chat" closes the Support sheet before opening the panel, so
  // this mainly guards the panel against a later-opened sheet.)
  const dashboardSheetOpen = useDashboardSheetStore((s) => s.sheet !== null);

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
      {/* Panel — hidden while a dashboard overlay sheet is open so Cobber never floats
          over it (see dashboardSheetOpen). The eager launcher lives in the mount
          (ChatBubbleButton); this lazy component renders the panel only. */}
      {open && !dashboardSheetOpen && (
        <div
          // Dark in BOTH site themes (design handoff, 2026-08-13). Cobber sits over prize
          // photography and dark page chrome far more often than not, and the old
          // white/neutral-900 fork made it read as a different product depending on where you
          // opened it. The accent band, avatar and hazard stripe already assumed a dark ground.
          // Below `lg` the panel is a FULL-BLEED sheet sitting on the bottom dock: a 22rem card
          // floating in a phone viewport wasted the horizontal space the conversation needed,
          // and read as a widget parked over the page rather than a surface the page handed you.
          // It keeps its rounded TOP corners and drops the side/bottom borders so it reads as
          // rising out of the bar. From `lg` it is the corner-docked card it has always been.
          className={`fixed bottom-24 inset-x-0 w-auto rounded-t-2xl rounded-b-none border-x-0 border-b-0 ${sideClass} lg:w-[22rem] lg:max-w-[calc(100vw-2.5rem)] lg:rounded-2xl lg:border-x lg:border-b bg-[#111318] shadow-2xl flex flex-col border border-white/10 overflow-hidden`}
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
              onClick={onClose}
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
              /* The greeting arrives as Cobber's FIRST MESSAGE (design handoff), not as a
                 centred splash. It is the same shape every later reply takes, so the panel
                 opens already looking like a conversation rather than a landing page — and
                 the quick replies below read as answers to it. */
              <div className="flex flex-col">
                <div className="flex items-start gap-2.5">
                  <div className="h-[30px] w-[30px] shrink-0 overflow-hidden rounded-full bg-[#F1DDC2] ring-1 ring-white/10">
                    <Image
                      src={COBBER_AVATAR}
                      alt={COBBER_ALT}
                      width={30}
                      height={30}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="rounded-[14px] rounded-bl-[4px] border border-white/[0.07] bg-[#1b1f26] px-3.5 py-3">
                      <h3 className="text-sm font-extrabold text-white">
                        G&apos;day, I&apos;m <span className="text-[var(--cob-acc)]">Cobber</span>
                      </h3>
                      <p className="mt-1.5 text-xs leading-[1.55] text-[#c3c9d1]">
                        Your Tools Australia support mate. I can help with memberships, draws,
                        entries and more. For complex issues I&apos;ll connect you to our team,
                        who reply within one business day.
                      </p>
                    </div>
                    <p className="mt-1 font-mono text-[9px] text-[#5d646e]">Just now</p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#8a9099]">
                      Pick a question to get started
                    </span>
                    <span className="h-px flex-1 bg-white/[0.08]" />
                  </div>
                  {/* Full-width rows, not wrapped pills: five questions in a 22rem panel
                      wrapped into a ragged block nobody scanned. */}
                  <div className="flex flex-col gap-1.5">
                    {QUICK_REPLIES.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleQuickReply(q)}
                        disabled={isStreaming}
                        className="flex items-center justify-between gap-2.5 rounded-[11px] border border-[color-mix(in_srgb,var(--cob-acc)_45%,transparent)] bg-[color-mix(in_srgb,var(--cob-acc)_10%,transparent)] px-3.5 py-2.5 text-left text-[11.5px] font-semibold leading-snug text-white/90 transition-colors hover:bg-[color-mix(in_srgb,var(--cob-acc)_18%,transparent)] disabled:opacity-50"
                        // Inline, not a Tailwind arbitrary value: the label wants the ACCENT
                        // tinted toward white (the handoff's #ffb3aa, but per-brand), and the
                        // `text-white/90` class is the fallback if `color-mix` is unsupported.
                        style={{ color: "color-mix(in srgb, var(--cob-acc) 30%, #ffffff)" }}
                      >
                        <span>{q}</span>
                        <span aria-hidden className="font-extrabold text-[var(--cob-acc)]">
                          ›
                        </span>
                      </button>
                    ))}
                  </div>
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
                          data-cs-mask
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
                          className={`w-fit max-w-full rounded-2xl first:rounded-tl-sm px-3 py-2 text-sm leading-relaxed bg-[#1b1f26] text-[#e6e9ee] border border-white/[0.07] shadow-sm [&_a]:text-[var(--cob-acc)] ${BUBBLE_RISE}`}
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
                <div className="bg-[#1b1f26] border border-white/[0.07] rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm">
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
              <div className="rounded-xl border border-red-800 bg-red-950/40 px-3 py-2.5 text-xs">
                <p className="font-bold text-red-300 mb-0.5">
                  That didn&apos;t go through
                </p>
                <span className="text-gray-200">
                  Something went wrong.{" "}
                </span>
                <button
                  onClick={clearError}
                  className="underline font-semibold text-red-300"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Service-unavailable notice (kill-switch / daily budget → 503). Amber. */}
            {unavailable && !captchaRequired && (
              <div className="rounded-xl border border-amber-800 bg-amber-950/40 px-3 py-3 text-xs">
                <p className="font-bold text-amber-300 mb-1">
                  Cobber&apos;s taking a short break
                </p>
                <p className="text-gray-200">
                  Our assistant is temporarily unavailable. Please try again shortly,
                  or{" "}
                  <a
                    href="/contact"
                    className="underline font-semibold text-amber-300"
                  >
                    leave us a message
                  </a>{" "}
                  and our team will help.
                </p>
              </div>
            )}

            {/* Generative rate-limit notice — quick-replies still work (FAQ deflection is free). Amber. */}
            {isRateLimited && !captchaRequired && (
              <div className="rounded-xl border border-amber-800 bg-amber-950/40 px-3 py-3 text-xs">
                <p className="font-bold text-amber-300 mb-1">
                  You&apos;ve reached the chat limit for now
                  {rateLimitMinutesLeft !== null ? ` (resets in ~${rateLimitMinutesLeft} min)` : ""}.
                </p>
                <p className="text-gray-200">
                  Meanwhile, tap a question below for an instant answer:
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {QUICK_REPLIES.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleQuickReply(q)}
                      disabled={isStreaming}
                      className="text-xs px-2.5 py-1 rounded-full border border-amber-600 text-amber-200 bg-amber-900/40 hover:bg-amber-800/40 transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* hCaptcha gate. Amber. */}
            {captchaRequired && (
              <div className="rounded-xl border border-amber-800 bg-amber-950/40 px-3 py-3 text-xs">
                {/* Defense-in-depth: never render the captcha for a member. The
                    server never 401s an authenticated session, so this branch only
                    fires for anonymous guests — but the !isAuthenticated guard means
                    a member never sees a captcha even if the state machine misfires. */}
                {captchaSitekey && !isAuthenticated ? (
                  <>
                    <p className="mb-2 font-bold text-amber-300">
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
                    <p className="mt-1.5 text-gray-200">
                      Or{" "}
                      <a
                        href="/login"
                        className="underline font-semibold text-amber-300"
                      >
                        sign in
                      </a>{" "}
                      for a faster experience.
                    </p>
                  </>
                ) : (
                  <p className="text-gray-200">
                    Please{" "}
                    <a
                      href="/login"
                      className="underline font-semibold text-amber-300"
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
            className={`px-3.5 pb-3 pt-2.5 shrink-0 border-t border-white/[0.09] ${disclosureAcked === false ? "hidden" : ""}`}
          >
            {/* Persistent PII micro-hint — always visible above the input */}
            <p className="flex items-center gap-1.5 text-[10px] text-[#6b7280] mb-1.5 leading-snug">
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
                data-cs-mask
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
                className={`flex-1 resize-none text-sm bg-white/[0.05] border border-white/[0.12] rounded-full px-4 py-2.5 text-white placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[var(--cob-acc)] max-h-24 overflow-auto${inputBlocked ? " opacity-50 cursor-not-allowed" : ""}`}
                style={{ lineHeight: "1.5" }}
              />
              {/* Stop button — shown while streaming (dark) */}
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop generating"
                  className="shrink-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-95"
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
                  className="shrink-0 w-10 h-10 rounded-full text-[var(--cob-acc-ink)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-transform active:scale-95"
                  style={{
                    background:
                      "linear-gradient(180deg, var(--cob-acc), var(--cob-acc-deep))",
                    boxShadow: "0 4px 14px color-mix(in srgb, var(--cob-acc) 40%, transparent)",
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
                className="text-[11px] text-[#6b7280] hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
