"use client";

import React, { useState, useEffect } from "react";
import { Send } from "lucide-react";
import RichTextEditor from "@/components/ui/RichTextEditor";

interface ReplyFormProps {
  defaultSubject?: string;
  onSend: (data: { subject: string; message: string }) => Promise<void>;
  disabled?: boolean;
}

function hasMessageContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim() !== "";
}

export default function ReplyForm({ defaultSubject = "", onSend, disabled }: ReplyFormProps) {
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setSubject(defaultSubject);
  }, [defaultSubject]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !hasMessageContent(message) || sending) return;

    setSending(true);
    try {
      await onSend({ subject: subject.trim(), message });
      setMessage("");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        disabled={disabled || sending}
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-500 disabled:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:disabled:bg-neutral-900/80"
      />
      <RichTextEditor
        value={message}
        onChange={setMessage}
        placeholder="Type your reply..."
        minHeight="100px"
        maxHeight="180px"
        className="text-sm"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={
            !subject.trim() || !hasMessageContent(message) || sending || disabled
          }
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
        >
          <Send className="w-4 h-4" />
          {sending ? "Sending..." : "Send Reply"}
        </button>
      </div>
    </form>
  );
}
