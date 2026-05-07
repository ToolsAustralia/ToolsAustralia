# Shared UI — Testing

> _TODO: identify any component testing setup. The repo uses standalone tsx scripts, not React Testing Library — visual / smoke testing only._

## Manual smoke

- Render storybook-equivalent showcase (if any) in dev
- Toggle theme — verify all components render correctly in both modes
- Tab through a page with focus rings — verify accessibility

## Modal test IDs

Modals using `<ModalContainer testId="...">` render their own outer testid on the panel `motion.div`. New additions:

- `refer-friend-modal` (`src/components/modals/ReferFriendModal.tsx`) — also exposes `refer-copy-code-button` and `refer-copy-link-button` on the two copy controls. See `e2e/referrals/` specs.
