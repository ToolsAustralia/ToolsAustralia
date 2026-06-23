# Theme — Testing

## Manual smoke

- Fresh visitor (clear `ta-theme`), at night and/or with OS dark mode on → verify page loads **light** (no `.dark` on `<html>`)
- Toggle to dark → verify `.dark` on `<html>`; refresh → verify it persists with no flash
- Toggle back to light → refresh → verify it stays light
- Legacy auto-dark: set `localStorage["ta-theme"] = '{"state":{"theme":"dark","userManualOverride":false},"version":0}'` → reload → verify it resolves to **light**
- Promo route → verify promo theme override; navigate away → verify clean revert
- Admin panel → verify admin theme is independent
