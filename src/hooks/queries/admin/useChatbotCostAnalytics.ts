import { useQuery } from "@tanstack/react-query";
import type { ChatbotCostData } from "@/services/admin/chatbotCostAnalytics";

export type { ChatbotCostData } from "@/services/admin/chatbotCostAnalytics";

export interface UseChatbotCostAnalyticsResult {
  data: ChatbotCostData | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function useChatbotCostAnalytics(
  days: number = 30
): UseChatbotCostAnalyticsResult {
  const query = useQuery<ChatbotCostData>({
    queryKey: ["admin", "chatbot-cost", days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/chatbot-cost?days=${days}`);
      if (!res.ok)
        throw new Error(`Failed to load chatbot cost analytics (${res.status})`);
      const json = (await res.json()) as { data: ChatbotCostData };
      return json.data;
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
