# Proposed Privacy Policy Changes — AI Support Chatbot

> **PROPOSED — apply after legal sign-off; do not publish while the bot is dormant or while the member-authenticated path (`CHAT_PROVIDER=bedrock`) is not yet live.**
>
> The wording below is a **draft** for insertion into `src/app/(site)/privacy/page.tsx`. It must be reviewed by a qualified privacy professional and approved by legal before publication. The live `privacy/page.tsx` must NOT be edited until this approval is obtained.

---

## Suggested section heading

**"AI Support Assistant"**

(Insert as a new section after "How we collect your information" or in a "Our services" section, depending on the existing document structure.)

---

## Proposed wording

### What it is

Our website includes an AI-powered support assistant ("the AI assistant"). The AI assistant is an automated tool — it is not a human, and it will always identify itself as an AI at the start of a conversation.

### What the AI assistant can do

The AI assistant can answer general questions about Tools Australia memberships, draws, entries, partner discounts, prizes, and policies. For signed-in members, it can also look up information specific to your account — such as your current membership plan, entry count, billing status, and draw information — to give you a more relevant answer.

**The AI assistant is informational only.** It cannot make any changes to your account, process payments, cancel memberships, or carry out any transaction on your behalf. For account changes, please contact our support team directly.

### What information is used

**When you are not signed in:** The AI assistant only uses the text of your messages and general public information about Tools Australia to answer your question. No personal account information is accessed.

**When you are signed in:** To answer account-specific questions, the AI assistant may access a limited, read-only view of your own account data, including:

- Your current membership tier and status
- Your current draw entry count (membership entries and any one-time entries)
- Your billing status and next billing date
- Current draw information
- Which partner brand discounts are available to you at your membership tier

The AI assistant can only access **your own** account data. It cannot access another member's information. Sensitive fields — including your email address, phone number, postal address, payment card details, and Stripe account identifiers — are never made available to the AI assistant.

### Where your information is processed

For signed-in members, questions that require account-specific answers are processed using **Amazon Bedrock in the `ap-southeast-2` (Sydney, Australia) region**, so inference runs onshore. General (non-account-specific) questions may be processed by a third-party AI provider located outside Australia; however, no personal account information is included in those requests.

### Chat history and retention

Your chat conversations are stored for up to 90 days. After that, they are automatically deleted.

**You can delete your chat history at any time** by opening the chat panel and clicking "Delete my chat history." This immediately deletes all of your stored chat conversations and messages from our servers, and clears the conversation from your browser.

### Data security and accuracy

Chat conversations are processed through controls designed to limit the personal information available to the AI assistant and to prevent it from retaining sensitive data. Message content is checked for common personal information patterns (such as email addresses, phone numbers, and card numbers) and those patterns are removed before the message is stored.

The AI assistant answers from a curated knowledge base and your account data. It may occasionally be inaccurate. Do not rely on it for legal, financial, or medical advice. For important account matters, please contact our support team.

### Your data is not sold

Information shared in your chat conversations is used solely to provide and improve the support assistant. It is not sold to third parties or used for advertising purposes.

### Contact

If you have questions about how the AI assistant handles your information, please contact us via the contact page or email [contact@toolsaustralia.com.au].

---

## Implementation notes (for the developer applying this)

1. Obtain legal sign-off on the wording above before editing the live `privacy/page.tsx`.
2. The `[contact@toolsaustralia.com.au]` placeholder should be replaced with the actual contact address used in the existing privacy policy.
3. Add the section heading to the privacy page's table of contents (if one exists).
4. Update the "last updated" date on the privacy policy page to the publication date.
5. Do not publish until the member-tool path (`CHAT_PROVIDER=bedrock`) is live — the wording about "signed-in" data access is only accurate when that path is enabled.
