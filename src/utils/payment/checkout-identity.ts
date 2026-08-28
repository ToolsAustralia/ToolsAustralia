import { NextRequest, NextResponse } from "next/server";
import User, { type IUser } from "@/models/User";

/**
 * Proof that THIS browser controls the email it is checking out with.
 *
 * ── The hole this closes (2026-08-28) ────────────────────────────────────────────
 *
 * `create-payment-intent` and `create-one-time-purchase` both take `userEmail` from the
 * request body with **no session required**, looked the account up by that email, and
 * bound the PaymentIntent to its `stripeCustomerId` + stamped `metadata.userId`. Anyone
 * who knew a member's email could therefore obtain a client secret for an intent bound to
 * that member's Stripe customer. `/api/auth/session-from-payment` derives identity from
 * `paymentIntent.customer`, so paying A$1 on the attacker's OWN card returned a valid
 * sign-in token for the victim — a full account takeover for the price of a minimum
 * charge. Reproduced end to end by `npx tsx scripts/smoke-session-from-payment-takeover.ts`.
 *
 * ── Why a cookie, and why this is sound ──────────────────────────────────────────
 *
 * The unauthenticated bind exists for ONE legitimate flow: `MembershipModal` step 1
 * registers the account, then step 2 pays — and registration does not log the user in, so
 * the payment call genuinely has no session (see `docs/payment/gotchas.md`). Removing the
 * bind outright would regress that (the campaign-code attach needs a resolved account —
 * "this was EXTRA100's entire audience").
 *
 * The key property is that **`/api/auth/register` refuses any email that already has an
 * account** — it answers "Please log in instead". So a successful registration proves the
 * caller just created that account, and a token minted at that moment is proof of control.
 * An attacker cannot obtain one for a victim's email, because they cannot register it.
 *
 * A cookie rather than a body field because:
 *  • it needs no client threading through four `createPaymentIntent` call sites, so there
 *    is no path that can silently forget to send it;
 *  • `HttpOnly` keeps it out of reach of any XSS that a body field would be exposed to;
 *  • `SameSite=Lax` still arrives on the top-level GET navigation Stripe uses to return
 *    from 3DS, which is exactly the flow `session-from-payment` was built for.
 *
 * The audience is DELIBERATELY distinct from the `auto-login` bridge token's
 * (`tools-australia-users`). Without that, a checkout-identity token would be a valid
 * sign-in credential — trading one takeover for another.
 */

const rawSecret = process.env.NEXTAUTH_SECRET;
if (!rawSecret) {
  throw new Error("NEXTAUTH_SECRET is required for checkout identity but was not provided.");
}
const SECRET = rawSecret;

export const CHECKOUT_IDENTITY_COOKIE = "ta_checkout_identity";

/** Long enough for a slow 3DS/bank-app checkout, short enough to bound misuse. */
const TTL_SECONDS = 2 * 60 * 60;
const AUDIENCE = "tools-australia-checkout";
const ISSUER = "tools-australia";

export interface CheckoutIdentity {
  userId: string;
  email: string;
}

async function jwtLib() {
  const mod = await import("jsonwebtoken");
  return mod.default || mod;
}

export async function signCheckoutIdentityToken(identity: CheckoutIdentity): Promise<string> {
  const jwt = await jwtLib();
  return new Promise((resolve, reject) => {
    jwt.sign(
      { sub: identity.userId, email: identity.email.toLowerCase() },
      SECRET,
      { expiresIn: TTL_SECONDS, algorithm: "HS256", issuer: ISSUER, audience: AUDIENCE },
      (err: Error | null, token?: string) => (err || !token ? reject(err) : resolve(token))
    );
  });
}

export async function verifyCheckoutIdentityToken(token: string): Promise<CheckoutIdentity | null> {
  try {
    const jwt = await jwtLib();
    const decoded = await new Promise<{ sub?: string; email?: string }>((resolve, reject) => {
      jwt.verify(
        token,
        SECRET,
        { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE },
        (err: Error | null, payload?: unknown) =>
          err || !payload ? reject(err) : resolve(payload as { sub?: string; email?: string })
      );
    });
    if (!decoded.sub || !decoded.email) return null;
    return { userId: decoded.sub, email: decoded.email.toLowerCase() };
  } catch {
    return null;
  }
}

/** Attach the proof to a registration response. Call on the SUCCESS path only. */
export function setCheckoutIdentityCookie(response: NextResponse, token: string): void {
  response.cookies.set(CHECKOUT_IDENTITY_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

/**
 * THE RULE — the only place that decides whether a request may act for an account.
 *
 * Three outcomes, deliberately explicit rather than a nullable user, because the
 * difference between "nobody owns this email" and "somebody does and you did not prove
 * it" is the whole security boundary and a `null` collapses them:
 *
 *  • `bound`  — proven. Bind the Stripe customer and stamp the account into metadata.
 *  • `guest`  — the email belongs to no account. A genuine new buyer; the webhook creates
 *               the account from `metadata.userEmail` after payment, as it always has.
 *  • `must_authenticate` — the email HAS an account and the caller did not prove control.
 *               Callers must refuse. Degrading to `guest` here would still leak the
 *               victim's email into `metadata.userEmail`, which the webhook falls back to
 *               when resolving the buyer — so the attacker's payment would be attributed
 *               to the victim's account even with the Stripe customer binding removed.
 *
 * This mirrors `/api/auth/register`, which already answers "Please log in instead" for an
 * email that has an account, so it discloses nothing new.
 */
export type PurchaseIdentity =
  | { kind: "bound"; user: IUser }
  | { kind: "guest" }
  | { kind: "must_authenticate" };

export async function resolvePurchaseIdentity(params: {
  request: NextRequest;
  /** `session.user.id` when NextAuth has one, else null/undefined. */
  sessionUserId?: string | null;
  /** The email the caller claims, from the request body. */
  userEmail?: string | null;
}): Promise<PurchaseIdentity> {
  const { request, sessionUserId, userEmail } = params;

  // 1. An authenticated caller is already proven — unchanged behaviour.
  if (sessionUserId) {
    const user = (await User.findById(sessionUserId)) as IUser | null;
    return user ? { kind: "bound", user } : { kind: "guest" };
  }

  if (!userEmail) return { kind: "guest" };
  const claimed = userEmail.toLowerCase().trim();

  // 2. Otherwise the browser must carry proof it registered this email.
  const raw = request.cookies.get(CHECKOUT_IDENTITY_COOKIE)?.value;
  const identity = raw ? await verifyCheckoutIdentityToken(raw) : null;

  if (identity && identity.email === claimed) {
    const user = (await User.findById(identity.userId)) as IUser | null;
    // The token names an id AND an email; require the account to still agree with both,
    // so a changed email invalidates the proof rather than silently widening it.
    if (user && (user.email || "").toLowerCase() === identity.email) {
      return { kind: "bound", user };
    }
  }

  // 3. Unproven. Only a genuinely unclaimed email may proceed as a guest.
  const existing = await User.exists({ email: claimed });
  return existing ? { kind: "must_authenticate" } : { kind: "guest" };
}
