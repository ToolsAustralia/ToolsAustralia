/**
 * Shared inline CSS fragments for transactional emails.
 * Prefer these on elements that must render when <head> <style> is stripped (Gmail, Outlook, etc.).
 */

/** Primary CTA anchor */
export const PRIMARY_BUTTON_STYLE =
  'display:inline-block;background-color:#dc2626;background-image:linear-gradient(135deg,#dc2626,#ee0000);color:#ffffff !important;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:16px;line-height:1.25;mso-line-height-rule:exactly;';

export const MAILTO_LINK_STYLE = 'color:#dc2626;text-decoration:none;';

/** Wrapped verification / login code panel (no pseudo-elements) */
export const CODE_BOX_OUTER_STYLE =
  'background-color:#fef2f2;border:2px solid #fecaca;border-radius:12px;padding:30px;text-align:center;margin:30px 0;';

export const CODE_LABEL_STYLE =
  'font-size:14px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:1px;margin:0 0 15px 0;';

export const CODE_TEXT_STYLE =
  'font-size:36px;font-weight:800;color:#dc2626;letter-spacing:8px;font-family:SF Mono,Monaco,Consolas,Roboto Mono,monospace;margin:0;line-height:1.2;';

/** Amber security / notice callout */
export const CALLOUT_AMBER_BOX_STYLE =
  'background-color:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;padding:20px;margin:30px 0;';

export const CALLOUT_AMBER_TITLE_STYLE =
  'color:#92400e;font-size:16px;font-weight:700;margin:0 0 12px 0;';

export const CALLOUT_AMBER_UL_STYLE = 'margin:0;padding-left:20px;color:#92400e;';

export const CALLOUT_AMBER_LI_STYLE = 'margin:8px 0;font-size:14px;';

/** Password reset security block (slightly tighter top margin than generic callout) */
export const CALLOUT_AMBER_PASSWORD_RESET_STYLE =
  'background-color:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;padding:18px 18px 16px;margin:20px 0 0;';

/** Dark header title (white text) */
export const HEADER_TITLE_INLINE_STYLE =
  'margin:0;color:#ffffff;font-size:18px;font-weight:600;text-transform:uppercase;letter-spacing:1px;';

/** Logo: predictable size + spacing in Outlook */
export const LOGO_IMG_TAG_SUFFIX =
  ' width="200" style="max-width:200px;height:auto;display:block;margin:0 auto 16px auto;border:0;"';

/** Default paragraph / body for admin reply wrapper */
export const REPLY_BODY_WRAPPER_STYLE =
  "font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;color:#1f2937;line-height:1.8;margin:0 0 30px 0;";

/** Stacked label/value rows (contact & partner notifications) — no CSS Grid */
export const NOTIFICATION_FIELD_ROW_TD_STYLE =
  'padding:0 0 15px 0;border-bottom:1px solid #e5e7eb;';
export const NOTIFICATION_FIELD_LABEL_STYLE =
  'font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;';
export const NOTIFICATION_FIELD_VALUE_STYLE =
  'font-size:16px;color:#111827;font-weight:500;';
export const NOTIFICATION_MESSAGE_BOX_STYLE =
  'background-color:#f9fafb;border-left:4px solid #dc2626;padding:20px;border-radius:8px;margin:30px 0;';
export const NOTIFICATION_MESSAGE_LABEL_STYLE =
  'font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;';
export const NOTIFICATION_MESSAGE_CONTENT_STYLE =
  'font-size:15px;color:#1f2937;line-height:1.8;white-space:pre-wrap;';
export const NOTIFICATION_TIMESTAMP_STYLE =
  'font-size:13px;color:#6b7280;margin-top:30px;padding-top:20px;border-top:1px solid #e5e7eb;';
