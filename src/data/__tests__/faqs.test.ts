import assert from "node:assert/strict";
import { getSupportChatFaqEntries } from "@/data/supportChatFaqs";

function main() {
  const entries = getSupportChatFaqEntries();

  // 1. Returns a non-empty array of well-formed entries.
  assert.ok(Array.isArray(entries) && entries.length > 0, "getSupportChatFaqEntries() must return a non-empty array");
  for (const entry of entries) {
    assert.ok(typeof entry.id === "string" && entry.id.length > 0, `entry must have an id: ${JSON.stringify(entry)}`);
    assert.ok(typeof entry.question === "string" && entry.question.length > 0, `entry ${entry.id} must have a question`);
    assert.ok(typeof entry.answer === "string" && entry.answer.length > 0, `entry ${entry.id} must have an answer`);
    assert.ok(
      ["ALL QUESTIONS", "SHOPPING", "PAYMENTS", "REWARDS", "PARTNERSHIPS"].includes(entry.category),
      `entry ${entry.id} has invalid category: ${entry.category}`
    );
  }

  const combinedText = entries.map((e) => `${e.question} ${e.answer}`).join(" ");
  const lowerText = combinedText.toLowerCase();

  // 2. Canonical facts must be present.
  assert.ok(combinedText.includes("27th"), "FAQs must mention the draw date (27th)");
  assert.ok(lowerText.includes("non-refundable"), "FAQs must mention that memberships are non-refundable");
  assert.ok(lowerText.includes("$20"), "FAQs must mention the Tradie tier price ($20)");
  assert.ok(lowerText.includes("randomdraws.com.au"), "FAQs must mention randomdraws.com.au as the certified draw service");

  // 3. Stale / incorrect claims must NOT appear (case-insensitive).
  const bannedPhrases = ["paypal", "international shipping", "3-5 business day", "3-5 business days"];
  for (const banned of bannedPhrases) {
    assert.ok(
      !lowerText.includes(banned),
      `FAQs must not contain stale phrase: "${banned}"`
    );
  }

  // 3b. COMPLIANCE — customer copy must use ENTRY framing, never gambling / "odds" /
  // "chance" framing. See the design rule (docs/superpowers/plans/2026-07-02-user-
  // dashboard-revamp-foundation-home.md): forbidden "boost odds" / "increase chance";
  // allowed "free entries" / "{n}× entries" / "more entries". This is a game-of-chance
  // trade promotion — say a purchase ADDS entries, never that it improves odds/chances.
  const gamblingPhrases = [
    // odds / chance framing
    "odds",
    "chance",
    "boost your chances",
    "increase your chance",
    "better odds",
    "bet on",
    // never self-describe as a lottery / gambling / raffle — it's a giveaway
    "lottery",
    "lotto",
    "gambl",
    "raffle",
    "sweepstake",
    "wager",
  ];
  for (const banned of gamblingPhrases) {
    assert.ok(
      !lowerText.includes(banned),
      `FAQs must not use gambling/odds/chance/lottery framing: "${banned}" — it's a tool giveaway; describe value in terms of ENTRIES`
    );
  }

  // 3c. COMPLIANCE — entries are a FREE inclusion with a membership or one-time pack
  // (the product sold). They are NEVER sold or priced on their own (Australian
  // trade-promotion law). Correct: "the $25 Apprentice pack includes 3 free entries".
  const sellingEntriesPhrases = [
    "buy entries",
    "buying entries",
    "buy more entries",
    "purchase entries",
    "purchasing entries",
    "sell entries",
    "selling entries",
    "per entry",
    "entry purchase",
  ];
  for (const banned of sellingEntriesPhrases) {
    assert.ok(
      !lowerText.includes(banned),
      `FAQs must not frame entries as sold/priced ("${banned}") — entries are FREE with a membership or pack (the product sold), never sold on their own`
    );
  }

  // 4. Cancellation self-service entry (id 18) must exist with correct content.
  const cancelEntry = entries.find((e) => e.id === "18");
  assert.ok(cancelEntry !== undefined, "FAQ entry id=18 (cancel/stop auto-renewal) must exist");
  const cancelLower = cancelEntry!.answer.toLowerCase();
  assert.ok(
    cancelLower.includes("/my-account"),
    "Cancel FAQ (id 18) must include the /my-account link"
  );
  assert.ok(
    cancelLower.includes("/my-account/membership") && cancelLower.includes("manage plan"),
    "Cancel FAQ (id 18) must route to My Account → Membership → Manage plan (the current management path; the Settings → Subscription tab was removed)"
  );
  assert.ok(
    cancelLower.includes("non-refundable"),
    "Cancel FAQ (id 18) must mention non-refundable policy"
  );
  assert.ok(
    cancelLower.includes("australian consumer law"),
    "Cancel FAQ (id 18) must mention Australian Consumer Law rights"
  );

  // 5. Refund entry (id 19) must exist.
  const refundEntry = entries.find((e) => e.id === "19");
  assert.ok(refundEntry !== undefined, "FAQ entry id=19 (refund policy + escalation) must exist");
  const refundLower = refundEntry!.answer.toLowerCase();
  assert.ok(refundLower.includes("non-refundable"), "Refund FAQ (id 19) must mention non-refundable");
  assert.ok(
    refundLower.includes("australian consumer law"),
    "Refund FAQ (id 19) must mention Australian Consumer Law"
  );
  assert.ok(
    refundEntry!.answer.includes("/contact"),
    "Refund FAQ (id 19) must include the /contact link"
  );

  // 6. Delete-account entry (id 20) must exist.
  const deleteEntry = entries.find((e) => e.id === "20");
  assert.ok(deleteEntry !== undefined, "FAQ entry id=20 (delete account) must exist");
  assert.ok(
    deleteEntry!.answer.includes("/contact"),
    "Delete-account FAQ (id 20) must include the /contact link"
  );
  assert.ok(
    deleteEntry!.answer.includes("/my-account"),
    "Delete-account FAQ (id 20) must include the /my-account link"
  );

  // 7. Unexpected-charge entry (id 21) must exist.
  const chargeEntry = entries.find((e) => e.id === "21");
  assert.ok(chargeEntry !== undefined, "FAQ entry id=21 (unexpected charge) must exist");
  assert.ok(
    chargeEntry!.answer.includes("/my-account"),
    "Unexpected-charge FAQ (id 21) must include /my-account link"
  );
  assert.ok(
    chargeEntry!.answer.toLowerCase().includes("billing date"),
    "Unexpected-charge FAQ (id 21) must explain renewal happens on the member's own billing date (NOT a blanket 'the 24th of each month' — only 25th–27th joiners are anchored to the 24th)"
  );

  // 8. Total entry count. Bumped 39 → 68 (2026-07-15) after the knowledge-gap batch:
  // ids 40-68 (referrals/affiliate, account+auth, promo/offer, upgrade/downgrade/anchor,
  // past-due lifecycle incl. id54, advanced partner, mini-draws/prizes). id24 was extended
  // (reactivation timing), not added, so it does not change the count.
  // Bumped 68 → 71 (2026-07-15): ids 69-71 — the Membership Streak batch (what it is
  // + ladder, continuity rules, where to see it).
  // Bumped 71 → 72 (2026-07-24): id 72 — partner-portal locked-offer explanation
  // (offers unlock at an access percentage set by tier / one-time pack).
  // 74 since 2026-07-31: entries 73 + 74 cover the partner-portal consent screen.
  // Bumped 74 → 76 (2026-07-31): ids 75 + 76 — the portal's own UI surfaces, which are the
  // vendor's and not ours: its points/savings wallet (a currency we do not operate, so it
  // reads zero for everyone) and its editable profile copy (edits there never reach us).
  // Both were live to members with no grounded answer, so Cobber's nearest matches were the
  // TA rewards-points and TA profile entries — i.e. a confidently wrong answer.
  // Bumped 84 → 89 (2026-08-19): ids 85-89 — the merchandise shop. The shop shipped
  // with only "does it exist" (15) and "does an item include entries" (84), so the
  // question a shop is asked most — where is my order — had no grounded answer and
  // Cobber may not invent one. The batch covers the orders page and its statuses,
  // print-to-order turnaround (no held stock, and deliberately no quoted ETA), the
  // delivery fee and free threshold, faulty/wrong items, and the member discount.
  assert.strictEqual(entries.length, 89, `Expected 89 FAQ entries, got ${entries.length}`);

  // 8d. Merchandise-shop batch (ids 85-89). The order-tracking entry is the reason the
  // batch exists, so it must route to the page that actually answers it — /my-account
  // alone lands the customer on a dashboard with no orders on it.
  const orderTracking = entries.find((e) => e.id === "85");
  assert.ok(orderTracking !== undefined, "FAQ entry id=85 (where's my order) must exist");
  assert.ok(
    orderTracking!.answer.includes("/my-account/orders"),
    "Order-tracking FAQ (id 85) must route to /my-account/orders, not the dashboard"
  );
  // Delivery is a flat $10 on every order (priceCart, SHOP_CONFIG) — there is no
  // threshold as of 2026-08-25. This guard used to REQUIRE the answer to name a $100
  // free-delivery threshold, which is how stale copy survives a rule change: the
  // assertion held the old promise in place. It now pins the opposite.
  const deliveryFee = entries.find((e) => e.id === "87");
  assert.ok(deliveryFee !== undefined, "FAQ entry id=87 (delivery cost) must exist");
  assert.ok(
    deliveryFee!.answer.includes("$10"),
    "Delivery FAQ (id 87) must state the $10 flat rate"
  );
  for (const e of entries) {
    assert.ok(
      !/free (delivery|shipping)|free on orders/i.test(e.answer),
      `FAQ id=${e.id} promises free delivery, which no cart can produce`
    );
  }

  // 8c. Membership Streak batch (ids 69-71) must exist, use free-entry framing, and
  // never frame the streak as something you BUY (rule 11: kept by KEEPING membership).
  const streakFaq = entries.find((e) => e.id === "69");
  assert.ok(streakFaq !== undefined, "FAQ entry id=69 (Membership Streak) must exist");
  assert.ok(
    streakFaq!.answer.includes("free entries") && streakFaq!.answer.includes("renewal"),
    "Streak FAQ (id 69) must explain free entries land on milestone renewals"
  );
  const streakContinuity = entries.find((e) => e.id === "70");
  assert.ok(streakContinuity !== undefined, "FAQ entry id=70 (streak continuity) must exist");
  assert.ok(
    streakContinuity!.answer.includes("30 days"),
    "Streak continuity FAQ (id 70) must state the 30-day rejoin grace"
  );

  // 8b. Active-member-but-0-entries (id 39) must exist and explain the renewal-timing
  // mechanic (entries are credited on the renewal date; a fresh draw starts empty), and
  // route to My Account → Membership — never recite a live count.
  const zeroEntries = entries.find((e) => e.id === "39");
  assert.ok(zeroEntries !== undefined, "FAQ entry id=39 (active but 0 entries) must exist");
  const zeroLower = zeroEntries!.answer.toLowerCase();
  assert.ok(
    zeroLower.includes("renewal") && zeroLower.includes("credited"),
    "0-entries FAQ (id 39) must explain entries are credited on the renewal date"
  );
  assert.ok(
    zeroEntries!.answer.includes("/my-account/membership"),
    "0-entries FAQ (id 39) must route to My Account → Membership for the renewal date"
  );

  // 8c. Past-due cancellation (id 54) must state the ACCURATE rule: cancelling while
  // past due ends the membership IMMEDIATELY (unlike a normal end-of-period cancel).
  // This is the accuracy fix — CancelSubscriptionService cancels past_due immediately.
  const pastDueCancel = entries.find((e) => e.id === "54");
  assert.ok(pastDueCancel !== undefined, "FAQ entry id=54 (past-due cancel) must exist");
  const pastDueCancelLower = pastDueCancel!.answer.toLowerCase();
  assert.ok(
    pastDueCancelLower.includes("past due") && pastDueCancelLower.includes("immediately"),
    "Past-due-cancel FAQ (id 54) must state that cancelling while past due ends the membership immediately"
  );

  // 9. Upgrade entry (id 22) must exist and route to the Membership manage flow.
  const upgradeEntry = entries.find((e) => e.id === "22");
  assert.ok(upgradeEntry !== undefined, "FAQ entry id=22 (upgrade membership) must exist");
  assert.ok(
    upgradeEntry!.answer.includes("/my-account/membership"),
    "Upgrade FAQ (id 22) must link to /my-account/membership (the current manage path)"
  );

  // 10. Downgrade entry (id 23) must exist and route to the Membership manage flow.
  const downgradeEntry = entries.find((e) => e.id === "23");
  assert.ok(downgradeEntry !== undefined, "FAQ entry id=23 (downgrade membership) must exist");
  assert.ok(
    downgradeEntry!.answer.includes("/my-account/membership"),
    "Downgrade FAQ (id 23) must link to /my-account/membership (the current manage path)"
  );

  // 11. Membership terminology: customer-facing copy says "Membership entries"
  // (not "Subscription entries"). Management routes to Membership → Manage plan;
  // the old "Settings → Subscription" tab was REMOVED in the 2026-07 dashboard revamp.
  assert.ok(
    combinedText.includes("Membership entries"),
    'FAQs must use "Membership entries" (not "Subscription entries") in customer-facing copy'
  );
  assert.ok(
    !lowerText.includes("subscription entries"),
    'FAQs must NOT say "subscription entries" — use "membership entries"'
  );
  assert.ok(
    !combinedText.includes("Settings → Subscription"),
    'FAQs must NOT reference the removed "Settings → Subscription" tab — route to Membership → Manage plan'
  );

  // 12. Join / how-membership-works entry (id 28) must exist and link to /membership.
  const joinEntry = entries.find((e) => e.id === "28");
  assert.ok(joinEntry !== undefined, "FAQ entry id=28 (become a member / how membership works) must exist");
  assert.ok(
    joinEntry!.answer.includes("/membership"),
    "Join FAQ (id 28) must link to the /membership page"
  );

  // 13. Account-aware entries (id 29 entries, id 30 tier) route to My Account and
  // must NOT recite account data — they point the user to their dashboard.
  const myEntries = entries.find((e) => e.id === "29");
  assert.ok(myEntries !== undefined, "FAQ entry id=29 (where are my entries) must exist");
  assert.ok(
    myEntries!.answer.includes("/my-account"),
    "My-entries FAQ (id 29) must direct the user to /my-account"
  );
  const myTier = entries.find((e) => e.id === "30");
  assert.ok(myTier !== undefined, "FAQ entry id=30 (what tier am I on) must exist");
  assert.ok(
    myTier!.answer.includes("/my-account"),
    "My-tier FAQ (id 30) must direct the user to /my-account"
  );

  // 14. Did-I-win / results entry (id 31) must exist and link to /draw-results
  // (a result query must NOT be answered with the prize catalog).
  const didIWin = entries.find((e) => e.id === "31");
  assert.ok(didIWin !== undefined, "FAQ entry id=31 (did I win / draw results) must exist");
  assert.ok(
    didIWin!.answer.includes("/draw-results"),
    "Did-I-win FAQ (id 31) must link to /draw-results"
  );

  console.log("PASS — faqs.test.ts passed —", entries.length, "entries, all checks green");
}

main();
