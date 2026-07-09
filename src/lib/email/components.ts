/**
 * Tools Australia — shared email components (2026 design system).
 *
 * Reusable, email-client-safe building blocks for the SendGrid transactional
 * templates (verification, password reset, winner, referral, …) so the whole
 * set renders as one family. Mirrors the Claude Design handoff and the
 * cross-client rules in docs/email/cross-client-rendering.md:
 *  - table layout + role="presentation", all-inline styles, 600px container
 *  - bulletproof VML buttons for Outlook
 *  - mso Arial font fallback, web font only for non-Outlook
 *  - hidden padded preheader, light + dark mode via <head> classes
 *
 * The Klaviyo paste-ready HTML templates (invoice, renewals) live
 * as standalone files in email-templates/klaviyo/ and intentionally duplicate this
 * markup because they are pasted into Klaviyo. Keep the two visually in lockstep
 * when editing the header/footer.
 */

/** Public production logo — emails are viewed outside the app, so this must be an absolute URL. */
export const BRAND_LOGO_URL =
  'https://toolsaustralia.com.au/images/Tools%20Australia%20Logo/White-Text%20Logo.webp';

/** Shared <head> <style> block: resets + mobile (@600px) + dark mode. All @-rules kept flat for Gmail. */
const EMAIL_HEAD_STYLE = `
    body,table,td,p,a,h1,h2{margin:0;padding:0;}
    img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
    a{text-decoration:none;}
    body{width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    .num{font-variant-numeric:tabular-nums;}
    @media only screen and (max-width:600px){
      .container{width:100%!important;}
      .px{padding-left:22px!important;padding-right:22px!important;}
      .py{padding-top:30px!important;padding-bottom:32px!important;}
      .h1{font-size:29px!important;line-height:1.1!important;}
      .big{font-size:62px!important;}
      .won{font-size:62px!important;}
      .btn{width:100%!important;}
      .btn a{display:block!important;}
    }
    @media (prefers-color-scheme: dark){
      .page{background-color:#0a0a0a!important;}
      .card{background-color:#171717!important;border-color:#2e2e2e!important;}
      .t-dark{color:#f5f5f5!important;}
      .t-mut{color:#a3a3a3!important;}
      .surface2{background-color:#0f0f0f!important;border-color:#404040!important;}
      .footer{background-color:#0a0a0a!important;border-color:#2e2e2e!important;}
      .tableh{background-color:#0f0f0f!important;}
      .tabler{background-color:#171717!important;}
      .tabler-b{border-color:#262626!important;}
      .hairline{background-color:#2e2e2e!important;}
    }`;

/** Dark industrial header: logo + mono tagline + red bar + hazard stripe. Identical on every email. */
const BRAND_HEADER = `
        <tr>
          <td style="background:#0f172a;background:linear-gradient(135deg,#0f172a 0%,#111827 30%,#1f2937 60%,#0b1220 100%);text-align:center;padding:36px 24px 26px;">
            <img src="${BRAND_LOGO_URL}" width="150" alt="Tools Australia — Australia's biggest monthly tool giveaway" style="display:block;margin:0 auto 14px;max-width:150px;width:150px;height:auto;border:0;"/>
            <p style="margin:0;font-family:'SFMono-Regular',ui-monospace,Consolas,'Courier New',monospace;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#94a3b8;">Australia's Biggest Monthly Tool Giveaway</p>
          </td>
        </tr>
        <tr><td style="height:4px;background-color:#ee0000;line-height:4px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="height:6px;background-color:#0b1220;background-image:repeating-linear-gradient(135deg,#1f2937 0,#1f2937 7px,#0b1220 7px,#0b1220 14px);line-height:6px;font-size:0;">&nbsp;</td></tr>`;

const SUPPORT_EMAIL = 'support@toolsaustralia.com.au';

/** Footer: hazard rule, brand, support, socials, optional unsubscribe, mono trust line. (No postal address — per owner.) */
function renderFooter(unsubscribeUrl?: string): string {
  const unsubscribeLine = unsubscribeUrl
    ? `<p style="margin:0 0 10px;font-size:11px;line-height:1.6;color:#9ca3af;" class="t-mut"><a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a></p>`
    : '';
  return `
        <tr><td style="height:5px;background-color:#e5e7eb;background-image:repeating-linear-gradient(135deg,#e5e7eb 0,#e5e7eb 7px,#f9fafb 7px,#f9fafb 14px);line-height:5px;font-size:0;" class="hairline">&nbsp;</td></tr>
        <tr>
          <td class="footer px" style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:30px 32px 34px;text-align:center;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
            <p style="margin:0 0 6px;font-family:'Poppins','Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:800;letter-spacing:0.4px;color:#111827;text-transform:uppercase;" class="t-dark">Tools Australia</p>
            <p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:#6b7280;" class="t-mut">Need a hand? <a href="mailto:${SUPPORT_EMAIL}" style="color:#dc2626;font-weight:600;text-decoration:none;">${SUPPORT_EMAIL}</a></p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;"><tr>
              <td style="padding:0 5px;"><a href="https://www.facebook.com/toolsaust" target="_blank" rel="noopener" style="display:inline-block;width:36px;height:36px;background-color:#111827;border-radius:50%;"><img src="https://toolsaustralia.com.au/images/social/facebook.png" width="20" height="20" alt="Facebook" style="display:block;margin:8px auto;width:20px;height:20px;border:0;"/></a></td>
              <td style="padding:0 5px;"><a href="https://instagram.com/toolsaustralia" target="_blank" rel="noopener" style="display:inline-block;width:36px;height:36px;background-color:#111827;border-radius:50%;"><img src="https://toolsaustralia.com.au/images/social/instagram.png" width="20" height="20" alt="Instagram" style="display:block;margin:8px auto;width:20px;height:20px;border:0;"/></a></td>
              <td style="padding:0 5px;"><a href="https://www.tiktok.com/@toolsaustralia" target="_blank" rel="noopener" style="display:inline-block;width:36px;height:36px;background-color:#111827;border-radius:50%;"><img src="https://toolsaustralia.com.au/images/social/tiktok.png" width="20" height="20" alt="TikTok" style="display:block;margin:8px auto;width:20px;height:20px;border:0;"/></a></td>
            </tr></table>
            ${unsubscribeLine}
            <p style="margin:0;font-family:'SFMono-Regular',ui-monospace,Consolas,'Courier New',monospace;font-size:10.5px;line-height:1.7;letter-spacing:0.3px;color:#9ca3af;" class="t-mut">DRAWN LIVE ON FACEBOOK · 27TH MONTHLY · VERIFIED BY <a href="https://randomdraws.com.au" style="color:#9ca3af;text-decoration:underline;">RANDOMDRAWS.COM.AU</a></p>
          </td>
        </tr>`;
}

/**
 * Assemble a full brand email document.
 * @param contentHtml inner `<tr>` rows for the white content card (build with the helpers below).
 */
export function renderBrandEmail(opts: {
  title: string;
  preheader: string;
  contentHtml: string;
  unsubscribeUrl?: string;
}): string {
  const { title, preheader, contentHtml, unsubscribeUrl } = opts;
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="color-scheme" content="light dark"/>
  <meta name="supported-color-schemes" content="light dark"/>
  <title>${title}</title>
  <!--[if mso]><style type="text/css">body,table,td,a,p,h1,h2{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
  <!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700;800;900&display=swap" rel="stylesheet"><!--<![endif]-->
  <style>${EMAIL_HEAD_STYLE}
  </style>
</head>
<body class="page" style="margin:0;padding:0;background-color:#f9fafb;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f9fafb;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page" style="background-color:#f9fafb;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container card" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 34px rgba(15,23,42,0.10);">
        ${BRAND_HEADER}
        <tr><td class="px py" style="padding:40px 36px 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tbody>
${contentHtml}
          </tbody></table>
        </td></tr>
        ${renderFooter(unsubscribeUrl)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Content-row helpers — concatenate into `contentHtml`.               */
/* Callers must pass already-escaped data (use escapeHtml from utils). */
/* ------------------------------------------------------------------ */

/** Vertical spacer row. */
export function spacer(px: number): string {
  return `<tr><td style="height:${px}px;line-height:${px}px;font-size:0;">&nbsp;</td></tr>`;
}

/** Monospace eyebrow chip with a rotated diamond. */
export function chip(label: string, color: string = '#dc2626'): string {
  return `<tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr><td style="vertical-align:middle;padding-right:8px;"><div style="width:7px;height:7px;background-color:${color};transform:rotate(45deg);"></div></td><td style="vertical-align:middle;"><span style="font-family:'SFMono-Regular',ui-monospace,Consolas,'Courier New',monospace;font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:${color};">${label}</span></td></tr></table></td></tr>`;
}

/** Poppins headline. variant 'hero' = huge 900-weight (winner moment). */
export function heading(html: string, opts: { variant?: 'default' | 'hero'; color?: string } = {}): string {
  if (opts.variant === 'hero') {
    const color = opts.color ?? '#ee0000';
    return `<tr><td align="center"><h1 class="won t-dark" style="margin:0;font-family:'Poppins','Helvetica Neue',Arial,sans-serif;font-size:74px;font-weight:900;line-height:0.92;color:${color};text-align:center;letter-spacing:-2px;">${html}</h1></td></tr>`;
  }
  const color = opts.color ?? '#111827';
  return `<tr><td align="center"><h1 class="h1 t-dark" style="margin:0;font-family:'Poppins','Helvetica Neue',Arial,sans-serif;font-size:33px;font-weight:800;line-height:1.1;color:${color};text-align:center;letter-spacing:-0.6px;">${html}</h1></td></tr>`;
}

/** Centered body paragraph. */
export function lede(html: string): string {
  return `<tr><td align="center"><p class="t-mut" style="margin:0;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.65;color:#475569;text-align:center;">${html}</p></td></tr>`;
}

/** Small muted footnote paragraph. */
export function note(html: string): string {
  return `<tr><td align="center" style="padding-top:2px;"><p style="margin:0;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#6b7280;" class="t-mut">${html}</p></td></tr>`;
}

/** Hairline divider with a centered diamond. */
export function divider(): string {
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="hairline" style="height:1px;background-color:#e5e7eb;line-height:1px;font-size:0;">&nbsp;</td><td style="width:12px;padding:0 10px;"><div style="width:7px;height:7px;background-color:#ee0000;transform:rotate(45deg);margin:0 auto;"></div></td><td class="hairline" style="height:1px;background-color:#e5e7eb;line-height:1px;font-size:0;">&nbsp;</td></tr></table></td></tr>`;
}

/** Bulletproof CTA button (VML for Outlook + anchor for everyone else). */
export function button(opts: { href: string; label: string; variant?: 'red' | 'gold'; width?: number }): string {
  const gold = opts.variant === 'gold';
  const w = opts.width ?? 300;
  const bgcolor = gold ? '#cda23a' : '#dc2626';
  const gradient = gold
    ? 'linear-gradient(135deg,#e6c14d 0%,#c8992f 100%)'
    : 'linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)';
  const shadow = gold ? 'rgba(202,153,47,0.35)' : 'rgba(220,38,38,0.32)';
  const textColor = gold ? '#3a2c06' : '#ffffff';
  return `<tr><td align="center">
            <table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:4px auto 0;">
              <tr><td align="center" bgcolor="${bgcolor}" style="border-radius:8px;background:${gradient};box-shadow:0 6px 16px ${shadow};">
                <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${opts.href}" style="height:52px;v-text-anchor:middle;width:${w}px;" arcsize="16%" stroke="f" fillcolor="${bgcolor}"><w:anchorlock/><center style="color:${textColor};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${opts.label}<![endif]-->
                <a href="${opts.href}" style="display:inline-block;padding:16px 44px;font-family:'Poppins','Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:700;color:${textColor};text-decoration:none;border-radius:8px;letter-spacing:0.3px;mso-hide:all;">${opts.label}&nbsp;&nbsp;&rarr;</a>
                <!--[if mso]></center></v:roundrect><![endif]-->
              </td></tr>
            </table></td></tr>`;
}

/** Verification / login code panel — red-tinted box with a big mono code. */
export function codeBox(opts: { label: string; code: string; caption?: string }): string {
  const caption = opts.caption
    ? `<p style="margin:14px 0 0;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.55;color:#b91c1c;">${opts.caption}</p>`
    : '';
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0;"><tr><td class="surface2" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:28px 24px;text-align:center;">
                <p style="margin:0 0 12px;font-family:'SFMono-Regular',ui-monospace,Consolas,'Courier New',monospace;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#dc2626;">${opts.label}</p>
                <p style="margin:0;font-family:'SFMono-Regular',ui-monospace,Consolas,'Courier New',monospace;font-size:40px;font-weight:800;line-height:1.1;color:#dc2626;letter-spacing:10px;">${opts.code}</p>
                ${caption}
              </td></tr></table></td></tr>`;
}

/** Dark navy panel with a big brand-red number — used when free entries are earned. */
export function entriesCallout(opts: { label: string; value: string; caption?: string }): string {
  const caption = opts.caption
    ? `<p style="margin:14px 0 0;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.55;color:#94a3b8;">${opts.caption}</p>`
    : '';
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0;"><tr><td style="background:#0f172a;background:linear-gradient(135deg,#111827 0%,#0b1220 100%);border:1px solid #1f2937;border-radius:14px;padding:28px 24px;text-align:center;">
                <p style="margin:0 0 12px;font-family:'SFMono-Regular',ui-monospace,Consolas,'Courier New',monospace;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#fca5a5;">${opts.label}</p>
                <p class="big num" style="margin:0;font-family:'Poppins','Helvetica Neue',Arial,sans-serif;font-size:64px;font-weight:800;line-height:0.9;color:#ff4040;letter-spacing:-1px;">${opts.value}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;"><tr><td style="width:44px;height:3px;background-color:#ff4040;line-height:3px;font-size:0;border-radius:2px;">&nbsp;</td></tr></table>
                ${caption}
              </td></tr></table></td></tr>`;
}

/** Gold-accented dark panel for the big moments — winner / reward. */
export function prizePanel(opts: { label: string; value: string }): string {
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0;"><tr><td style="background:#0f172a;background:linear-gradient(135deg,#111827 0%,#0b1220 100%);border:1px solid #1f2937;border-radius:14px;padding:28px 24px;text-align:center;">
                <p style="margin:0 0 10px;font-family:'SFMono-Regular',ui-monospace,Consolas,'Courier New',monospace;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#e6c14d;">${opts.label}</p>
                <p style="margin:0;font-family:'Poppins','Helvetica Neue',Arial,sans-serif;font-size:24px;font-weight:800;line-height:1.25;color:#ffffff;">${opts.value}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;"><tr><td style="width:44px;height:3px;background-color:#e6c14d;line-height:3px;font-size:0;border-radius:2px;">&nbsp;</td></tr></table>
              </td></tr></table></td></tr>`;
}

/** Red-tinted alert block with a "!" badge — payment failure / time-sensitive. */
export function alertBlock(opts: { title: string; body: string }): string {
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0;"><tr><td class="surface2" style="background-color:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:12px;padding:20px 20px 20px 18px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="vertical-align:top;padding-right:13px;"><span style="display:inline-block;width:28px;height:28px;border-radius:50%;background-color:#dc2626;color:#ffffff;font-family:'Poppins','Helvetica Neue',Arial,sans-serif;font-size:17px;font-weight:800;line-height:28px;text-align:center;">!</span></td>
                  <td style="vertical-align:top;">
                    <p style="margin:0 0 4px;font-family:'Poppins','Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:700;color:#b91c1c;">${opts.title}</p>
                    <p style="margin:0;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.55;color:#7f1d1d;" class="t-mut">${opts.body}</p>
                  </td>
                </tr></table>
              </td></tr></table></td></tr>`;
}

/** Mono-label / value rows in a bordered card (details + receipts). */
export function infoTable(rows: Array<{ label: string; value: string }>): string {
  const body = rows
    .map((r, i) => {
      const last = i === rows.length - 1;
      const border = last ? 'border-bottom:none;' : 'border-bottom:1px solid #f0f1f3;';
      return `<tr>
                  <td class="tabler tabler-b" style="padding:14px 18px;${border}font-family:'SFMono-Regular',ui-monospace,Consolas,'Courier New',monospace;font-size:10.5px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#94a3b8;background-color:#ffffff;width:42%;vertical-align:top;">${r.label}</td>
                  <td class="tabler tabler-b t-dark" style="padding:14px 18px;${border}font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:500;color:#111827;background-color:#ffffff;word-break:break-word;">${r.value}</td>
                </tr>`;
    })
    .join('');
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin:4px 0;"><tbody>${body}</tbody></table></td></tr>`;
}

/** Left-bordered box with a mono label — for a customer message, partner goals, etc. */
export function messageBlock(opts: { label: string; html: string; preserveWhitespace?: boolean }): string {
  const ws = opts.preserveWhitespace ? 'white-space:pre-wrap;' : '';
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0;"><tr><td class="surface2" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-left:4px solid #dc2626;border-radius:12px;padding:18px 20px;">
                <p style="margin:0 0 8px;font-family:'SFMono-Regular',ui-monospace,Consolas,'Courier New',monospace;font-size:10.5px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;">${opts.label}</p>
                <div style="font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.7;color:#1f2937;${ws}" class="t-dark">${opts.html}</div>
              </td></tr></table></td></tr>`;
}

/** Left-aligned rich-text body row (e.g. an admin reply message). */
export function bodyText(html: string): string {
  return `<tr><td style="font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.8;color:#1f2937;" class="t-dark">${html}</td></tr>`;
}

/** Left-aligned heading row (for reply-style emails). */
export function bodyHeading(html: string): string {
  return `<tr><td style="padding-bottom:14px;"><h2 style="margin:0;font-family:'Poppins','Helvetica Neue',Arial,sans-serif;font-size:22px;font-weight:800;color:#111827;letter-spacing:-0.3px;" class="t-dark">${html}</h2></td></tr>`;
}
