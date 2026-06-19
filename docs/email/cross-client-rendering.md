# Cross-client HTML email rendering — build reference

> Build-ready reference for hand-building / hardening the Tools Australia email templates so they
> render correctly across Gmail, Apple Mail, Outlook (classic + new), Yahoo/AOL, Samsung, all
> devices, and dark mode. Synthesized from primary sources (caniemail.com, Litmus, Email on Acid,
> Campaign Monitor, Cerberus, hteumeuleu email-bugs, official Gmail/Apple/Microsoft/Klaviyo/SendGrid
> docs) in June 2026. Pair with [architecture.md](./architecture.md) (send paths) and
> [rules.md](./rules.md) (SendGrid = transactional, Klaviyo = marketing).

## TL;DR — the decisions

- **Authoring:** keep templates as **source-of-truth HTML in the repo**, built with a framework that
  emits Outlook-safe table HTML. **MJML** is the recommended default (most battle-tested, easiest for
  a small team to edit safely; emits ghost tables + inlining by design). **Maizzle** is the alternative
  if we want Tailwind + raw-HTML control. Hand-coding raw tables is the *fallback*, not the default —
  but the patterns below let us harden hand-authored / Claude-Design HTML directly when needed.
- **Inlining:** neither **SendGrid** nor **Klaviyo** reliably auto-inlines. Run a **juice** pass at
  build (inline base styles; keep `@media` / `:hover` / dark-mode in `<head>`).
- **Layout:** table-based, `role="presentation"`, **600px** content width, **fluid-hybrid ("spongy")**
  so it stacks on mobile *without* media queries; media queries are enhancement only.
- **The one rule that prevents most disasters:** **inline every load-bearing style.** Treat `<head><style>`
  as progressive enhancement that can vanish entirely.
- **Dark mode:** design an **inversion-tolerant palette** first; layer `prefers-color-scheme` +
  `[data-ogsc]` as enhancement. Never depend on dark-mode CSS — Gmail + Outlook Windows ignore it.
- **ESP merge layer is thin and per-ESP:** Klaviyo = Django (`{{ }}` / `{% %}`, **required `{% unsubscribe %}`**),
  SendGrid = Handlebars (`{{ }}` escaped / `{{{ }}}` raw, `{{#if}}`/`{{#each}}`). Don't share logic verbatim.

## The non-negotiables (ranked by how badly they break things)

1. **Embedded `<style>` is unreliable end-to-end.** Gmail drops the *entire* block on any parse error
   (a nested @-rule — e.g. `@font-face`/`@viewport` inside `@media`) or if cumulative `<style>` > ~16KB.
   GANGA (Gmail app + non-Google account) and Yahoo Android ignore `<head>` styles completely. Forwarding
   and some ISPs strip it. → **Inline all core styling; keep `@media`/`:hover`/dark-mode in `<head>` only;
   keep all @-rules flat; keep `<style>` well under 16KB.**
2. **Outlook Windows (Word engine) ignores `div` width/padding/margin, `max-width`, float, flex, grid.**
   → Tables for structure, widths as **HTML attributes**, and an `[if mso]` **ghost table** supplies the
   width for every fluid container + multi-column row.
3. **Gmail clips the final email at ~102KB** (measured *after* the ESP injects tracking/merge/footer).
   Clipped content (incl. a bottom tracking pixel / unsubscribe) disappears. → Budget template to **~80KB**,
   minify, and put the **open pixel + unsubscribe high** in the body.
4. **Dark mode has no universal technique.** Gmail + Outlook Windows force-invert and ignore sender intent;
   pure `#000`/`#fff` and dark-on-transparent logos break worst. → inversion-tolerant palette + haloed logo.
5. **Outlook 2007–2013 high-DPI (125%/150%) scales images past their declared size.** → `OfficeDocumentSettings`
   `PixelsPerInch:96` + `AllowPNG` conditional, and image `width`/`height` as HTML attributes.
6. **Apple Mail Privacy Protection** proxy-prefetches all images → opens inflate toward ~100%, open-time/IP
   meaningless. → base KPIs on clicks/conversions; no open-triggered logic or live countdowns for that cohort.
7. **Yahoo/AOL mangle media queries** (rewrite to `@media(_filtered_a)`, single filter only, `height`→`min-height`,
   drop CSS under comments; Yahoo Android only reads `<style>` in `<body>`). → base layout must work with no media query.
8. **Inline-block hybrid columns leak whitespace gaps** → `font-size:0;line-height:0` on the wrapper,
   `mso-table-lspace/rspace:0pt`, `margin:0 -1px` on column divs (Cerberus trick).
9. **ESPs don't auto-inline; Klaviyo sanitizes** (strips JS, replaces unsupported elements with `<span>`).
   Outlook also stretches cells via default line-height → `mso-line-height-rule:exactly` before `line-height` on block elements.

## Canonical skeleton

### `<head>`

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"
      xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <!-- Dark-mode opt-in: ONLY include if shipping a full dark theme (otherwise omit or use "light only") -->
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title></title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings>
      <o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body  { margin:0 !important; padding:0 !important; width:100% !important; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img   { border:0; outline:none; line-height:100%; -ms-interpolation-mode:bicubic; display:block; }
    /* All @-rules FLAT — never nest @ inside @ (Gmail nukes the whole block). Keep this block < 16KB. */
    @media only screen and (max-width:600px) {
      .container  { width:100% !important; }
      .stack      { display:block !important; width:100% !important; max-width:100% !important; }
      .sm-px      { padding-left:20px !important; padding-right:20px !important; }
      .sm-h1      { font-size:24px !important; line-height:30px !important; }
      .btn        { width:100% !important; }
    }
    /* dark-mode rules go here too (see Dark mode section) — un-inlinable by definition */
  </style>
</head>
```

Notes: XHTML 1.0 Transitional is the conservative default but the **doctype is a no-op in Outlook** —
never expect it to "fix" Outlook. `X-UA-Compatible` is dead; omit it. `format-detection` only matters if
the email contains phone/date/address text. **Only opt into dark mode if you ship a real dark theme** —
opting in with no dark styles can make Apple Mail look *worse*.

### `<body>` — preheader + wrapper + ghost table

```html
<body style="margin:0; padding:0; word-spacing:normal;">
  <!-- Preheader (hidden, padded so following copy doesn't leak into the inbox preview) -->
  <div style="display:none; max-height:0; max-width:0; overflow:hidden; mso-hide:all;
              font-size:1px; line-height:1px; color:#f9fafb; opacity:0;">
    Preview text here.
    &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>
  <!-- Open pixel + unsubscribe should live HIGH so Gmail clipping never hides them -->

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;">
    <tr>
      <td align="center" style="padding:32px 10px; mso-line-height-rule:exactly;">
        <!--[if mso]><table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <div class="container" style="max-width:600px; margin:0 auto;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="width:100%; max-width:600px; background-color:#ffffff; border-radius:12px; overflow:hidden;">
            <tr>
              <td style="padding:32px; mso-line-height-rule:exactly; line-height:24px;
                         font-family:'Poppins','Helvetica Neue',Arial,sans-serif; font-size:16px; color:#111827;">
                <!-- content -->
              </td>
            </tr>
          </table>
        </div>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
```

## Layout & responsive (fluid hybrid)

- ~600px content width (the durable convention; fits Outlook/Apple preview panes with no scroll).
- **Outlook ignores `max-width`** → the `[if mso]` ghost table is the only thing giving Outlook a width.
- Multi-column rows: ghost `<table>`/`<td width=N>` for Outlook **+** sibling `display:inline-block;
  width:100%; max-width:Npx; vertical-align:top` divs that wrap to one column with **no media query**.

```html
<td style="font-size:0; line-height:0; mso-table-lspace:0pt; mso-table-rspace:0pt;">
  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top" width="300"><![endif]-->
  <div class="stack" style="display:inline-block; width:100%; max-width:300px; min-width:220px; vertical-align:top; margin:0 -1px; font-size:16px;">
    <!-- Column 1 -->
  </div>
  <!--[if mso]></td><td valign="top" width="300"><![endif]-->
  <div class="stack" style="display:inline-block; width:100%; max-width:300px; min-width:220px; vertical-align:top; margin:0 -1px; font-size:16px;">
    <!-- Column 2 -->
  </div>
  <!--[if mso]></td></tr></table><![endif]-->
</td>
```

## Bulletproof button (TA red gradient)

Outlook ignores `border-radius` and won't pad an `<a>` → VML `v:roundrect` for Outlook + overlay `<a>` for
everyone else. Keep the VML `width`/`height` **in sync** with the `<a>`. Outlook can't do the gradient — it
gets the solid `fillcolor` (use `#dc2626`); modern clients get the `linear-gradient(135deg,#dc2626,#b91c1c)`.

```html
<div>
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
               href="{{ctaUrl}}" style="height:48px;v-text-anchor:middle;width:240px;"
               arcsize="17%" stroke="f" fillcolor="#dc2626">
    <w:anchorlock/>
    <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;mso-text-raise:1px;">
      Enter the draw
    </center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-- -->
  <a class="btn" href="{{ctaUrl}}"
     style="display:inline-block; background:#dc2626;
            background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%);
            color:#ffffff; font-family:'Poppins','Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:700;
            line-height:48px; text-align:center; text-decoration:none; width:240px; border-radius:8px;
            -webkit-text-size-adjust:none;">
    Enter the draw
  </a>
  <!--<![endif]-->
</div>
```

## Fonts, images, accessibility

- **Web fonts are enhancement only** (~24% client support — Apple Mail/iOS yes; Outlook Windows, Gmail,
  Outlook.com no). The TA brand fonts (Poppins headings, Inter body) **will not load in most clients** — the
  fallback stack must look good on its own. Stack: `'Poppins','Helvetica Neue',Arial,sans-serif` /
  `'Inter','Helvetica Neue',Arial,sans-serif`.
- Load the font inside `@media screen { @font-face {…} }` so **Outlook never tries to load it** (otherwise it
  can fall back to Times New Roman), and add an `[if mso]` block forcing the safe family:

```html
<style>
  @media screen {
    @font-face { font-family:'Poppins'; font-style:normal; font-weight:700; mso-font-alt:'Arial';
      src:url('https://fonts.gstatic.com/...woff2') format('woff2'); }
  }
</style>
<!--[if mso]>
<style type="text/css">
  body, table, td, p, a, h1, h2, h3 { font-family: Arial, sans-serif !important; }
</style>
<![endif]-->
```

- **Retina:** export at 2×, constrain with HTML `width` attribute **+** `style="width:Npx;height:auto;
  max-width:Npx;display:block;border:0"`. For fluid images set `width="600" style="width:100%;max-width:600px;
  height:auto"` and **omit the `height` attribute**. Outlook needs the `width` attribute or it draws the 2× asset full-size.
- **Images-off:** Outlook blocks remote images by default; always supply meaningful `alt` (empty `alt=""` +
  `role="presentation"` on decorative images), and put a `bgcolor` behind hero/image cells so a blocked image
  leaves a sane backdrop.
- **Background images** need `bgcolor` + VML (`v:rect`/`v:fill`, dimensions in **pt** = px × 0.75) for Outlook.
  Prefer to avoid critical text baked over a background image.
- **A11y:** `role="presentation"` on every layout table; `lang` on `<html>`; semantic `<h1>/<p>`; WCAG AA
  contrast (4.5:1 text); body ≥16px on mobile; line-height ≥1.5; CTA tap target ~44px; descriptive link text.

## Dark mode

Three client buckets — **design for the worst (forced inversion) first:** (1) no change (Gmail/Yahoo webmail);
(2) partial invert (Outlook.com/apps, Gmail Android); (3) full/forced invert (Outlook Windows 365, Windows
Mail, Gmail iOS, Samsung). Apple Mail honors `prefers-color-scheme` when present, force-inverts when not.

- **Palette first:** avoid pure `#000000`/`#ffffff` (use `#fffffe`/`#fafafa` and `#111827`/near-black). TA's
  **dark navy header gradient survives inversion well**; the red accents read on both light and dark. Give the
  white-text logo (transparent PNG) a subtle light halo/padding so it stays visible if a background inverts.
- **Enhancement layer** (only if shipping a real dark theme):

```html
<style>
  @media (prefers-color-scheme: dark) {
    .bg:not([class^="x_"])  { background-color:#0a0a0a !important; }
    .surface:not([class^="x_"]) { background-color:#171717 !important; }
    .txt:not([class^="x_"]) { color:#f5f5f5 !important; }
    .light-logo { display:none !important; }
    .dark-logo  { display:block !important; }
  }
  /* Outlook.com / Outlook apps — mirror via data attrs. NOTE: .class[data-ogsb] FAILS;
     you must target a child through a parent carrying the attribute. */
  [data-ogsb] .bg      { background-color:#0a0a0a !important; }
  [data-ogsc] .txt     { color:#f5f5f5 !important; }
  [data-ogsc] .light-logo { display:none !important; }
  [data-ogsc] .dark-logo  { display:block !important; }
</style>
```

Mark overrides `!important` (inline styles beat `<style>` after inlining). Don't add the color-scheme meta
tags unless you ship the dark block (or use `content="light only"` to opt out).

## Inlining & size budget

- Build step (juice): `applyStyleTags`, `removeStyleTags`, **`preserveMediaQueries`**, **`preservePseudos`**,
  `preserveImportant`. Result = base styles inlined, `@media`/`:hover`/dark-mode kept in `<head>`.
- Tag any `<style>` that must NOT be inlined with `data-embed` (juice leaves it).
- **Measure the SENT message** (after ESP injection), not the template: < 80KB safe, 80–100KB minify+retest,
  > 100KB Gmail clips. Avoid base64 images; minify; prune dead CSS.
- **The GANGA test:** confirm the email still reads correctly with the entire `<style>` block deleted.

## ESP specifics

### SendGrid (transactional)
- Two paths: **dynamic template** (`template_id` + `dynamic_template_data`, Handlebars) **or** raw pre-inlined
  HTML in the `content` `text/html` field. Today only `staff-invite` is wired and uses raw HTML loaded from
  disk with `{{PLACEHOLDER}}` `replaceAll` ([staff-invite.md](./staff-invite.md)).
- Handlebars: `{{var}}` escaped, **`{{{var}}}` raw HTML**, `{{#if}}/{{else}}/{{/if}}`, `{{#each}}`. `{{` can
  collide with literal CSS/JSON braces — watch for that.
- **Does not auto-inline** — pre-inline before upload/send.

### Klaviyo (marketing)
- Custom-HTML templates use **Django**: `{{ var|default:"x" }}`, `{% if %}`, and a **required `{% unsubscribe %}`**
  (import fails without it). The current orphaned root templates (invoice, renewal, payment-failed) are pasted
  into Klaviyo manually.
- Klaviyo **sanitizes**: strips all JS, replaces unsupported elements with `<span>`, dislikes attribute/`~`
  selectors, multiple `<center>`, single quotes in `font-family`. Media queries must be standard form.
- **Does not document auto-inlining** — pre-inline and verify the rendered source after import.

### Merge-tag portability
Both use `{{ }}` for variables but the **logic dialects differ** (Django vs Handlebars). Keep templates
logic-light; re-express the small amount of conditional/loop logic per ESP. Keep `{% unsubscribe %}` only in
the Klaviyo copy.

## Build checklist (per template)

1. Start from the skeleton above (XHTML doctype + `v`/`o` namespaces + `lang`).
2. Head meta set (charset, viewport, optional format-detection; drop X-UA-Compatible).
3. Dark-mode opt-in meta **only if** shipping a dark theme.
4. Outlook DPI conditional (`PixelsPerInch:96` + `AllowPNG`).
5. Head `<style>`: global resets, **flat** @-rules, < 16KB.
6. Hidden padded preheader as first `<body>` element.
7. Open pixel + unsubscribe **high** in the body.
8. Outer 100% table → centered `<td>` → `[if mso]` 600px ghost table → inner content table.
9. Multi-column rows = fluid-hybrid (ghost table + inline-block divs, font-size:0 wrapper).
10. Spacing as cell padding (not div/p margin); `mso-line-height-rule:exactly` before `line-height`.
11. Retina images (2× + constrained `width`/style); alt text; no base64.
12. Inversion-tolerant palette; haloed transparent logo.
13. If dark mode: `prefers-color-scheme` scoped `:not([class^="x_"])` + `[data-ogsc]/[data-ogsb]` mirror + logo swap; `!important`.
14. juice inlining pass (preserve media/pseudo/important).
15. Minify; measure **sent** HTML < 80KB; run the GANGA (no-`<style>`) test.
16. Per-ESP merge layer (Klaviyo Django + `{% unsubscribe %}`; SendGrid Handlebars).
17. QA: caniemail first, then seed inboxes (Gmail web/Android/**GANGA via IMAP**, Apple Mail macOS/iOS,
    Outlook **new + Outlook.com + classic Windows**, Yahoo), light **and** dark in each.

## Testing

- **caniemail.com** — free first-line support matrix; check before using any feature. Read the per-client
  *notes*, not just the colored cell (e.g. Gmail "supports" `@font-face`/`prefers-color-scheme` only as a
  sanitizer pass, not honoring intent).
- **Free rig:** real seed inboxes for the high-traffic clients + a free HTML/CSS checker (Mailtrap) + Mailtrap
  sandbox in staging/CI. **Email on Acid** (cheaper than post-acquisition Litmus) for periodic screenshot grids.

## Verify-live before relying on it (point-in-time / version-sensitive)

- New Outlook for Windows (Chromium) vs classic Word-engine **share for our actual list** — determines how much
  ghost-table/VML/PixelsPerInch machinery is load-bearing; pull from ESP client analytics.
- Whether `[data-ogsc]`/`prefers-color-scheme` now apply in **new Outlook**.
- Gmail dark mode: whether `prefers-color-scheme` is honored vs forced-inverted (per web/iOS/Android build).
- Gmail `<style>` cap (~16KB measured) and 102KB clip (and the disputed ~50KB mobile claim) — test real sends.
- Apple Mail: does an explicit non-pure bg prevent forced inversion of `#fff`/`#000`? Does color-scheme meta
  without dark styles trigger partial invert? Does `light only` still opt out?
- Klaviyo/SendGrid actual auto-inlining for **custom HTML** — import one and inspect rendered source.
- Yahoo/AOL media-query mangling status; Samsung color-scheme/`@font-face` on Microsoft accounts.
- Brittle hacks before shipping in long-lived templates: MSO text-fill gradient color-lock; second-`<head>`-in-`<body>` Gmail trick.

## Key sources

caniemail.com (+ hteumeuleu/caniemail & email-bugs issues) · Litmus blog (bulletproof buttons, web fonts,
retina, dark mode, accessibility, Outlook rendering, MPP) · Email on Acid (boilerplate, Outlook, Gmail 12-things,
DPI, dark mode, VML backgrounds, alt text) · Campaign Monitor (CSS/web-fonts/width guides) · Cerberus (hybrid
responsive) · tabular.email (`mso-line-height-rule`) · Microsoft Learn (new Outlook migration — classic Word
engine supported through ~2029, **not** 2026) · Postmark (MPP) · Suped (Gmail clipping) · official
Gmail/Klaviyo/SendGrid (Twilio) docs · MJML / Maizzle docs.
