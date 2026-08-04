# Vendor brand spec — Tools Australia Rewards portal

**Hand this page to iGoDirect.** It turns "apply our brand" from a judgement call into a
checklist they implement and we verify.

Today the portal carries our logo and our red and little else: a different nav model,
different type, different card language, and three inconsistent card treatments in one
scroll. That is what guessing produces. This page removes the guessing.

## The question to ask first

> **Which of the tokens below can Tools Australia set itself in your theming layer, without
> waiting on a release?**

They already theme the logo, the red, and a tenant hero image per client, so a theming layer
exists — we simply do not know how far it reaches. If it reaches colour and type tokens,
most of this spec needs no vendor release at all. Get that answer in writing before agreeing
any timeline.

## 1. Colour tokens

Exact values, not "use our red". Both themes — the portal is currently light-only while our
own account area supports dark.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--ta-brand` | `#ee0000` | `#ee0000` | primary actions, active nav |
| `--ta-brand-ink` | `#ffffff` | `#ffffff` | text on brand |
| `--ta-surface` | `#ffffff` | `#151c20` | cards, sheets |
| `--ta-ground` | `#f2f4f5` | `#0d1215` | page background |
| `--ta-ink` | `#101619` | `#e7ebec` | primary text |
| `--ta-ink-muted` | `#5a666c` | `#8a969c` | secondary text |
| `--ta-border` | `#d5dcdf` | `#242e33` | card borders, dividers |

**Tier accents** (used wherever a member's level is shown). Source of truth:
[`src/utils/membership/tier-visuals.ts`](../../src/utils/membership/tier-visuals.ts).

| Tier | Hex |
|---|---|
| Tradie | `#00c2ed` |
| Foreman | `#ffd200` |
| Boss | `#ee0000` |

Contrast is not optional: text on any of these must clear **WCAG 2.2 AA (4.5:1)**, and these
three are exactly where that bites. On our own card, white on the Tradie cyan measured
**2.07:1** — under half the minimum — and had to be re-ramped to reach 5.96:1, while
Foreman's yellow needs *dark* ink (it passes at 9.64:1 and fails if you darken it the same
way). Do not apply one blanket treatment across the three; see the worked note in
`RewardsPartnerCard.tsx`.

Note Boss and the brand red are the same value — if a Boss member's tier accent needs to be
distinguishable from a primary button in your UI, raise it with us rather than inventing a
fourth colour.

## 2. Logo lockup

- Use the **horizontal wordmark** on light grounds and the reversed mark on dark.
- Clear space: **half the logo height** on all sides. Nothing intrudes, including the
  points/savings block currently sitting beside it.
- Minimum width: **120px** desktop, **96px** mobile.
- The logo links to `toolsaustralia.com.au` — never `javascript:void(0)` (it does today).
- **Retire "TAR".** That initialism appears nowhere in our brand system. The product name is
  **Tools Australia Rewards**, in full, including `<title>` and the footer copyright.

## 3. Type

| Role | Family | Size / weight |
|---|---|---|
| Page title | Poppins, then system sans | 22–24px / 800 |
| Section heading | Poppins | 15px / 800 |
| Body | Inter, then system sans | 14px / 500 |
| Label, meta | Inter | 11–12px / 600 |

**No text below 12px.** The portal currently renders 23 nodes at 10px.

## 4. The card pattern

Copy the card from `/my-account/rewards` — it is the reference artefact:

- Radius **12px** (`1.1rem` on the outer container), **1px** border in `--ta-border`
- Padding **14–16px**; shadow `0 1px 2px rgb(16 22 25 / .06)`
- Logo tile: **36×36**, white ground, `10px` radius, `1px` ring at 6% black
- Title 12.5px/700, meta 10.5px/600 in `--ta-ink-muted`
- The discount value sits **top-right**, in the tier accent, 12px/900

## 5. The entitlement badge (required by ask 1)

We are asking the portal to mark offers a member cannot use. Define it here or we get theirs:

- **Locked**: greyscale the merchant logo, card at **60% opacity**, a lock pill top-right
  reading **`Unlocks at {n}%`** in `--ta-ink-muted` on a 6% black ground.
- **Open**: full colour, no badge. Absence of a badge is the signal — do not add a green tick
  to 917 cards.
- The value caption on a locked card reads **"Unlock 4% Discount"**, never "Get 4% Discount".
  A card the member cannot use must not make a promise.

## 6. Copy rules (legal — non-negotiable)

Full detail in [`vendor-copy-contract.md`](vendor-copy-contract.md). In short: never
**odds / chance(s) / lottery / lotto / raffle / sweepstake / gamble / bet**; never describe
draw entries as something bought; Australian English (**catalogue**). Offer body copy must
call the member a **Tools Australia member** — the corpus currently says "My Rewards Plus
member" on at least one live offer page.

## 7. Accessibility floor

Not brand, but shipped in the same pass or the brand work lands on a page screen readers
cannot use:

- `alt` on every image — **39 of 53 have none** today, including all four hero slides
- One `<h1>` per page — there is **none**; headings start at `<h4>`
- Accessible names on the 9 icon-only links (favourites, account, cart)
- Minimum target size **24×24** (44×44 where layout allows) — **40 of 62** mobile targets fail
- Fix the three dead links: the points/savings header block, **"Offers Near Me"**, footer logo

## Acceptance

A Tradie-tier account, checked on desktop and at 390px:

1. No locked offer appears above the fold, and every locked card is visually distinct.
2. The member's tier is stated on the page, not only inferable from refusals.
3. No text under 12px; no image without `alt`; one `<h1>`; no dead links.
4. Footer legal links point at `toolsaustralia.com.au`.
5. No occurrence of "My Rewards", "My Rewards Plus" or "TAR" anywhere in the tenant.
