import SendGridClient from "./sendgrid-client";
import { EmailCategory, getSenderIdentity } from "./sender-identities";
import { createStaffInviteEmailTemplate } from "./templates";
import type { EmailResult } from "./types";

export interface StaffInviteEmailParams {
  to: string;
  inviteeName: string;
  roleName: string;
  inviteLink: string;
  inviterName: string;
  expiresIn?: string;
}

export async function sendStaffInviteEmail(p: StaffInviteEmailParams): Promise<EmailResult> {
  const html = createStaffInviteEmailTemplate({
    inviteeName: p.inviteeName,
    roleName: p.roleName,
    inviteLink: p.inviteLink,
    inviterName: p.inviterName,
    expiresIn: p.expiresIn,
  });

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
