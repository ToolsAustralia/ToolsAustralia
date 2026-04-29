# Auth — Testing

> _TODO: enumerate auth tests if any._

## Manual smoke

- Email signup → verify `User` row, session works
- Google OAuth → verify session works
- Password reset → token-based flow
- Admin access → verify admin pages and API routes
- Logout → session cleared

## Anti-checks

- Try `/api/admin/*` without admin role → must 401/403
- Try `/admin/*` without auth → must redirect via middleware
