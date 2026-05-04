# Auth — Patterns

## P1. Session via `getServerSession()` in handlers

```ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("unauthorized", { status: 401 });
  // ...
}
```

Or use the wrapped helper from `lib/api-auth.ts` (centralised).

## P2. `requireAdmin` for admin routes

```ts
const session = await getServerSession(authOptions);
const adminCheck = requireAdmin(session);
if (adminCheck) return adminCheck;  // returns 401/403 Response
```

## P3. UserContext for components

Components read user via `useContext(UserContext)` rather than calling `useSession()` everywhere — avoids prop-drilling and centralises the "logged-in?" check.

## P4. JWT for one-shot tokens

Password reset, magic-link, OAuth state: all use JWTs via `lib/jwt.ts`. Self-contained, expires automatically.

## Cursor agent

`.cursor/agents/auth-security.md` covers this domain. Mandatory QA review per orchestrator rule.
