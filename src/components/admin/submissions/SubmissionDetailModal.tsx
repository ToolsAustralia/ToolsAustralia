"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquareReply, X } from "lucide-react";
import SubmissionContactInfo from "./SubmissionContactInfo";
import SubmissionBusinessInfo from "./SubmissionBusinessInfo";
import ConversationThread from "./ConversationThread";
import type { ThreadMessage } from "./ConversationThread";
import ReplyForm from "./ReplyForm";
import { getStatusColor } from "./StatusSelect";
import ModalContainer from "@/components/modals/ui/ModalContainer";

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
  /** Contact submissions on small screens: composer hidden until Reply is tapped (message stays in view first). */
  const [mobileReplyOpen, setMobileReplyOpen] = useState(false);
  const mobileReplyFooterRef = useRef<HTMLDivElement>(null);

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

  const handleReply = async ({ subject, message }: { subject: string; message: string }): Promise<boolean> => {
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
      return true;
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to send reply",
        variant: "error",
      });
      return false;
    }
  };

  const openMobileReply = () => {
    setMobileReplyOpen(true);
    requestAnimationFrame(() => {
      mobileReplyFooterRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const handleReplyFromForm = async (data: { subject: string; message: string }) => {
    const ok = await handleReply(data);
    if (ok && type === "contact") {
      setMobileReplyOpen(false);
    }
  };

  const messages = buildThreadMessages();

  return (
    <ModalContainer
      isOpen
      onClose={onClose}
      size="4xl"
      height="auto"
      preventBackButton={false}
      className="relative mx-4 flex flex-col !max-w-2xl lg:!max-w-3xl max-h-[90vh] overflow-hidden !border-gray-200 dark:!border-neutral-700 shadow-2xl dark:shadow-none !bg-gradient-to-br from-white via-slate-50 to-white dark:!from-neutral-900 dark:!via-neutral-900 dark:!to-neutral-950"
    >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-neutral-700 bg-gradient-to-r from-slate-50 to-white dark:from-neutral-900 dark:to-neutral-950 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
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
            className="-mr-2 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6 brand-scrollbar">
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

        {/* Contact: mobile — composer hidden until Reply (thread/message visible first) */}
        {type === "contact" && (
          <div
            ref={mobileReplyFooterRef}
            className="flex-shrink-0 border-t border-gray-200 bg-gray-50/90 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900/95 md:hidden"
          >
            {!mobileReplyOpen ? (
              <button
                type="button"
                onClick={openMobileReply}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-red-700 hover:to-red-800 active:scale-[0.99]"
              >
                <MessageSquareReply className="h-4 w-4" aria-hidden />
                Reply
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                    Your reply
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileReplyOpen(false)}
                    className="text-xs font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200"
                  >
                    Hide
                  </button>
                </div>
                <ReplyForm defaultSubject={getDefaultSubject()} onSend={handleReplyFromForm} />
              </div>
            )}
          </div>
        )}

        {/* Reply form — desktop for contact; all sizes for partner */}
        <div
          className={`flex-shrink-0 border-t border-gray-200 bg-gray-50/80 px-4 py-4 dark:border-neutral-700 dark:bg-neutral-900/90 sm:px-6 ${
            type === "contact" ? "hidden md:block" : ""
          }`}
        >
          <ReplyForm defaultSubject={getDefaultSubject()} onSend={handleReplyFromForm} />
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
    </ModalContainer>
  );
}
