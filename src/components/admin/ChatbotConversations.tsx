"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  AlertTriangle,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  Bot,
  Wrench,
  BookOpen,
  Clock,
  Hash,
  ArrowLeft,
} from "lucide-react";
import { Card, Segmented, Badge } from "@/components/admin/ui";
import {
  useChatbotConversations,
  useChatbotConversation,
  type ChatTranscriptRow,
  type TranscriptStatusFilter,
  type TranscriptActorFilter,
  type TranscriptKindFilter,
} from "@/hooks/queries/admin/useChatbotConversations";

/**
 * ChatbotConversations
 *
 * Admin transcript browser for Cobber. Left: a filterable list of the last N
 * days of conversations. Click one to read the full exchange, with the FAQ docs
 * Cobber grounded each answer on and the per-turn model/latency/token cost.
 *
 * Content shown here is already PII-redacted at write time ([email]/[phone]/
 * [card]); customer identity is limited to firstName + the opaque user id.
 */

type RangeDays = 7 | 30 | 90;

const RANGE_OPTIONS: { value: RangeDays; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

const STATUS_OPTIONS: { value: TranscriptStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "escalated", label: "Escalated" },
  { value: "closed", label: "Closed" },
];

const ACTOR_OPTIONS: { value: TranscriptActorFilter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "member", label: "Members" },
  { value: "anonymous", label: "Guests" },
];

const KIND_OPTIONS: { value: TranscriptKindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "deflected", label: "FAQ only" },
  { value: "generative", label: "AI answered" },
];

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtMs(n: number | null): string {
  if (n == null || n === 0) return "—";
  if (n >= 1000) return (n / 1000).toFixed(1) + "s";
  return n + "ms";
}

function statusTone(
  status: "open" | "escalated" | "closed"
): "neutral" | "warning" | "success" {
  if (status === "escalated") return "warning";
  if (status === "closed") return "success";
  return "neutral";
}

// ───────────────────────────────────────────────────────────────────────────
// Transcript detail
// ───────────────────────────────────────────────────────────────────────────

function MessageBubble({
  role,
  content,
  createdAt,
  citations,
  toolCalls,
}: {
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  citations: { docId: string; span?: string }[];
  toolCalls: { name: string; ok: boolean; durationMs?: number }[];
}) {
  const isUser = role === "user";
  const isTool = role === "tool";

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center ${
          isUser
            ? "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400"
            : isTool
              ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
              : "bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400"
        }`}
      >
        {isUser ? (
          <UserIcon className="w-3.5 h-3.5" />
        ) : isTool ? (
          <Wrench className="w-3.5 h-3.5" />
        ) : (
          <Bot className="w-3.5 h-3.5" />
        )}
      </div>

      <div className={`min-w-0 max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${
            isUser
              ? "bg-indigo-600 text-white rounded-tr-sm"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 rounded-tl-sm"
          }`}
        >
          {content}
        </div>

        {/* Grounding — which FAQ docs this answer came from */}
        {citations.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <BookOpen className="w-3 h-3 text-neutral-400 dark:text-neutral-500 shrink-0" />
            {citations.map((c, i) => (
              <span
                key={`${c.docId}-${i}`}
                title={c.span}
                className="text-2xs font-mono px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
              >
                {c.docId}
              </span>
            ))}
          </div>
        )}

        {toolCalls.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {toolCalls.map((t, i) => (
              <span
                key={`${t.name}-${i}`}
                className={`text-2xs font-mono px-1.5 py-0.5 rounded ${
                  t.ok
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400"
                    : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                }`}
              >
                {t.name}
                {t.durationMs != null && ` · ${fmtMs(t.durationMs)}`}
              </span>
            ))}
          </div>
        )}

        <span className="mt-1 text-2xs text-neutral-400 dark:text-neutral-500">
          {fmtDateTime(createdAt)}
        </span>
      </div>
    </div>
  );
}

function TranscriptDetail({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack: () => void;
}) {
  const { data, isLoading, isError } = useChatbotConversation(conversationId);

  if (isError) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-sm">
            Couldn’t load this transcript. It may have passed the 90-day
            retention window.
          </span>
        </div>
        <button
          onClick={onBack}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to list
        </button>
      </Card>
    );
  }

  const totalTokens = (data?.tokensIn ?? 0) + (data?.tokensOut ?? 0);

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" /> Back to conversations
      </button>

      {/* Header */}
      <Card className="p-4">
        {isLoading || !data ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-500">
            Loading transcript…
          </p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    {data.actorKind === "member"
                      ? (data.firstName ?? "Member")
                      : "Guest"}
                  </span>
                  <Badge tone={data.actorKind === "member" ? "info" : "neutral"}>
                    {data.actorKind === "member" ? "Member" : "Anonymous"}
                  </Badge>
                  <Badge tone={statusTone(data.status)}>{data.status}</Badge>
                  {data.modelTier.length === 0 && (
                    <Badge tone="success">FAQ only — no AI cost</Badge>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                  Started {fmtDateTime(data.createdAt)} · last activity{" "}
                  {fmtRelative(data.updatedAt)}
                  {data.userId && (
                    <>
                      {" "}
                      · <span className="font-mono">{data.userId}</span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400 shrink-0">
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5" />
                  {data.messages.length} messages
                </span>
                <span className="inline-flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5" />
                  {totalTokens.toLocaleString("en-AU")} tokens
                </span>
              </div>
            </div>

            {data.modelTier.length > 0 && (
              <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
                Models used:{" "}
                <span className="font-medium text-neutral-600 dark:text-neutral-300">
                  {data.modelTier.join(", ")}
                </span>
              </p>
            )}

            {data.escalatedSubmissionId && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Escalated to human support — submission{" "}
                <span className="font-mono">{data.escalatedSubmissionId}</span>{" "}
                (see the Submissions tab).
              </p>
            )}

            {data.possiblyTruncated && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                This conversation is older than the 90-day message retention
                window — some early messages may already have been purged.
              </p>
            )}
          </>
        )}
      </Card>

      {/* Messages */}
      <Card className="p-4">
        {isLoading || !data ? (
          <div className="py-12 text-center text-sm text-neutral-400 dark:text-neutral-500">
            Loading messages…
          </div>
        ) : data.messages.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-400 dark:text-neutral-500">
            No messages stored for this conversation.
          </div>
        ) : (
          <div className="space-y-4">
            {data.messages.map((m) => (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                createdAt={m.createdAt}
                citations={m.citations}
                toolCalls={m.toolCalls}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Per-turn audit */}
      {data && data.turns.length > 0 && (
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
            Per-turn detail
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  {["Time", "Answered by", "Model", "Tokens", "Latency", "HTTP"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`py-2 px-2 text-2xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 ${i > 2 ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {data.turns.map((t) => (
                  <tr
                    key={t.requestId}
                    className="border-b border-neutral-100 dark:border-neutral-800/60"
                  >
                    <td className="py-2 px-2 text-neutral-600 dark:text-neutral-300 whitespace-nowrap">
                      {fmtDateTime(t.createdAt)}
                    </td>
                    <td className="py-2 px-2">
                      {t.escalated ? (
                        <Badge tone="warning">Escalated</Badge>
                      ) : t.deflected ? (
                        <Badge tone="success">FAQ (free)</Badge>
                      ) : (
                        <Badge tone="info">AI</Badge>
                      )}
                    </td>
                    <td className="py-2 px-2 font-mono text-2xs text-neutral-500 dark:text-neutral-400">
                      {t.modelTier ?? "—"}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-neutral-600 dark:text-neutral-300">
                      {(t.tokensIn + t.tokensOut).toLocaleString("en-AU")}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-neutral-600 dark:text-neutral-300">
                      {fmtMs(t.durationMs)}
                    </td>
                    <td
                      className={`py-2 px-2 text-right tabular-nums ${t.status >= 400 ? "text-red-600 dark:text-red-400 font-semibold" : "text-neutral-500 dark:text-neutral-400"}`}
                    >
                      {t.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// List
// ───────────────────────────────────────────────────────────────────────────

function ConversationRow({
  row,
  onOpen,
}: {
  row: ChatTranscriptRow;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(row.id)}
      className="w-full text-left px-3.5 py-3 border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              {row.actorKind === "member" ? (row.firstName ?? "Member") : "Guest"}
            </span>
            <Badge tone={row.actorKind === "member" ? "info" : "neutral"}>
              {row.actorKind === "member" ? "Member" : "Anon"}
            </Badge>
            {row.status !== "open" && (
              <Badge tone={statusTone(row.status)}>{row.status}</Badge>
            )}
            {row.deflectedOnly && <Badge tone="success">FAQ only</Badge>}
          </div>

          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300 line-clamp-2">
            {row.firstUserMessage ?? (
              <span className="italic text-neutral-400 dark:text-neutral-500">
                No user message recorded
              </span>
            )}
          </p>

          <p className="mt-1 text-2xs text-neutral-400 dark:text-neutral-500">
            {row.messageCount} messages · {row.userMessageCount} from user
            {row.tokensIn + row.tokensOut > 0 && (
              <>
                {" "}
                · {(row.tokensIn + row.tokensOut).toLocaleString("en-AU")} tokens
              </>
            )}
          </p>
        </div>

        <span className="shrink-0 text-2xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {fmtRelative(row.updatedAt)}
        </span>
      </div>
    </button>
  );
}

export default function ChatbotConversations() {
  const [days, setDays] = useState<RangeDays>(30);
  const [status, setStatus] = useState<TranscriptStatusFilter>("all");
  const [actor, setActor] = useState<TranscriptActorFilter>("all");
  const [kind, setKind] = useState<TranscriptKindFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError, isFetching } = useChatbotConversations({
    days,
    status,
    actor,
    kind,
    q,
    page,
  });

  // Any filter change invalidates the current page number.
  function resetAnd<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(searchInput);
    setPage(1);
  }

  function clearSearch() {
    setSearchInput("");
    setQ("");
    setPage(1);
  }

  if (selectedId) {
    return (
      <div className="p-1">
        <TranscriptDetail
          conversationId={selectedId}
          onBack={() => setSelectedId(null)}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 p-6 text-red-600 dark:text-red-400">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="text-sm">Failed to load conversations.</span>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  return (
    <div className="space-y-4 p-1">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Every Cobber conversation from the last {days} days — what people asked
        and how Cobber answered. Personal details (emails, phone numbers, card
        numbers) are stripped before storage, and everything is auto-deleted
        after 90 days.
      </p>

      {/* Filters */}
      <Card className="p-3.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Range
            </span>
            <Segmented<RangeDays>
              options={RANGE_OPTIONS}
              value={days}
              onChange={resetAnd(setDays)}
              size="sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-2xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Status
            </span>
            <Segmented<TranscriptStatusFilter>
              options={STATUS_OPTIONS}
              value={status}
              onChange={resetAnd(setStatus)}
              size="sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-2xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Who
            </span>
            <Segmented<TranscriptActorFilter>
              options={ACTOR_OPTIONS}
              value={actor}
              onChange={resetAnd(setActor)}
              size="sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-2xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Answered by
            </span>
            <Segmented<TranscriptKindFilter>
              options={KIND_OPTIONS}
              value={kind}
              onChange={resetAnd(setKind)}
              size="sm"
            />
          </div>
        </div>

        <form onSubmit={submitSearch} className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search what people asked — e.g. refund, entries, cancel…"
            className="w-full pl-9 pr-9 py-2 text-sm rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {q && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </Card>

      {/* Result list */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-neutral-200 dark:border-neutral-800">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {isLoading ? (
              "Loading…"
            ) : (
              <>
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {total.toLocaleString("en-AU")}
                </span>{" "}
                conversation{total === 1 ? "" : "s"}
                {q && <> matching “{q}”</>}
              </>
            )}
            {isFetching && !isLoading && (
              <span className="ml-2 text-neutral-400 dark:text-neutral-500">
                updating…
              </span>
            )}
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
                className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-neutral-400 dark:text-neutral-500">
            Loading conversations…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <MessageSquare className="w-8 h-8 text-neutral-300 dark:text-neutral-600" />
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              No conversations match these filters.
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Try widening the date range or clearing the search.
            </p>
          </div>
        ) : (
          <div>
            {rows.map((row) => (
              <ConversationRow key={row.id} row={row} onOpen={setSelectedId} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
