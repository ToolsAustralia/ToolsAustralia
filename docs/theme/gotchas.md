# Theme — Gotchas

## DST + auto schedule

Auto-theme switches at clock times in Sydney. DST transitions can cause "missing hour" or "duplicate hour" — verify the schedule helper handles this.

## Promo theme stickiness

`usePromoThemeStore` overrides the user's theme. If the override doesn't clean up properly on route change, the promo theme leaks. Lifecycle: set on enter, clear on leave.

## Admin theme drift

Admin theme is independent. If you change member theme tokens, admin won't pick it up unless you explicitly sync — by design, since admin needs different visual hierarchy.

## SSR mismatch

If theme cookie says "dark" but client localStorage says "light," there's a brief mismatch. Bootstrap script preserves the cookie's choice; localStorage is updated on first user toggle.
