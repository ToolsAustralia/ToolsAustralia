# Proposed Privacy Policy Changes — AI Support Chatbot

> **DRAFT — have a qualified privacy professional review before publishing.**
> The wording below must be reviewed and approved before insertion into the live privacy page (`src/app/(site)/privacy/page.tsx`). The live privacy page must NOT be edited until that approval is obtained.

---

## Phase 1: Guest support assistant *(apply now, after review)*

This wording covers the **Phase 1 guest-facing AI support assistant** that is live on the site. The assistant is a FAQ-only bot — it has no access to member account data and all inference runs via the first-party Anthropic API.

Insert as a new section in the privacy policy, for example after "How we collect your information" or within a "Our services" section. Adjust heading level and placement to match the existing document structure.

---

### Suggested section heading

**"AI Support Assistant"**

---

### Proposed wording

#### What it is

Our website includes an AI-powered support assistant ("the AI assistant"). The AI assistant is an automated tool — it is not a human, and it will always identify itself as an AI at the start of a conversation.

Using the AI assistant is optional. You can simply ignore or close the chat panel and contact our support team directly instead.

#### What it can do

The AI assistant can answer general questions about Tools Australia memberships, draws, entries, partner discounts, prizes, and policies. It is informational only — it cannot make any changes to your account, process payments, cancel memberships, or carry out any transaction on your behalf. It also cannot see your personal account information (such as your entry count, billing status, or membership tier) — for those details, please visit your **My Account** dashboard or contact our support team. For account changes, please contact our support team directly.

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

### Implementation notes

1. Obtain legal/privacy professional sign-off before editing the live `src/app/(site)/privacy/page.tsx`.
2. Replace `[contact@toolsaustralia.com.au — …]` with the actual contact address used in the existing privacy policy.
3. Add the section heading to the privacy page's table of contents (if one exists).
4. Update the "last updated" date on the privacy policy page to the publication date.
