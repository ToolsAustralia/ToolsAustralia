# Klaviyo paste-ready templates

Custom-HTML (CODE) templates to paste into the matching Klaviyo flow email. Edit here, then paste into Klaviyo. After pasting, **Klaviyo is the live source** (these files are the hardened, version-controlled copy).

**Before pasting:** every `{{ event.* }}` / `{{ person.* }}` must match the flow's **trigger-metric** event properties (event vars) or the **profile** (person vars), or it renders blank. Verify against the live account — see `docs/email/architecture.md` → "Klaviyo merge-field verification".

| File | Klaviyo flow | Trigger metric | Live template id | Editor |
|---|---|---|---|---|
| `invoice-email-template.html` | Invoice | Invoice Generated | `UeybxA` | **CODE** — paste directly |
| `subscription-renewal-email-template.html` | Membership Renewal | Subscription Renewed | `TLyiRY` | **CODE** — paste directly |
| `renewal-failed-email-template.html` | Failed Membership Renewal | Subscription Renewal Failed | _check in UI_ | _check in UI_ |
| `subscription-payment-failed-email-template.html` | Failed Membership Purchase | Subscription Payment Failed | _check in UI_ | _check in UI_ |

## How to paste

1. Open the flow → its email → check the editor type.
2. **CODE / Custom HTML** → replace the HTML with this file's contents.
3. **Drag-and-drop (`SYSTEM_DRAGGABLE`)** → you can't paste raw HTML; switch the message to a new **Custom HTML** template first, then paste.

> Note: the **winner** email is now sent via **SendGrid** (on winner selection), not Klaviyo — there's no Klaviyo winner template here. If a Klaviyo flow still triggers on `Major Draw Won`, disable it to avoid double-sending.
