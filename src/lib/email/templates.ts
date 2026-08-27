/**
 * Email Templates
 * Local HTML templates for email sending
 * These templates can be migrated to SendGrid Dynamic Templates later if desired
 */

import { escapeHtml, escapeHtmlPreserveNewlines } from './utils';
import {
  renderBrandEmail,
  chip,
  heading,
  lede,
  note,
  button,
  codeBox,
  alertBlock,
  entriesCallout,
  prizePanel,
  spacer,
  infoTable,
  lineItemsTable,
  messageBlock,
  bodyText,
  bodyHeading,
} from './components';

/**
 * Create HTML email template for verification code
 */
export function createVerificationEmailTemplate(userName: string, verificationCode: string): string {
  const safeUserName = escapeHtml(userName || 'User');
  const safeCode = escapeHtml(verificationCode);
  const content =
    chip('Welcome to the crew') +
    spacer(16) +
    heading(`G'day ${safeUserName},<br/>you're almost in`) +
    spacer(16) +
    lede(
      'Enter the code below to verify your email and activate your Tools Australia account.'
    ) +
    spacer(28) +
    codeBox({
      label: 'Your verification code',
      code: safeCode,
      caption: 'Expires in 24 hours · never share it with anyone.',
    }) +
    spacer(20) +
    note("Didn't sign up? Safely ignore this email — no account will be created.");
  return renderBrandEmail({
    title: `Your verification code: ${safeCode}`,
    preheader: `Your Tools Australia verification code is ${safeCode}.`,
    contentHtml: content,
  });
}

/**
 * Create HTML email template for password reset
 */
export function createPasswordResetEmailTemplate(
  userName: string,
  resetUrl: string,
  expiryMinutes: number = 1440
): string {
  const expiryText =
    expiryMinutes >= 60
      ? `${expiryMinutes / 60} hour${expiryMinutes > 60 ? 's' : ''}`
      : `${expiryMinutes} minutes`;
  const content =
    chip('Account security') +
    spacer(16) +
    heading('Reset your<br/>password') +
    spacer(28) +
    button({ href: resetUrl, label: 'Reset Password', variant: 'red' }) +
    spacer(26) +
    alertBlock({
      title: `This link expires in ${expiryText}`,
      body: 'For your security the reset link works once. If it lapses, just request a new one from the login page.',
    }) +
    spacer(16) +
    note("Didn't ask for this? Ignore it — your password stays the same.");
  return renderBrandEmail({
    title: 'Reset your password',
    preheader: `Reset your Tools Australia password — link expires in ${expiryText}.`,
    contentHtml: content,
  });
}

/**
 * Create HTML email template for a staff/admin team invite.
 * Code-as-source (migrated from the old disk template June 2026): renders from the shared
 * components.ts design system like every other SendGrid email — no HTML file on disk.
 */
export function createStaffInviteEmailTemplate(params: {
  inviteeName: string;
  roleName: string;
  inviteLink: string;
  inviterName: string;
  expiresIn?: string;
}): string {
  const safeInvitee = escapeHtml(params.inviteeName || 'there');
  const safeRole = escapeHtml(params.roleName);
  const safeInviter = escapeHtml(params.inviterName);
  const safeExpires = escapeHtml(params.expiresIn ?? '7 days');
  // The invite link is a system-generated URL (token), not user input — kept raw like resetUrl.
  const inviteLink = params.inviteLink;
  const content =
    chip('Team invitation') +
    spacer(16) +
    heading("You're invited to<br/>the crew") +
    spacer(16) +
    lede(
      `Hi ${safeInvitee} — ${safeInviter} has invited you to join the Tools Australia admin team. Accept below to set your password and finish setting up your account.`
    ) +
    spacer(28) +
    infoTable([
      { label: 'Your role', value: safeRole },
      { label: 'Invited by', value: safeInviter },
    ]) +
    spacer(28) +
    button({ href: inviteLink, label: 'Accept Invite', variant: 'red' }) +
    spacer(20) +
    note(
      `This invite expires in ${safeExpires}. Not expecting it? You can safely ignore this email.`
    ) +
    spacer(22) +
    note(
      `Button not working? Paste this link into your browser:<br/><a href="${inviteLink}" style="color:#dc2626;text-decoration:underline;word-break:break-all;">${inviteLink}</a>`
    );
  return renderBrandEmail({
    title: "You're invited to the Tools Australia team",
    preheader: `${safeInviter} invited you to the Tools Australia admin dashboard.`,
    contentHtml: content,
  });
}

/**
 * Create HTML email template for contact form submission
 */
export function createContactSubmissionEmailTemplate(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  submittedAt: Date;
  submissionId: string;
}): string {
  const submittedDate = new Date(data.submittedAt).toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Sydney',
  });
  const safeFirstName = escapeHtml(data.firstName);
  const safeLastName = escapeHtml(data.lastName);
  const safeEmail = escapeHtml(data.email);
  const safePhone = escapeHtml(data.phone);
  const safeSubject = escapeHtml(data.subject);
  const safeMessage = escapeHtmlPreserveNewlines(data.message);
  const safeSubmissionId = escapeHtml(data.submissionId);
  const content =
    chip('New contact') +
    spacer(16) +
    heading('New contact form<br/>submission') +
    spacer(16) +
    lede('A new contact form submission just came through the website.') +
    spacer(24) +
    infoTable([
      { label: 'Full name', value: `${safeFirstName} ${safeLastName}` },
      { label: 'Email', value: `<a href="mailto:${safeEmail}" style="color:#dc2626;text-decoration:none;">${safeEmail}</a>` },
      { label: 'Phone', value: `<a href="tel:${safePhone}" style="color:#dc2626;text-decoration:none;">${safePhone}</a>` },
      { label: 'Subject', value: safeSubject },
    ]) +
    spacer(8) +
    messageBlock({ label: 'Message', html: safeMessage, preserveWhitespace: true }) +
    spacer(18) +
    note(`Submission ID: ${safeSubmissionId} · ${submittedDate} (AEST)`) +
    spacer(6) +
    note('Reply directly to this email to respond to the customer.');
  return renderBrandEmail({
    title: 'New contact form submission',
    preheader: `New contact from ${safeFirstName} ${safeLastName} — ${safeSubject}`,
    contentHtml: content,
  });
}

/**
 * Create HTML email template for partner application
 */
export function createPartnerApplicationEmailTemplate(data: {
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone: string;
  abn?: string;
  acn?: string;
  goals?: string;
  submittedAt: Date;
}): string {
  const submittedDate = new Date(data.submittedAt).toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Sydney',
  });
  const safeFirstName = escapeHtml(data.firstName);
  const safeLastName = escapeHtml(data.lastName);
  const safeBusinessName = escapeHtml(data.businessName);
  const safeEmail = escapeHtml(data.email);
  const safePhone = escapeHtml(data.phone);
  const safeAbn = escapeHtml(data.abn ?? '');
  const safeAcn = escapeHtml(data.acn ?? '');
  const safeGoals = escapeHtmlPreserveNewlines(data.goals ?? '');
  const rows = [
    { label: 'Contact', value: `${safeFirstName} ${safeLastName}` },
    { label: 'Business', value: safeBusinessName },
    { label: 'Email', value: `<a href="mailto:${safeEmail}" style="color:#dc2626;text-decoration:none;">${safeEmail}</a>` },
    { label: 'Phone', value: `<a href="tel:${safePhone}" style="color:#dc2626;text-decoration:none;">${safePhone}</a>` },
  ];
  if (safeAbn) rows.push({ label: 'ABN', value: safeAbn });
  if (safeAcn) rows.push({ label: 'ACN', value: safeAcn });
  const content =
    chip('New partner application') +
    spacer(16) +
    heading('New partner<br/>application') +
    spacer(16) +
    lede(`${safeBusinessName} just applied to become a Tools Australia partner.`) +
    spacer(24) +
    infoTable(rows) +
    (safeGoals ? spacer(8) + messageBlock({ label: 'Their goals', html: safeGoals, preserveWhitespace: true }) : '') +
    spacer(18) +
    note(`Submitted ${submittedDate} (AEST)`) +
    spacer(6) +
    note('Reply directly to this email to respond to the applicant.');
  return renderBrandEmail({
    title: 'New partner application',
    preheader: `New partner application — ${safeBusinessName}`,
    contentHtml: content,
  });
}

/**
 * Create HTML email template for login code (passwordless sign-in)
 */
export function createLoginCodeEmailTemplate(userName: string, loginCode: string, expiryMinutes: number = 15): string {
  const safeUserName = escapeHtml(userName || 'User');
  const safeCode = escapeHtml(loginCode);
  const content =
    chip('Secure sign-in') +
    spacer(16) +
    heading(`G'day ${safeUserName},<br/>here's your code`) +
    spacer(16) +
    lede('Use the one-time code below to sign in to your Tools Australia account.') +
    spacer(28) +
    codeBox({
      label: 'Your sign-in code',
      code: safeCode,
      caption: `Expires in ${expiryMinutes} minutes · never share it with anyone.`,
    }) +
    spacer(20) +
    note("Didn't try to sign in? You can safely ignore this email.");
  return renderBrandEmail({
    title: `Your sign-in code: ${safeCode}`,
    preheader: `Your Tools Australia sign-in code is ${safeCode}.`,
    contentHtml: content,
  });
}

/**
 * Create HTML email template for admin replies to contact/partner submissions
 */
export function createAdminReplyEmailTemplate(
  submitterName: string,
  adminMessage: string,
  submissionType: 'contact' | 'partner' = 'contact'
): string {
  const safeName = escapeHtml(submitterName);
  // adminMessage may be HTML from the RichTextEditor (Tiptap output is safe); otherwise escape it.
  const messageHtml =
    typeof adminMessage === 'string' && adminMessage.includes('<') && adminMessage.includes('>')
      ? adminMessage
      : escapeHtmlPreserveNewlines(adminMessage);
  const typeLabel = submissionType === 'partner' ? 'Partner application' : 'Contact inquiry';
  const content =
    bodyHeading(`Hi ${safeName},`) +
    bodyText(messageHtml) +
    spacer(24) +
    bodyText('Best regards,<br/><span style="color:#dc2626;font-weight:700;">The Tools Australia Team</span>');
  return renderBrandEmail({
    title: `Reply to your ${typeLabel.toLowerCase()}`,
    preheader: `The Tools Australia team has replied to your ${typeLabel.toLowerCase()}.`,
    contentHtml: content,
  });
}

/**
 * Create HTML email template for mini draw 100% capacity notification
 */
export function createMiniDrawFullCapacityTemplate(data: {
  miniDrawName: string;
  prizeName: string;
  totalEntries: number;
  minimumEntries: number;
  adminUrl: string;
  notifiedAt: Date;
}): string {
  const safeName = escapeHtml(data.miniDrawName);
  const safePrize = escapeHtml(data.prizeName);
  const notifiedDate = new Date(data.notifiedAt).toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Sydney',
  });
  const adminLink = `${data.adminUrl}/admin/mini-draws`;
  const content =
    chip('Mini draw at 100%') +
    spacer(16) +
    heading('Ready to draw<br/>a winner') +
    spacer(16) +
    lede(`<strong>${safeName}</strong> has hit 100% capacity and is ready for winner selection.`) +
    spacer(24) +
    infoTable([
      { label: 'Prize', value: safePrize },
      { label: 'Entries', value: `${data.totalEntries} / ${data.minimumEntries}` },
      { label: 'Reached', value: `${notifiedDate} (AEST)` },
    ]) +
    spacer(28) +
    button({ href: adminLink, label: 'Open Mini Draws', variant: 'red' }) +
    spacer(18) +
    note('This is an automated ops alert for the Tools Australia team.');
  return renderBrandEmail({
    title: 'Mini draw at 100% capacity',
    preheader: `${safeName} is full and ready for winner selection.`,
    contentHtml: content,
  });
}

/**
 * Create HTML email template for a major-draw winner.
 * Sent to the winning member only (see emailService.sendWinnerEmail).
 */
export function createWinnerEmailTemplate(firstName: string, prizeName: string, winnersUrl: string): string {
  const safeName = escapeHtml(firstName || 'mate');
  const safePrize = escapeHtml(prizeName || 'your prize');
  const content =
    chip("It's official", '#c8992f') +
    spacer(14) +
    heading('YOU<br/>WON!', { variant: 'hero', color: '#ee0000' }) +
    spacer(18) +
    lede(
      `Strap in, ${safeName} — your name was drawn live on Facebook and independently verified by randomdraws.com.au. This is the real deal.`
    ) +
    spacer(26) +
    prizePanel({ label: 'Your prize', value: safePrize }) +
    spacer(28) +
    button({ href: winnersUrl, label: "See the Winners' Hall of Fame", variant: 'gold', width: 340 }) +
    spacer(20) +
    note(
      'Our team will be in touch to verify your win and arrange delivery — your power-tool + storage combo, or $10,000 tax-free cash. Your call.'
    );
  return renderBrandEmail({
    title: 'You won!',
    preheader: `It's official — you won ${safePrize}.`,
    contentHtml: content,
  });
}

/**
 * Create HTML email template for a referral reward.
 * Sent to BOTH the referrer and the referred friend (see emailService.sendReferralRewardEmail).
 * `recipientName` is the person receiving this copy; `friendName` is the other party.
 */
export function createReferralRewardEmailTemplate(
  recipientName: string,
  friendName: string,
  entriesEarned: number,
  ctaUrl: string
): string {
  const safeName = escapeHtml(recipientName || 'mate');
  const safeFriend = escapeHtml(friendName || 'your mate');
  const entries = Number.isFinite(entriesEarned) ? entriesEarned : 0;
  const content =
    chip("Mate's rates") +
    spacer(16) +
    heading('Nice one — your<br/>mate signed up') +
    spacer(16) +
    lede(
      `${safeFriend} made their first purchase with your referral code, ${safeName}. You both just scored free entries, straight into the current major draw.`
    ) +
    spacer(26) +
    entriesCallout({
      label: 'Free entries for you',
      value: `+${entries}`,
      caption: `${safeFriend} got the same — that's how we do it.`,
    }) +
    spacer(28) +
    button({ href: ctaUrl, label: 'View My Entries', variant: 'red' }) +
    spacer(22) +
    note('Keep them coming — free entries for every mate who joins.');
  return renderBrandEmail({
    title: 'Referral reward earned',
    preheader: `You and ${safeFriend} both scored ${entries} free entries.`,
    contentHtml: content,
  });
}

/**
 * The supplier identity an Australian tax invoice has to name.
 *
 * A supplier must give a proof of transaction for any sale over $75, and on
 * request below it. A document is only a *tax invoice* if it is identifiable as
 * one and carries the seller's identity and ABN — without those, a business
 * buyer cannot claim the GST it already shows. Kept next to the one template that
 * needs it; the wider licence/notification identity lives in
 * `src/constants/legal.ts`, which does not yet hold the entity or the ABN.
 */
const TAX_INVOICE_SUPPLIER = {
  legalName: 'Tools Australia Pty Ltd',
  abn: '54 690 397 061',
} as const;

/**
 * Order confirmation for a merchandise purchase — and the customer's invoice.
 *
 * WORDING (2026-08-21): the customer-facing strings say "Order confirmed" and
 * "Invoice", not "Tax invoice", at the owner's direction. Nothing about the
 * DOCUMENT changed — the supplier identity, ABN, issue date and the GST line are all
 * still here, and those are what let it serve as a tax invoice. Only the label moved.
 *
 * Sent from the Stripe webhook once the order is actually paid — never from the
 * checkout page, which a customer can leave before the payment settles.
 *
 * This is the ONLY document the customer gets, so it has to be all three things
 * at once: confirmation, receipt and tax invoice. That is why the supplier block
 * below is not decoration — drop it and the GST line becomes unclaimable.
 *
 * `freeEntries` is rendered ONLY when > 0. Merchandise ships with entries switched
 * off pending a permit variation, and a "0 free entries" line would state a promise
 * we are not making. Per CLAUDE.md rule 11 entries are a free INCLUSION with the
 * garment — never sold, never priced per unit — so this says "includes", and there
 * is no per-entry figure anywhere in it.
 */
export function createShopOrderConfirmationTemplate(params: {
  firstName: string;
  orderNumber: string;
  items: { name: string; variant?: string; quantity: number; lineTotal: string }[];
  subtotal: string;
  discount?: string;
  shipping: string;
  total: string;
  gst: string;
  freeEntries?: number;
  shippingAddress: string;
  orderUrl: string;
  /** Date the invoice was issued. Defaults to now — see below. */
  issuedAt?: Date | string;
}): string {
  const safeName = escapeHtml(params.firstName || 'mate');
  const safeOrder = escapeHtml(params.orderNumber);

  // A tax invoice must show the date it was issued. This email IS the invoice and
  // is rendered at the moment it goes out, so "now" is the accurate default; a
  // caller re-sending an old order should pass that order's own date instead.
  const issuedDate = new Date(params.issuedAt ?? Date.now()).toLocaleDateString('en-AU', {
    dateStyle: 'medium',
    timeZone: 'Australia/Sydney',
  });

  const itemLines = params.items.map((i) => ({
    name: escapeHtml(i.name),
    variant: i.variant ? escapeHtml(i.variant) : undefined,
    quantity: i.quantity,
    amount: escapeHtml(i.lineTotal),
  }));

  const moneyRows = [
    { label: 'Subtotal', value: escapeHtml(params.subtotal) },
    ...(params.discount ? [{ label: 'Member discount', value: escapeHtml(params.discount) }] : []),
    { label: 'Delivery', value: escapeHtml(params.shipping) },
    { label: 'Total paid', value: escapeHtml(params.total), emphasis: true },
    // Australian tax invoices must show the GST component. It is INSIDE the total,
    // never added to it.
    { label: 'Includes GST', value: escapeHtml(params.gst) },
  ];

  const content =
    chip('Order confirmed') +
    spacer(14) +
    heading(`Thanks, ${safeName}`) +
    spacer(16) +
    lede(
      `We've got your order <strong>${safeOrder}</strong> and it's on its way to being made. Your items are printed to order, so give us a little time before they ship.`
    ) +
    spacer(24) +
    bodyHeading('Invoice') +
    infoTable([
      { label: 'Supplier', value: TAX_INVOICE_SUPPLIER.legalName },
      { label: 'ABN', value: TAX_INVOICE_SUPPLIER.abn },
      { label: 'Order number', value: safeOrder },
      { label: 'Date issued', value: issuedDate },
    ]) +
    spacer(22) +
    bodyHeading('What you ordered') +
    // Two tables, not one. Line items and money totals are different kinds of row
    // and were sharing a component that could only be right for one of them.
    lineItemsTable(itemLines) +
    spacer(10) +
    infoTable(moneyRows) +
    spacer(22) +
    (params.freeEntries && params.freeEntries > 0
      ? entriesCallout({
          label: 'Included with your order',
          value: `${params.freeEntries} free ${params.freeEntries === 1 ? 'entry' : 'entries'}`,
          caption: "Into this month's major prize draw — already credited to your account.",
        }) + spacer(22)
      : '') +
    bodyHeading('Delivering to') +
    // The caller joins the address with newlines, and plain escapeHtml drops them —
    // which collapsed name, street, suburb and country onto one run-on line on the
    // document a customer may have to hand to their bookkeeper.
    bodyText(escapeHtmlPreserveNewlines(params.shippingAddress)) +
    spacer(24) +
    button({ href: params.orderUrl, label: 'View your order', variant: 'red', width: 260 }) +
    spacer(18) +
    // This promise is kept by `sendShopOrderShipped`, which fires the one time an
    // order crosses into "shipped". It was cut once, while nothing sent that email —
    // so if the dispatch notice is ever removed, cut this sentence with it. A
    // customer waiting on an email that never arrives is a support ticket.
    //
    // It promises the email, NOT a tracking number: an order can be marked shipped
    // with no tracking, and the dispatch notice omits the number when there is none.
    note(
      "We'll email you when it ships. You can follow your order any time under My Account too — if anything looks wrong, reply to this email and we'll sort it."
    );

  return renderBrandEmail({
    title: `Order confirmed — ${safeOrder}`,
    preheader: `Order ${safeOrder} confirmed — we're getting it made. Your invoice is inside.`,
    contentHtml: content,
  });
}

/**
 * Dispatch notice for a merchandise order.
 *
 * The confirmation email used to promise "we'll email you when it ships" and that
 * line had to be cut, because nothing sent one. This is that email, so the promise
 * can be made again truthfully.
 *
 * Deliberately NOT a second invoice. No totals, no GST, no entries — the
 * confirmation is the tax invoice and the only place any of that belongs. A dollar
 * figure on a dispatch notice reads as a second charge.
 *
 * `trackingNumber` is OPTIONAL and its row is omitted entirely when absent: the
 * admin can mark an order shipped without one, and an empty "Tracking: —" row
 * invites the exact reply it was meant to prevent. Nothing here links to a carrier
 * either — an order stores a bare number with no carrier beside it, so a tracking
 * URL would be a guess. My Account shows the same bare number this does.
 */
export function createShopOrderShippedTemplate(params: {
  firstName: string;
  orderNumber: string;
  items: { name: string; variant?: string; quantity: number }[];
  trackingNumber?: string;
  shippingAddress: string;
  orderUrl: string;
}): string {
  const safeName = escapeHtml(params.firstName || 'mate');
  const safeOrder = escapeHtml(params.orderNumber);
  const tracking = params.trackingNumber?.trim();

  const itemLines = params.items.map((i) => ({
    name: escapeHtml(i.name),
    variant: i.variant ? escapeHtml(i.variant) : undefined,
    quantity: i.quantity,
    // Deliberately blank, not a price: the confirmation is the invoice, and a
    // dollar figure on a dispatch notice reads as a second charge.
    amount: '',
  }));

  const content =
    // "On its way" is the word My Account already puts on a shipped order. Two
    // names for one state is how a customer ends up asking whether "dispatched"
    // and "on its way" are different things.
    chip('On its way') +
    spacer(14) +
    heading(`Packed and shipped, ${safeName}`) +
    spacer(16) +
    lede(
      `Order <strong>${safeOrder}</strong> has been dispatched and is on its way to you.`
    ) +
    spacer(24) +
    bodyHeading("What's on its way") +
    lineItemsTable(itemLines) +
    spacer(10) +
    infoTable([
      { label: 'Order number', value: safeOrder },
      ...(tracking ? [{ label: 'Tracking number', value: escapeHtml(tracking) }] : []),
    ]) +
    spacer(22) +
    bodyHeading('Delivering to') +
    // The caller joins the address with newlines, and plain escapeHtml drops them —
    // which would collapse name, street, suburb and country onto one run-on line.
    bodyText(escapeHtmlPreserveNewlines(params.shippingAddress)) +
    spacer(24) +
    button({ href: params.orderUrl, label: 'View your orders', variant: 'red', width: 260 }) +
    spacer(18) +
    note(
      tracking
        ? "A tracking number can take a day or so to start updating after the parcel is collected. It's on your order under My Account too. If anything looks wrong, reply to this email and we'll sort it."
        : "Your order stays under My Account any time. If anything looks wrong, reply to this email and we'll sort it."
    );

  return renderBrandEmail({
    title: `Your order ${safeOrder} is on its way`,
    preheader: tracking
      ? `Order ${safeOrder} has shipped — your tracking number is inside.`
      : `Order ${safeOrder} has shipped and is on its way to you.`,
    contentHtml: content,
  });
}

/**
 * A merchandise order that was cancelled and refunded.
 *
 * WHY THIS EXISTS: stock is taken AFTER payment, because a print-to-order catalogue
 * mostly has none to take. That makes "paid, but we cannot supply it" a real branch —
 * `finalizeShopOrder` refunds and marks the order `cancelled`. Until this template,
 * that branch sent NOTHING: the customer paid, watched the money leave, and heard
 * nothing at all. The same silence applied to a staff-initiated refund.
 *
 * Deliberately money-light. It states that a refund was ISSUED, never that it has
 * landed — `finalizeShopOrder` wraps `stripe.refunds.create` in a catch that only
 * logs and marks the order cancelled regardless, so the refund is the intent and not
 * a guarantee. Telling someone their money "has been returned" when the call failed
 * is worse than telling them it is on its way.
 */
export function createShopOrderRefundedTemplate(params: {
  firstName: string;
  orderNumber: string;
  items: { name: string; variant?: string; quantity: number }[];
  refundAmount: string;
  /** Why it was cancelled, in the customer's terms. Keep it short and plain. */
  reason: string;
  orderUrl: string;
  supportEmail: string;
}): string {
  const safeName = escapeHtml(params.firstName || 'mate');
  const safeOrder = escapeHtml(params.orderNumber);

  const itemLines = params.items.map((i) => ({
    name: escapeHtml(i.name),
    variant: i.variant ? escapeHtml(i.variant) : undefined,
    quantity: i.quantity,
    // No per-line money: the refund is quoted once, as a total, in the lede above.
    // Repeating figures beside each line invites the reader to add them up and
    // arrive at a different number.
    amount: '',
  }));

  const content =
    chip('Cancelled') +
    spacer(14) +
    heading(`We've refunded this one, ${safeName}`) +
    spacer(16) +
    lede(
      `Order <strong>${safeOrder}</strong> has been cancelled and a refund of ` +
        `<strong>${escapeHtml(params.refundAmount)}</strong> has been issued.`
    ) +
    spacer(24) +
    bodyHeading('Why') +
    bodyText(escapeHtml(params.reason)) +
    spacer(22) +
    bodyHeading("What was on the order") +
    lineItemsTable(itemLines) +
    spacer(10) +
    infoTable([{ label: 'Order number', value: safeOrder }]) +
    spacer(24) +
    button({ href: params.orderUrl, label: 'View your orders', variant: 'red', width: 260 }) +
    spacer(18) +
    note(
      `Refunds usually take a few business days to appear on your statement, depending on your bank. ` +
        `If it hasn't turned up after that, reply to this email or contact us at ${escapeHtml(params.supportEmail)} and we'll chase it up.`
    );

  return renderBrandEmail({
    title: `Order ${safeOrder} cancelled and refunded`,
    preheader: `We couldn't fulfil order ${safeOrder}, so we've refunded it.`,
    contentHtml: content,
  });
}
