"use client";

/**
 * useSupportChat.ts
 *
 * Client hook that wraps the AI SDK v6 useChat, adding:
 *   - conversationId threading (localStorage-persisted, x-conversation-id header)
 *   - hCaptcha gate handling for anonymous guest generative turns (401 captcha_required)
 *   - isAuthenticated awareness (members skip captcha entirely)
 *
 * The hook uses DefaultChatTransport with a custom fetch wrapper so it can read the
 * x-conversation-id response header without disrupting the SSE stream.
 *
 * hCaptcha approach:
 *   When the server returns 401 { code: 'captcha_required' }, the hook sets
 *   captchaRequired=true. The widget renders <HCaptcha>. On verify, the hook
 *   re-sends the pending message with the hcaptchaToken in the body. Once the
 *   conversation is verified server-side, later turns in the same conversationId
 *   are not re-challenged (the server checks humanVerifiedAt).
 *
 *   If NEXT_PUBLIC_HCAPTCHA_SITEKEY is unset, captchaSitekey is an empty string
 *   and the widget shows a "sign in to chat" hint instead of a broken captcha widget.
 */

import { useCallback, useRef, useState, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useUserContext } from "@/contexts/UserContext";
import { CHAT_STORAGE_KEYS, clearSupportChatStorage } from "@/lib/support-chat/chatStorage";

export interface RateLimitedState {
  /** How many seconds until the per-user LLM cap resets (from the 429 response). */
  retryAfterSeconds: number;
}

export interface SupportChatState {
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  error: Error | undefined;
  captchaRequired: boolean;
  captchaSitekey: string;
  isAuthenticated: boolean;
  /** Set when the server returns 429 rate_limited. Quick-reply FAQ answers still work. */
  rateLimited: RateLimitedState | null;
  /** Minutes (rounded up) until the per-user LLM cap resets. null when not rate-limited. */
  rateLimitMinutesLeft: number | null;
  /** Clears the rateLimited state (e.g. when the widget receives a successful non-429 response). */
  clearRateLimit: () => void;
  input: string;
  setInput: (v: string) => void;
  sendUserMessage: (text: string) => Promise<void>;
  onCaptchaVerify: (token: string) => void;
  stop: () => void;
  clearError: () => void;
  /** Clears the local message list and conversationId (call after server-side history delete). */
  resetConversation: () => void;
}

export function useSupportChat(): SupportChatState {
  const { isAuthenticated } = useUserContext();

  // ── conversationId threading ───────────────────────────────────────────────
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(CHAT_STORAGE_KEYS.CONVERSATION_ID);
    } catch {
      return null;
    }
  });

  const conversationIdRef = useRef<string | null>(conversationId);
  conversationIdRef.current = conversationId;

  // ── hCaptcha state ─────────────────────────────────────────────────────────
  const captchaSitekey = process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY ?? "";
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const pendingMessageRef = useRef<string | null>(null);
  const pendingTokenRef = useRef<string | null>(null);

  // ── Generative rate-limit state ────────────────────────────────────────────
  // Set when the server returns 429 { code: "rate_limited" }. Quick-reply FAQ
  // answers bypass this limit (they return a 200 stream via deflection).
  const [rateLimited, setRateLimited] = useState<RateLimitedState | null>(null);
  const clearRateLimit = useCallback(() => setRateLimited(null), []);

  // ── free-form text input ───────────────────────────────────────────────────
  const [input, setInput] = useState("");

  const persistConversationId = useCallback((id: string) => {
    if (conversationIdRef.current === id) return;
    setConversationId(id);
    conversationIdRef.current = id;
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEYS.CONVERSATION_ID, id);
    } catch (err) {
      console.error("[useSupportChat] localStorage write failed", err);
    }
  }, []);

  // ── custom fetch to intercept x-conversation-id from the SSE stream ───────
  // We intercept the response BEFORE it reaches the SDK stream parser.
  // The fetch wrapper reads the header, then returns the original response so the
  // SDK still gets the full stream.
  const customFetch: typeof fetch = useCallback(
    async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const resp = await fetch(url, init);

      // Handle 401 captcha_required (plain JSON, not a stream)
      if (resp.status === 401) {
        try {
          const clone = resp.clone();
          const json = (await clone.json()) as Record<string, unknown>;
          if (json?.code === "captcha_required") {
            setCaptchaRequired(true);
          }
        } catch {
          // JSON parse failed — fall through to normal error handling
        }
        return resp;
      }

      // Handle 429 rate_limited (plain JSON, not a stream).
      // Quick-reply FAQ answers are NEVER rate-limited (they return 200 via deflection).
      if (resp.status === 429) {
        try {
          const clone = resp.clone();
          const json = (await clone.json()) as Record<string, unknown>;
          if (json?.code === "rate_limited") {
            const retryAfterSeconds =
              typeof json.retryAfterSeconds === "number" ? json.retryAfterSeconds : 300;
            setRateLimited({ retryAfterSeconds });
          }
        } catch {
          // JSON parse failed — fall through to normal error handling
        }
        return resp;
      }

      // On success (2xx), clear any stale rate-limit state so the widget
      // returns to normal once the window has reset and a new message goes through.
      if (resp.ok) {
        setRateLimited(null);
      }

      // On success, read and persist the conversationId header
      const convId = resp.headers.get("x-conversation-id");
      if (convId) {
        persistConversationId(convId);
      }

      return resp;
    },
    [persistConversationId]
  );

  // ── useChat (v6) ──────────────────────────────────────────────────────────
  // transport is created once (useMemo with empty deps).
  // body is a function so it reads the latest refs on each send.
  //
  // The hCaptcha token is consumed one-shot: the body reads it AND nulls it in the
  // same evaluation. This is the only race-free place to clear it — the v6 transport
  // resolves `body` synchronously inside sendMessages() (await resolve(this.body) →
  // value()), several await-boundaries after the caller's sendMessage() returns, so
  // clearing the ref in onCaptchaVerify right after sendMessage() could null it
  // BEFORE the body reads it. Clearing inside the body guarantees the token rides
  // exactly the one request it was minted for and never leaks into later turns.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: customFetch,
        body: () => {
          const token = pendingTokenRef.current;
          pendingTokenRef.current = null;
          return {
            ...(conversationIdRef.current
              ? { conversationId: conversationIdRef.current }
              : {}),
            ...(token ? { hcaptchaToken: token } : {}),
          };
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // transport created once; body fn reads refs, customFetch is stable
  );

  const { messages, status, error, sendMessage, setMessages, stop, clearError } =
    useChat({
      transport,
    });

  // ── Send helpers ───────────────────────────────────────────────────────────
  const sendUserMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setInput("");
      pendingMessageRef.current = text;
      pendingTokenRef.current = null;
      setCaptchaRequired(false);
      clearError();
      await sendMessage({ text });
    },
    [sendMessage, clearError]
  );

  const onCaptchaVerify = useCallback(
    (token: string) => {
      const pending = pendingMessageRef.current;
      if (!pending) return;
      // Stage the single-use token; the transport `body` reads + nulls it on send.
      pendingTokenRef.current = token;
      setCaptchaRequired(false);

      // v6 RETAINS the optimistic user message on a fetch error (verified against
      // ai@6.0.209 AbstractChat.makeRequest: the catch sets status='error' but
      // never pops the message). The original sendMessage({text}) already appended
      // the question, so we drop that trailing failed user message before re-sending
      // to avoid a duplicate. Guard so we only ever drop a trailing user message.
      setMessages((prev) =>
        prev.length > 0 && prev[prev.length - 1]?.role === "user"
          ? prev.slice(0, -1)
          : prev
      );

      void sendMessage({ text: pending });
    },
    [sendMessage, setMessages]
  );

  // ── Reset conversation (called after server-side history delete) ───────────
  const resetConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    conversationIdRef.current = null;
    clearSupportChatStorage();
    setCaptchaRequired(false);
    setRateLimited(null);
    pendingMessageRef.current = null;
    pendingTokenRef.current = null;
  }, [setMessages]);

  // ── Derived: minutes until generative limit resets ─────────────────────────
  const rateLimitMinutesLeft: number | null = rateLimited
    ? Math.max(1, Math.ceil(rateLimited.retryAfterSeconds / 60))
    : null;

  return {
    messages,
    status,
    error,
    captchaRequired,
    captchaSitekey,
    isAuthenticated,
    rateLimited,
    rateLimitMinutesLeft,
    clearRateLimit,
    input,
    setInput,
    sendUserMessage,
    onCaptchaVerify,
    stop,
    clearError,
    resetConversation,
  };
}
