# Email domain

Transactional email via SendGrid; HTML templates at repo root; SMS via separate provider; newsletter integration with Klaviyo (Klaviyo lives in [tracking](../tracking/) for marketing flows).

## Index

- [architecture.md](./architecture.md) — providers, template structure, send paths
- [frontend.md](./frontend.md) — `/email-preview/` page, components/email-preview/
- [backend.md](./backend.md) — `lib/email`, `lib/sms`, template rendering
- [api.md](./api.md) — `/api/newsletter/`
- [rules.md](./rules.md) — provider split (SendGrid transactional, Klaviyo marketing)
- [patterns.md](./patterns.md) — template lockstep with code
- [gotchas.md](./gotchas.md) — preview workflow, root template files
- [cross-client-rendering.md](./cross-client-rendering.md) — build reference for cross-client/dark-mode-safe HTML email (Gmail/Outlook/Apple/Yahoo); use when authoring or hardening templates
- [models.md](./models.md) — _N/A — emails aren't persisted; uses User for recipients_
- [testing.md](./testing.md) — `docs/SENDGRID_TESTING_GUIDE.md`
- [staff-invite.md](./staff-invite.md) — staff invite template + `sendStaffInviteEmail` helper

## Migrated from

- `docs/EMAIL_MODULE.md` → architecture.md
- `docs/SENDGRID_TESTING_GUIDE.md` → testing.md

> _TODO: read both root files and merge._

## Shop order confirmation (2026-08-17)

`createShopOrderConfirmationTemplate` + `sendShopOrderConfirmation` — the receipt for a paid
merchandise order. **Before this, a customer paid and received nothing at all.**

Sent from the webhook once Stripe confirms, never from the checkout page (which a customer can
close before payment settles), and **after** the entry grant so it can state the entries actually
received. Sending it earlier read `order.entriesGranted` before it was set and silently omitted
the entries block — invisible while merchandise ships at 0 entries, and wrong the day the permit
lands.

Best-effort by contract: it never throws and the caller catches. An SMTP outage must not fail the
webhook, because failing it retries the **entire** fulfilment — stock, cart clear, entry grant —
and a customer would rather have a missing email than a double-printed garment.

**Rule 11.** The entries block renders only when the count is above zero, so a 0-entry order never
reads "0 free entries". Wording is "includes N free entries" — a free inclusion with the garment,
never sold and never priced per unit. There is no per-entry figure anywhere in it.

Recipient is the address typed at **checkout** first, falling back to the account email — a
customer may deliberately order to a different address than the one they signed up with. No
address at all is a loud `console.error`, because a paid customer receiving nothing is a support
ticket that starts with "I never got a confirmation".

GST is shown as a line inside the total ("Includes GST"), never added — an Australian tax invoice
has to show the component.

## Shop order emails (2026-08-21)

Three, all best-effort by contract — the caller catches and the sender never throws. An
SMTP outage must never fail the shop webhook, because failing it retries the **whole**
fulfilment (stock, cart clear, entry grant), and a customer would rather have a missing
email than a double-printed garment.

| Email | Trigger | Sender |
| --- | --- | --- |
| Confirmation / tax invoice | paid order, after the entry grant | `sendShopOrderConfirmation` |
| Dispatched | an admin sets a tracking number, or moves the order to `shipped` | `sendShopOrderShipped` |
| Cancelled + refunded | stock lost after payment, **or** a full staff refund | `sendShopOrderRefunded` |

**The confirmation is sent exactly once, across webhook redeliveries.** `Order
.confirmationSentAt` is stamped only after a successful send, and the redelivery path
(`already_processed`) sends it when the stamp is unset. Before this, a webhook that died
between `markPaid` and the email left a paying customer with **no receipt and no way to
get one** — the redelivery returned early without re-sending, and nothing recorded that
it had never gone. Same shape as `entriesGranted`: absent must stay distinguishable from
done, or a lost send looks identical to a completed one.

**The refund email did not exist at all until 2026-08-21.** Stock is taken *after*
payment (a print-to-order catalogue mostly has none to take), so "paid, but we cannot
supply it" is a real branch — it refunded, marked the order `cancelled`, and returned in
silence. The customer paid, watched the money leave, and heard nothing. A staff refund
was equally silent.

That email says a refund **was issued**, never that it has landed: `finalizeShopOrder`
wraps `stripe.refunds.create` in a catch that only logs and marks the order cancelled
regardless, so the refund is the intent and not a guarantee. It is the same hedge the
order-history and success pages use for the same reason.

**Recipient rule** for all three: the address typed at checkout
(`order.shippingAddress.email`) wins, with the account email as fallback — a customer may
deliberately use a different address from the one on their account. A missing address is
logged loudly, because a paid customer receiving nothing is a support ticket that starts
with "I never got a confirmation".
