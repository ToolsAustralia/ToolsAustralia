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
import { CHAT_STORAGE_KEYS } from "./chatStorage";

export interface SupportChatState {
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  error: Error | undefined;
  captchaRequired: boolean;
  captchaSitekey: string;
  isAuthenticated: boolean;
  input: string;
  setInput: (v: string) => void;
  sendUserMessage: (text: string) => Promise<void>;
  onCaptchaVerify: (token: string) => void;
  stop: () => void;
  clearError: () => void;
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
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: customFetch,
        body: () => ({
          ...(conversationIdRef.current
            ? { conversationId: conversationIdRef.current }
            : {}),
          ...(pendingTokenRef.current
            ? { hcaptchaToken: pendingTokenRef.current }
            : {}),
        }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // transport created once; body fn reads refs, customFetch is stable
  );

  const { messages, status, error, sendMessage, stop, clearError } = useChat({
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
      pendingTokenRef.current = token;
      setCaptchaRequired(false);
      void sendMessage({ text: pending });
    },
    [sendMessage]
  );

  return {
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
  };
}
