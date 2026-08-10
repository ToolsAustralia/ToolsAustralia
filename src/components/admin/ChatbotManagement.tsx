"use client";

import { useState } from "react";
import { Segmented } from "@/components/admin/ui";
import { usePermissions } from "@/hooks/usePermissions";
import ChatbotCostManagement from "@/components/admin/ChatbotCostManagement";
import ChatbotConversations from "@/components/admin/ChatbotConversations";

/**
 * ChatbotManagement
 *
 * Container for the admin "Chatbot" tab. Owns the sub-view switch so each leaf
 * view stays a single concern:
 *   - Usage & cost  → ChatbotCostManagement (aggregate ChatAuditLog metrics)
 *   - Conversations → ChatbotConversations (stored transcripts)
 *
 * Permissions differ per sub-view on purpose. The tab itself is granted by
 * `overview.view` (see adminTabs.ts), which is right for aggregate cost
 * numbers — but transcripts contain what individual customers typed, so they
 * sit behind `submissions.view`, matching the API routes. A user with only
 * `overview.view` never sees the Conversations switch at all, rather than
 * clicking it into a 403.
 */

type SubView = "usage" | "conversations";

export default function ChatbotManagement() {
  const { has } = usePermissions();
  const canReadTranscripts = has("submissions.view");
  const [view, setView] = useState<SubView>("usage");

  if (!canReadTranscripts) {
    return <ChatbotCostManagement />;
  }

  const options: { value: SubView; label: string }[] = [
    { value: "usage", label: "Usage & cost" },
    { value: "conversations", label: "Conversations" },
  ];

  return (
    <div className="space-y-4">
      <div className="px-1">
        <Segmented<SubView> options={options} value={view} onChange={setView} />
      </div>

      {view === "usage" ? <ChatbotCostManagement /> : <ChatbotConversations />}
    </div>
  );
}
