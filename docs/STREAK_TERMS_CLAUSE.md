# Membership Streak — proposed terms clause

**This is a proposal only. No live terms are changed by this file.** Nothing here has been
added to `/terms`, and this document does not itself alter what members are bound by. It exists
to give DJ a ready-to-paste clause and the reasoning behind it, for a decision at launch — not
as a record of a change already made.

## What the terms say today

`src/app/(site)/terms/page.tsx:197`, section **5.1 Entry Allocation**, lists how members get
entries. Its third bullet reads, verbatim:

> Additional entries may be offered via promotions, referrals, or free entry methods

This sentence is broad enough to already cover the Membership Streak — streak entries are free
entries, granted automatically, and "free entry methods" reads on that without needing a word
changed. The streak is not named anywhere in `/terms` today; it is covered only by this generic
catch-all, the same one that covers referrals, one-off promo codes, and any other bonus-entry
mechanic the business runs.

## Why name it instead of relying on the generic line

Generic coverage protects the business legally, but it does not do three things a named clause
does:

- **States the mechanic's own rules where a member can find them.** The generic sentence says
  nothing about which renewals count, what happens on a lapse, or that a pause freezes rather
  than resets progress — all real product behavior a member may reasonably want to check before
  relying on it. Today they only learn those rules from the dashboard UI and Cobber, not from a
  document that governs the relationship.
- **Forecloses ambiguity at exactly the moment it would otherwise surface** — a support dispute
  or a lapsed-and-frustrated member asking "why did my streak reset?". A named clause answers
  that in the terms directly; the generic line leaves it to be inferred.
- **Is the stronger position to launch with, not just the safer one.** Shipping the streak while
  still relying on unnamed generic coverage is defensible, but shipping it with its own numbered
  clause is the position that best withstands scrutiny — it shows the mechanic was deliberately
  reasoned through (consecutive-paid-renewals-only, lapse behavior, pause behavior, the
  twelve-renewal repeat, the right to vary future unearned milestones) rather than retrofitted
  into a catch-all after the fact.

None of this means the current sentence is wrong or needs to be removed — the proposal below is
an **addition** (a new `5.1(e)`), not a replacement of the existing bullet.

## Proposed clause

> **5.1(e) Membership Streak.** Members receive free entries at consecutive paid renewal
> milestones — the 2nd, 4th, 6th, 8th, 10th and 12th consecutive renewal — granted automatically
> into the next eligible Major Giveaway. These free entries are included with the membership at
> no additional cost and are not sold separately. A streak counts consecutive **paid** renewals
> only. A membership that lapses and is not reinstated within 30 days resets the streak to zero
> and the milestone ladder restarts. Paused or overdue memberships accrue no streak progress
> while no renewal payment is made. The ladder repeats every twelve consecutive renewals. Tools
> Australia may vary or withdraw future unearned milestones on reasonable notice; milestones
> already earned are unaffected.

**Decision for DJ — this line newly discloses a figure the product deliberately doesn't
advertise elsewhere.** `StepStakes.tsx:14-16` (the cancellation flow's stakes screen) states the
30-day rejoin grace is "deliberately NOT advertised here (truthful omission; Cobber's FAQ
discloses it on request)" — a member who lapses and rejoins within 30 days keeps their streak
(`src/utils/subscription/streak.ts:63-66`, `RESUBSCRIBE_GRACE_DAYS = 30`), but retention copy
never says so. A governing terms document is a different risk class than an omission on a sales
screen, so the clause above states the window rather than repeating that omission in a binding
document. If you'd rather not put "30 days" in the terms, the alternative below states the same
rule without the figure — pick one:

> Alternative (no figure disclosed): A membership that lapses and is not reinstated within Tools
> Australia's standard rejoin period resets the streak to zero and the milestone ladder restarts.

## Adopting this

If DJ approves the wording, the change is a single addition to the bullet list in
`src/app/(site)/terms/page.tsx`'s `5.1 Entry Allocation` section (as a new `5.1(e)` list item,
following the existing `<li>` pattern in that block) — no other file in this repository asserts
or depends on this clause's exact wording.
