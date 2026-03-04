"use client";

import React, { useRef, useEffect } from "react";
import { Mail } from "lucide-react";
import { formatDateInLocal } from "@/utils/common/timezone";

export interface ThreadMessage {
  id: string;
  sender: "customer" | "admin";
  senderName: string;
  senderEmail?: string;
  body: string;
  sentAt: string;
}

interface ConversationThreadProps {
  messages: ThreadMessage[];
}

export default function ConversationThread({
  messages,
}: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
        <Mail className="w-4 h-4" />
        Email Thread ({messages.length})
      </h4>
      <div className="max-h-[350px] sm:max-h-[400px] overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-200 bg-white">
        {messages.map((msg, index) => {
          const isAdmin = msg.sender === "admin";
          const isFirst = index === 0;
          const isLast = index === messages.length - 1;

          return (
            <div
              key={msg.id}
              className={`px-4 sm:px-5 py-4 transition-colors ${
                isFirst
                  ? "bg-white"
                  : isAdmin
                  ? "bg-blue-50/40"
                  : "bg-white"
              } ${isFirst ? "rounded-t-xl" : ""} ${
                isLast ? "rounded-b-xl" : ""
              }`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {msg.senderName}
                    </span>
                    {isAdmin && (
                      <span className="text-[10px] font-medium bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                        Admin
                      </span>
                    )}
                  </div>
                  {msg.senderEmail && (
                    <p className="text-xs text-gray-400 truncate">
                      {msg.senderEmail}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 pt-0.5">
                  {formatDateInLocal(
                    new Date(msg.sentAt),
                    "dd MMM yyyy, hh:mm a"
                  )}
                </span>
              </div>

              {/* Body - HTML from RichTextEditor, or plain text */}
              {msg.body.includes("<") && msg.body.includes(">") ? (
                <div
                  className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5"
                  dangerouslySetInnerHTML={{ __html: msg.body }}
                />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {msg.body}
                </p>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
