import fs from "node:fs/promises";
import path from "node:path";
import SendGridClient from "./sendgrid-client";
import { EmailCategory, getSenderIdentity } from "./sender-identities";
import { escapeHtml } from "./utils";
import type { EmailResult } from "./types";

export interface StaffInviteEmailParams {
  to: string;
  inviteeName: string;
  roleName: string;
  inviteLink: string;
  inviterName: string;
  expiresIn?: string;
}

const TEMPLATE_PATH = path.join(process.cwd(), "email-templates", "sendgrid", "staff-invite-email-template.html");

let cachedTemplate: string | null = null;
async function loadTemplate(): Promise<string> {
  if (cachedTemplate) return cachedTemplate;
  cachedTemplate = await fs.readFile(TEMPLATE_PATH, "utf8");
  return cachedTemplate;
}

export async function sendStaffInviteEmail(p: StaffInviteEmailParams): Promise<EmailResult> {
  const tmpl = await loadTemplate();
  const html = tmpl
    .replaceAll("{{INVITEE_NAME}}", escapeHtml(p.inviteeName))
    .replaceAll("{{ROLE_NAME}}", escapeHtml(p.roleName))
    .replaceAll("{{INVITE_LINK}}", p.inviteLink)
    .replaceAll("{{INVITER_NAME}}", escapeHtml(p.inviterName))
    .replaceAll("{{EXPIRES_IN}}", p.expiresIn ?? "7 days");

  const text = `Hi ${p.inviteeName},\n\n${p.inviterName} invited you to join the Tools Australia admin team as ${p.roleName}.\n\nSet a password and finish setting up your account here:\n${p.inviteLink}\n\nThis link expires in ${p.expiresIn ?? "7 days"}. If you weren't expecting this invitation, you can safely ignore this email.`;

  const sender = getSenderIdentity(EmailCategory.TRANSACTIONAL);
  const client = SendGridClient.getInstance();
  return client.sendEmail({
    to: p.to,
    from: { email: sender.fromEmail, name: sender.fromName },
    subject: `You've been invited to Tools Australia Admin (${p.roleName})`,
    html,
    text,
    replyTo: sender.replyTo,
  });
}
