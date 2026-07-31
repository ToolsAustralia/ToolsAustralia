/**
 * Guard: the consent sheet must disclose EXACTLY the member fields the SSO hand-off sends.
 *
 * This is the one invariant `tsc` cannot catch and that a reviewer will not notice: the
 * disclosure list and the signed payload are built in different files, so a new claim
 * added to `signPartnerDiscountSsoToken` silently becomes a field we transmit without
 * telling the member — a privacy defect, not a cosmetic one.
 *
 * Run: npm run test:partner-consent
 */

import { signPartnerDiscountSsoToken } from "@/lib/partner-discount-sso";
import type { IUser } from "@/models/User";
import {
  buildPartnerSsoSharedFields,
  hasValidPartnerConsent,
  PARTNER_SSO_SCOPE_VERSION,
  PARTNER_SSO_SENDS_MEMBER_LEVEL,
  type PartnerSsoSharedFieldKey,
} from "@/utils/partner-discounts/partner-consent";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Minimal stand-in for the fields these helpers actually read. */
const fakeUser = {
  _id: "665f1c2a9b4e7d8a1c3f5b90",
  firstName: "Marcus",
  lastName: "Thompson",
  email: "m.thompson@example.com.au",
} as unknown as Pick<IUser, "_id" | "firstName" | "lastName" | "email">;

/**
 * Maps a signed-payload claim → the disclosure row that covers it.
 * Tenant config (`domain_url`, `domain_code`, `client_id`, `client_displayname`) is OUR
 * identity, not member data, so it is deliberately not disclosable.
 */
const CLAIM_TO_FIELD: Record<string, PartnerSsoSharedFieldKey | null> = {
  member_id: "accountReference",
  firstname: "name",
  lastname: "name",
  email: "email",
  member_level: "tier",
  domain_url: null,
  domain_code: null,
  client_id: null,
  client_displayname: null,
};

async function run() {
  console.log("\npartner-consent — disclosure matches the SSO payload\n");

  process.env.IGODIRECT_SSO_SECRET ||= "test-secret-not-a-real-key";

  // Sign a token with every optional field populated, then read back the claim set.
  const token = await signPartnerDiscountSsoToken({
    memberId: String(fakeUser._id),
    firstname: fakeUser.firstName,
    lastname: fakeUser.lastName,
    email: fakeUser.email,
    // Included so a future flip of PARTNER_SSO_SENDS_MEMBER_LEVEL is covered by the map.
    memberLevel: "100",
    domainUrl: "example.myrewards.com.au",
    domainCode: "TA",
    clientId: 1234,
    clientDisplayName: "Tools Australia",
  });
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as Record<
    string,
    unknown
  >;

  // 1. Every claim the signer can emit is accounted for — no unmapped member data.
  const unmapped = Object.keys(payload).filter((k) => !(k in CLAIM_TO_FIELD));
  check(
    "every signed claim is classified (member data vs tenant config)",
    unmapped.length === 0,
    unmapped.length ? `unmapped claims: ${unmapped.join(", ")}. Add them to CLAIM_TO_FIELD AND to buildPartnerSsoSharedFields, then bump PARTNER_SSO_SCOPE_VERSION.` : undefined
  );

  // 2. The disclosure covers every member-data claim the route ACTUALLY sends today.
  const disclosed = new Set(buildPartnerSsoSharedFields(fakeUser, { tierLabel: "100% catalogue" }).map((f) => f.key));
  const requiredKeys = new Set(
    Object.entries(CLAIM_TO_FIELD)
      .filter(([claim, field]) => {
        if (field === null) return false;
        // member_level is not sent today; it is disclosable only when it is.
        if (claim === "member_level") return PARTNER_SSO_SENDS_MEMBER_LEVEL;
        return true;
      })
      .map(([, field]) => field as PartnerSsoSharedFieldKey)
  );

  for (const key of requiredKeys) {
    check(`discloses "${key}"`, disclosed.has(key), "sent to the partner but not shown on the consent sheet");
  }

  // 3. …and nothing MORE. Over-disclosure is as wrong as under-disclosure: claiming we
  //    share the tier while the route omits it makes the screen a false statement.
  for (const key of disclosed) {
    check(`does not over-disclose "${key}"`, requiredKeys.has(key), "shown on the consent sheet but never sent");
  }

  // 4. Values are the member's real data, never a placeholder.
  const fields = buildPartnerSsoSharedFields(fakeUser);
  const nameRow = fields.find((f) => f.key === "name");
  const emailRow = fields.find((f) => f.key === "email");
  const refRow = fields.find((f) => f.key === "accountReference");
  check("name row shows the real name", nameRow?.value === "Marcus Thompson", nameRow?.value);
  check("email row shows the real email", emailRow?.value === fakeUser.email, emailRow?.value);
  check(
    "account reference is derived from the real _id, with no invented member number",
    refRow?.value === "…3f5b90",
    refRow?.value
  );

  // 5. The consent gate fails closed.
  check("no record → re-consent", hasValidPartnerConsent({} as Pick<IUser, "partnerDiscountConsent">) === false);
  check(
    "stale scope version → re-consent",
    hasValidPartnerConsent({
      partnerDiscountConsent: {
        scopeVersion: PARTNER_SSO_SCOPE_VERSION - 1,
        acceptedAt: new Date(),
        fields: [],
      },
    } as unknown as Pick<IUser, "partnerDiscountConsent">) === false
  );
  check(
    "current scope version → allowed through",
    hasValidPartnerConsent({
      partnerDiscountConsent: {
        scopeVersion: PARTNER_SSO_SCOPE_VERSION,
        acceptedAt: new Date(),
        fields: ["name", "email", "accountReference"],
      },
    } as unknown as Pick<IUser, "partnerDiscountConsent">) === true
  );

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
