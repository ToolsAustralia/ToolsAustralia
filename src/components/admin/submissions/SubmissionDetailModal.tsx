"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import SubmissionContactInfo from "./SubmissionContactInfo";
import SubmissionBusinessInfo from "./SubmissionBusinessInfo";
import ConversationThread from "./ConversationThread";
import type { ThreadMessage } from "./ConversationThread";
import ReplyForm from "./ReplyForm";
import { getStatusColor } from "./StatusSelect";

interface Reply {
  _id: string;
  body: string;
  sentAt: string;
  sentBy: { _id: string; name: string; email: string } | string;
}

export interface PartnerApplication {
  _id: string;
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone: string;
  abn?: string;
  acn?: string;
  goals?: string;
  status: "pending" | "under_review" | "approved" | "rejected" | "contacted";
  submittedAt: string;
  readAt?: string | null;
  replies?: Reply[];
  reviewedBy?: { name: string; email: string };
  reviewedAt?: string;
}

export interface ContactSubmission {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: "new" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  submittedAt: string;
  readAt?: string | null;
  replies?: Reply[];
  assignedTo?: { name: string; email: string };
  respondedBy?: { name: string; email: string };
  respondedAt?: string;
  response?: string;
}

type Submission = PartnerApplication | ContactSubmission;

interface SubmissionDetailModalProps {
  submission: Submission;
  type: "partner" | "contact";
  onClose: () => void;
  onUpdated: () => void;
}

function isPartnerApplication(s: Submission): s is PartnerApplication {
  return "businessName" in s;
}

function isContactSubmission(s: Submission): s is ContactSubmission {
  return "subject" in s;
}

export default function SubmissionDetailModal({
  submission: initialSubmission,
  type,
  onClose,
  onUpdated,
}: SubmissionDetailModalProps) {
  const [submission, setSubmission] = useState<Submission>(initialSubmission);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      const endpoint =
        type === "partner"
          ? `/api/partner-applications/${submission._id}`
          : `/api/contact-submissions/${submission._id}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        setSubmission(json.data);
      }
    } catch {
      // silently fail
    }
  }, [submission._id, type]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const buildThreadMessages = (): ThreadMessage[] => {
    const messages: ThreadMessage[] = [];

    if (isContactSubmission(submission)) {
      messages.push({
        id: "original",
        sender: "customer",
        senderName: `${submission.firstName} ${submission.lastName}`,
        senderEmail: submission.email,
        body: `Subject: ${submission.subject}\n\n${submission.message}`,
        sentAt: submission.submittedAt,
      });
    } else if (isPartnerApplication(submission)) {
      const body = submission.goals
        ? `Partnership Goals:\n${submission.goals}`
        : "Submitted a partner application.";
      messages.push({
        id: "original",
        sender: "customer",
        senderName: `${submission.firstName} ${submission.lastName}`,
        senderEmail: submission.email,
        body,
        sentAt: submission.submittedAt,
      });
    }

    if (submission.replies) {
      submission.replies.forEach((reply) => {
        const sentByObj =
          typeof reply.sentBy === "object" ? reply.sentBy : null;
        // Admin name only - omit email for admin replies (it's often the shared reply-to, not the actual admin)
        messages.push({
          id: reply._id,
          sender: "admin",
          senderName: sentByObj?.name || "Admin",
          senderEmail: undefined,
          body: reply.body,
          sentAt: reply.sentAt,
        });
      });
    }

    return messages;
  };

  const getDefaultSubject = (): string => {
    if (isContactSubmission(submission)) {
      return `Re: ${submission.subject}`;
    }
    if (isPartnerApplication(submission)) {
      return `Re: Your Partner Application - ${submission.businessName}`;
    }
    return "";
  };

  const handleReply = async ({ subject, message }: { subject: string; message: string }) => {
    try {
      const endpoint =
        type === "partner"
          ? `/api/partner-applications/${submission._id}/reply`
          : `/api/contact-submissions/${submission._id}/reply`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send reply");
      }

      const json = await res.json();
      setSubmission(json.data);
      setToast({ message: "Reply sent successfully", variant: "success" });
      onUpdated();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to send reply",
        variant: "error",
      });
    }
  };

  const messages = buildThreadMessages();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl lg:max-w-3xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-gray-50/80 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {type === "partner"
                ? "Partner Application"
                : "Contact Submission"}
            </h3>
            <span
              className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 ${getStatusColor(
                submission.status
              )}`}
            >
              {submission.status.replace("_", " ")}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6">
          {/* Contact info */}
          <SubmissionContactInfo
            firstName={submission.firstName}
            lastName={submission.lastName}
            email={submission.email}
            phone={submission.phone}
            submittedAt={submission.submittedAt}
          />

          {/* Business info (partner only) */}
          {type === "partner" && isPartnerApplication(submission) && (
            <SubmissionBusinessInfo
              businessName={submission.businessName}
              abn={submission.abn}
              acn={submission.acn}
              goals={submission.goals}
            />
          )}

          {/* Conversation thread */}
          <ConversationThread messages={messages} />
        </div>

        {/* Reply form (sticky bottom) */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50/80 px-4 sm:px-6 py-4">
          <ReplyForm defaultSubject={getDefaultSubject()} onSend={handleReply} />
        </div>

        {/* Toast notification */}
        {toast && (
          <div
            className={`absolute top-16 right-4 sm:right-6 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all duration-300 ${
              toast.variant === "success"
                ? "bg-green-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}
