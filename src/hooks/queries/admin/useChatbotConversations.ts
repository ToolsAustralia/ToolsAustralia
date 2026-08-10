import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type {
  ChatTranscriptListResult,
  ChatTranscriptDetail,
  TranscriptStatusFilter,
  TranscriptActorFilter,
  TranscriptKindFilter,
} from "@/services/admin/chatTranscripts";

export type {
  ChatTranscriptListResult,
  ChatTranscriptRow,
  ChatTranscriptDetail,
  ChatTranscriptMessage,
  ChatTranscriptTurn,
  TranscriptStatusFilter,
  TranscriptActorFilter,
  TranscriptKindFilter,
} from "@/services/admin/chatTranscripts";

export interface ChatbotConversationFilters {
  days: number;
  status: TranscriptStatusFilter;
  actor: TranscriptActorFilter;
  kind: TranscriptKindFilter;
  q: string;
  page: number;
}

/**
 * Lists Cobber conversations for the admin transcript browser.
 *
 * `placeholderData: keepPreviousData` keeps the previous page rendered while a
 * new page/filter loads, so paging through transcripts doesn't flash an empty
 * table on every click.
 */
export function useChatbotConversations(filters: ChatbotConversationFilters) {
  const { days, status, actor, kind, q, page } = filters;

  return useQuery<ChatTranscriptListResult>({
    queryKey: ["admin", "chatbot-conversations", days, status, actor, kind, q, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        days: String(days),
        status,
        actor,
        kind,
        page: String(page),
      });
      if (q.trim()) params.set("q", q.trim());

      const res = await fetch(`/api/admin/chatbot-conversations?${params}`);
      if (!res.ok) {
        throw new Error(`Failed to load conversations (${res.status})`);
      }
      const json = (await res.json()) as { data: ChatTranscriptListResult };
      return json.data;
    },
  });
}

/**
 * Loads one full transcript. Pass null to disable (no conversation selected).
 */
export function useChatbotConversation(conversationId: string | null) {
  return useQuery<ChatTranscriptDetail>({
    queryKey: ["admin", "chatbot-conversation", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/chatbot-conversations/${conversationId}`
      );
      if (!res.ok) {
        throw new Error(`Failed to load transcript (${res.status})`);
      }
      const json = (await res.json()) as { data: ChatTranscriptDetail };
      return json.data;
    },
  });
}
