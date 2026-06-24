"use client";

/**
 * SupportChatWidget.tsx
 *
 * Floating chat bubble + slide-up panel for the AI support assistant.
 *
 * Design decisions:
 * - z-index 9000: below Z_INDEX.MODAL_BASE (10000) so upsell/renewal/gate modals always win.
 * - Labelled "AI Support Assistant" in the header AND the intro message.
 * - 4-6 quick-reply buttons shown before the text input (no LLM cost on deflection).
 * - hCaptcha rendered when the server returns captcha_required (anonymous guests only).
 * - If NEXT_PUBLIC_HCAPTCHA_SITEKEY is unset: show "sign in to chat" hint instead.
 * - Members (isAuthenticated) never see the captcha UI.
 * - Uses useSupportChat() for all state/streaming logic.
 * - Pure UI: no DB, no business logic, no direct model calls. Talks only to /api/chat.
 */

import React, {
  useRef,
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import dynamic from "next/dynamic";
import type { UIMessage } from "ai";
import { useSupportChat } from "./useSupportChat";

const HCaptcha = dynamic(() => import("@hcaptcha/react-hcaptcha"), {
  ssr: false,
});

// ── Quick-reply questions (matched to FAQ deflection entries) ────────────────
const QUICK_REPLIES = [
  "When is the Major Draw?",
  "What are the membership prices?",
  "How do I get more entries?",
  "What can I win?",
  "Refund policy",
] as const;

// ── Message bubble ───────────────────────────────────────────────────────────
function extractText(msg: UIMessage): string {
  if (!msg.parts) return "";
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function MessageBubble({ msg }: { msg: UIMessage }) {
  const text = extractText(msg);
  if (!text) return null;
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-orange-500 text-white rounded-br-sm"
            : "bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-neutral-700 rounded-bl-sm"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

// ── Main widget component ─────────────────────────────────────────────────────
export default function SupportChatWidget() {
  const {
    messages,
    status,
    error,
    captchaRequired,
    captchaSitekey,
    isAuthenticated,
    input,
    setInput,
    sendUserMessage,
    onCaptchaVerify,
    stop,
    clearError,
  } = useSupportChat();

  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Increment to force-reset the HCaptcha widget after a successful verification
  const [captchaKey, setCaptchaKey] = useState(0);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, captchaRequired]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setHasOpened(true);
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
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

  const isStreaming = status === "submitted" || status === "streaming";
  const showIntro = hasOpened && messages.length === 0;

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open AI support chat"}
        className="fixed bottom-5 right-5 w-14 h-14 rounded-full bg-orange-500 hover:bg-orange-600 text-white shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2"
        style={{ zIndex: 9000 }}
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
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-5 w-[22rem] max-w-[calc(100vw-2.5rem)] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl flex flex-col border border-gray-200 dark:border-neutral-700 overflow-hidden"
          style={{ zIndex: 9000, height: "min(560px, calc(100svh - 8rem))" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-orange-500 text-white shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold select-none">
              AI
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">
                AI Support Assistant
              </p>
              <p className="text-xs text-orange-100 leading-tight">
                Tools Australia
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="p-1 rounded-full hover:bg-white/20 transition-colors"
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
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            {/* Intro / AI disclosure */}
            {showIntro && (
              <div className="flex justify-start mb-2">
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-neutral-700">
                  <p className="font-semibold text-orange-600 dark:text-orange-400 mb-1">
                    AI Support Assistant
                  </p>
                  <p>
                    Hi! I&apos;m an AI assistant for Tools Australia. I can
                    help with draw dates, membership, entries, and more.
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                    For complex issues I&apos;ll connect you to our team, who
                    reply within one business day.
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {isStreaming && (
              <div className="flex justify-start mb-2">
                <div className="bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-2xl rounded-bl-sm px-3 py-2">
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

            {error && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-3 py-2 text-xs">
                <span>Something went wrong. </span>
                <button onClick={clearError} className="underline">
                  Try again
                </button>
              </div>
            )}

            {/* hCaptcha gate */}
            {captchaRequired && (
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-3 text-xs text-amber-800 dark:text-amber-200">
                {/* Defense-in-depth: never render the captcha for a member. The
                    server never 401s an authenticated session, so this branch only
                    fires for anonymous guests — but the !isAuthenticated guard means
                    a member never sees a captcha even if the state machine misfires. */}
                {captchaSitekey && !isAuthenticated ? (
                  <>
                    <p className="mb-2 font-medium">Quick verification needed</p>
                    <HCaptcha
                      key={captchaKey}
                      sitekey={captchaSitekey}
                      size="compact"
                      onVerify={(token) => {
                        setCaptchaKey((k) => k + 1);
                        onCaptchaVerify(token);
                      }}
                    />
                    <p className="mt-1.5 text-amber-600 dark:text-amber-400">
                      Or{" "}
                      <a href="/login" className="underline">
                        sign in
                      </a>{" "}
                      for a faster experience.
                    </p>
                  </>
                ) : (
                  <p>
                    Please{" "}
                    <a href="/login" className="underline font-medium">
                      sign in
                    </a>{" "}
                    to continue chatting.
                  </p>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick replies — shown only before any messages */}
          {messages.length === 0 && !captchaRequired && (
            <div className="px-3 pb-2 shrink-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                Quick questions:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleQuickReply(q)}
                    disabled={isStreaming}
                    className="text-xs px-2.5 py-1 rounded-full border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="px-3 pb-3 pt-2 shrink-0 border-t border-gray-100 dark:border-neutral-800"
          >
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                rows={1}
                className="flex-1 resize-none text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:focus:ring-orange-500 max-h-24 overflow-auto"
                style={{ lineHeight: "1.5" }}
              />
              {/* Stop button — shown while streaming */}
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop generating"
                  className="shrink-0 w-9 h-9 rounded-xl bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-colors"
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
                /* Send button */
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send message"
                  className="shrink-0 w-9 h-9 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
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
        </div>
      )}
    </>
  );
}
