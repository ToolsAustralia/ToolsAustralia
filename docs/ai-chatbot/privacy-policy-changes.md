# Proposed Privacy Policy Changes — AI Support Chatbot

> **DRAFT — have a qualified privacy professional review before publishing.**
> The wording below must be reviewed and approved before insertion into the live privacy page (`src/app/(site)/privacy/page.tsx`). The live privacy page must NOT be edited until that approval is obtained.

---

## Section A — Phase 1: Guest support assistant *(apply now, after review)*

This wording covers the **Phase 1 guest-facing AI support assistant** that is live on the site. It is scoped to what Phase 1 actually does — anonymous and signed-in guest support queries only, no member-account tool calls.

Insert as a new section in the privacy policy, for example after "How we collect your information" or within a "Our services" section. Adjust heading level and placement to match the existing document structure.

---

### Suggested section heading

**"AI Support Assistant"**

---

### Proposed wording (Phase 1)

#### What it is

Our website includes an AI-powered support assistant ("the AI assistant"). The AI assistant is an automated tool — it is not a human, and it will always identify itself as an AI at the start of a conversation.

Using the AI assistant is optional. You can simply ignore or close the chat panel and contact our support team directly instead.

#### What it can do

The AI assistant can answer general questions about Tools Australia memberships, draws, entries, partner discounts, prizes, and policies. It is informational only — it cannot make any changes to your account, process payments, cancel memberships, or carry out any transaction on your behalf. For account changes, please contact our support team directly.

#### What information is used

The AI assistant uses the text of the messages you type to generate a response. It also uses a curated knowledge base of general Tools Australia information (membership details, draw rules, policies, etc.).

Please do not include sensitive personal information — such as full payment card numbers, passwords, or one-time codes — in your messages. You will never need to share these details to get a support answer.

#### Where your information is processed

Your messages may be processed by a third-party AI provider. That provider may be located outside of Australia. No sensitive account information (payment details, passwords) is included in these requests. For details of how that provider handles data, refer to their privacy policy.

#### How your chat data is stored

Your chat conversations are stored securely on servers located in Australia. They are automatically deleted after 90 days.

If you are a signed-in member, you can delete your chat history at any time by opening the chat panel and clicking "Delete my chat history." This immediately removes all of your stored chat messages from our servers.

#### Contact / opt-out

If you have questions about how the AI assistant handles your information, or if you would like to request deletion of your chat data, please contact us via the contact page or at [contact@toolsaustralia.com.au — replace with the address used in the existing privacy policy].

---

### Implementation notes for Phase 1

1. Obtain legal/privacy professional sign-off before editing the live `src/app/(site)/privacy/page.tsx`.
2. Replace `[contact@toolsaustralia.com.au — …]` with the actual contact address used in the existing privacy policy.
3. Add the section heading to the privacy page's table of contents (if one exists).
4. Update the "last updated" date on the privacy policy page to the publication date.

---

## Section B — Phase 2: Member account tools *(apply only if/when enabled)*

> **NOT YET APPLICABLE.** This section covers member-authenticated tool calls (looking up account-specific data such as membership tier, billing status, entry counts, and partner-discount eligibility). Those capabilities are gated behind `CHAT_PROVIDER=bedrock` and are NOT live in Phase 1. Do not publish this wording until the member-tool path is enabled and reviewed.

---

### Proposed wording (Phase 2 additions — supplement Phase 1 wording above)

#### What the AI assistant can do *(updated for Phase 2)*

For signed-in members, the AI assistant can also look up information specific to your account — such as your current membership plan, entry count, billing status, and draw information — to give you a more relevant answer.

#### What information is used *(updated for Phase 2)*

**When you are signed in:** To answer account-specific questions, the AI assistant may access a limited, read-only view of your own account data, including:

- Your current membership tier and status
- Your current draw entry count (membership entries and any one-time entries)
- Your billing status and next billing date
- Current draw information
- Which partner brand discounts are available to you at your membership tier

The AI assistant can only access **your own** account data. It cannot access another member's information. Sensitive fields — including your email address, phone number, postal address, payment card details, and Stripe account identifiers — are never made available to the AI assistant.

#### Where your information is processed *(updated for Phase 2)*

For signed-in members, questions that require account-specific answers are processed using **Amazon Bedrock in the `ap-southeast-2` (Sydney, Australia) region**, so AI inference runs onshore. General (non-account-specific) questions may be processed by a third-party AI provider located outside Australia; however, no personal account information is included in those requests.

---

### Implementation notes for Phase 2

1. Phase 2 wording supersedes (or supplements) the Phase 1 section above — do not publish both side by side without merging the overlapping paragraphs.
2. Do not publish until the member-tool path (`CHAT_PROVIDER=bedrock`) is live and tested.
3. Obtain fresh legal sign-off — the member-data-access scope is materially different from Phase 1.
