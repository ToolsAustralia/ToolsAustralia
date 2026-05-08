# Referrals — Frontend

## Hooks

| Hook | Purpose | Source |
|---|---|---|
| `useReferralCode()` | Resolve referral code from URL/session | [src/hooks/useReferralCode.ts](../../src/hooks/useReferralCode.ts) |
| `useReferralProfile(userId)` | Fetch the user's referral code + stats (conversions, entries awarded) | [src/hooks/queries/useReferralQueries.ts](../../src/hooks/queries/useReferralQueries.ts) |

## Modal — ReferFriendModal

`src/components/modals/ReferFriendModal/` — the gain-framed referral share modal.

Folder structure (mirrors DowngradeConfirmModal/UpgradeConfirmModal pattern):

| File | Purpose |
|---|---|
| `index.tsx` | Orchestrator — preserves original props/state/callbacks, composes upsell-shell primitives |
| `Shell.tsx` | Modal frame (scroll-lock, Escape handler, z-90 backdrop, tier-themed `data-tier`) |
| `styles.module.css` | Custom scrollbar + tier CSS custom properties |
| `__tests__/ReferFriendModal.test.ts` | Smoke test (3 open combos + 1 closed) |
| `__tests__/asset-stubs.cjs` | Preload stubs for `.css` and image extensions |

### Props

```ts
interface ReferFriendModalProps {
  isOpen: boolean;
  onCloseAction: () => void;
  userId: string;
  userFirstName?: string;
  /** Optional tier for frame theming. Defaults to "tradie". */
  userTier?: "tradie" | "foreman" | "boss";
}
```

### Design

- **UpsellHero** `tone="tier-{userTier}"` — eyebrow "GIVE 100, GET 100", 3-step infographic
- **InfoGrid** `framing="gain"` — "+100 entries", "+100 for them", "Unlimited"
- **UrgencyBanner** `tone="gold"` — social-proof + pro-tip copy
- **Plan 4 Button** — `variant="outline" tone="red"` (Copy Link) and `variant="primary" tone="red"` (Share from device, when Web Share API is available)
- **TrustBar** — Privacy safe / No spam / Cancel anytime

## Where it's consumed

Referral codes are read on signup pages (members can be attributed at registration) and on certain promo landing pages. The `ReferFriendModal` is opened from the My Account dashboard and the ModalsGallery (`/dev/modals`, id `refer-friend`).
