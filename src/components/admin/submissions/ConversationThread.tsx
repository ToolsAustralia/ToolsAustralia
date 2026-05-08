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
      <div className="py-8 text-center text-sm text-gray-400 dark:text-neutral-500">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
        <Mail className="h-4 w-4" />
        Email Thread ({messages.length})
      </h4>
      <div className="max-h-[350px] divide-y divide-gray-200 overflow-y-auto rounded-xl border border-gray-200 bg-neutral-50 dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 sm:max-h-[400px]">
        {messages.map((msg, index) => {
          const isAdmin = msg.sender === "admin";
          const isFirst = index === 0;
          const isLast = index === messages.length - 1;

          return (
            <div
              key={msg.id}
              className={`px-4 py-4 transition-colors sm:px-5 ${
                isFirst
                  ? "rounded-t-xl bg-white dark:bg-neutral-950"
                  : isAdmin
                  ? "bg-blue-50/40 dark:bg-blue-950/30"
                  : "bg-white dark:bg-neutral-950"
              } ${isFirst ? "rounded-t-xl" : ""} ${
                isLast ? "rounded-b-xl" : ""
              }`}
            >
              {/* Header row */}
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">
                      {msg.senderName}
                    </span>
                    {isAdmin && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-2xs font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
                        Admin
                      </span>
                    )}
                  </div>
                  {msg.senderEmail && (
                    <p className="truncate text-xs text-gray-500 dark:text-neutral-500">
                      {msg.senderEmail}
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 whitespace-nowrap pt-0.5 text-xs text-gray-500 dark:text-neutral-500">
                  {formatDateInLocal(
                    new Date(msg.sentAt),
                    "dd MMM yyyy, hh:mm a"
                  )}
                </span>
              </div>

              {/* Body - HTML from RichTextEditor, or plain text */}
              {msg.body.includes("<") && msg.body.includes(">") ? (
                <div
                  className="prose prose-sm max-w-none text-sm leading-relaxed text-gray-800 dark:prose-invert dark:text-neutral-200 [&_li]:my-0.5 [&_ol]:my-2 [&_p]:my-1 [&_ul]:my-2"
                  dangerouslySetInnerHTML={{ __html: msg.body }}
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-neutral-200">
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
