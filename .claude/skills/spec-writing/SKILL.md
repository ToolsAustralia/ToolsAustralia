---
name: spec-writing
description: How to write a feature spec in this repo before any planning or implementation. Use this whenever the user asks for a spec, design doc, or technical proposal, and also whenever they ask you to build, add, or change any feature that touches more than one file — write the spec first and get sign-off before planning. Also use when reviewing or updating an existing spec.
---

# Writing a spec

Order of work: **recon → spec → sign-off → plan → code.**

The spec holds decisions and verified facts. It changes only when a decision
is reversed. The plan holds tasks and churns daily — keep it in a separate
file, or the stable part rots alongside the volatile one.

A spec is not judged on length. Every line must do one of three things:
close a decision, record a verified fact, or name an unknown. If a line does
none of those, cut it.

---

## 0. Recon comes first

Do not write a word of the spec until you have read the code you are about
to build on. This is the step that separates a useful spec from a plausible
one.

**Never trust our own docs as a description of behaviour.** `docs/` and
`BUSINESS.md` record intent, and intent drifts from code. If a doc says a
code path exists, open the file and confirm it. If it does not exist, say so
in the spec explicitly and label the doc as design intent.

**Cite `file:line` for every claim about existing code.** No citation, no
claim. A confident sentence about a function that does not exist costs more
than saying "I did not check."

**Prove absence with a control.** If you searched and found nothing, run a
second search you expect to hit, and report both results. "Zero hits for
`webhook|HMAC` across 123 pages; control search for `graphql` hit 123/123"
is evidence. "There are no webhooks" is a guess wearing a fact's clothes.

**Label every claim with its provenance:**

| Tag | Means |
|---|---|
| `verified` | I ran it or read the code. Output or `file:line` shown. |
| `documented` | Someone wrote it down. Not tested against reality. |
| `assumed` | Neither. State what would confirm it and who can. |

Anything left unlabelled will be read as `verified`. That is how a spec gets
implemented against a code path that was never built.

---

## 1. Required sections

Write them in this order. Sections 1 and 2 go to the user for sign-off
before you write anything below them.

### 1. Problem and done
Three sentences maximum: what problem, for whom, why now. Then success
criteria in observable terms — what a user can do that they could not
before, and what number tells us it worked. Then one line on what would
make this a failure. Without this, later trade-offs have no tiebreaker.

### 2. Decisions
A table: decision, choice, why. One row each. A choice recorded without its
reason gets re-litigated in three weeks by someone who was in the room.
Include the options you rejected when the rejection is non-obvious.

### 3. Starting state (verified)
What exists, what is broken, what is dead code, what the docs claim that the
code does not do. Provenance tags throughout. Name any latent failure that
will surface the moment this feature exists — a route that would 500, an
enum value that is written but not permitted, a populate that would throw.

### 4. Design
Data model changes, API contracts, and the user flow. Then, and this is the
part that gets skipped: **edge cases and failure states.** Empty, duplicate,
expired, timed out, partially succeeded, concurrent, refunded, offline.
For anything touching money or an external service, answer "what if this
call times out and we do not know whether it landed" explicitly.

### 5. Threading checklist
Where a new value (a type union member, an enum, a source key, a status)
must be added in more than one place, list every location in a table with a
"miss it and…" column naming the specific consequence.

The rows that matter most are the ones the compiler cannot catch — Mongoose
strict mode silently drops unknown schema keys, and a `switch` without a
matching case falls through to `default` and writes plausible wrong data
with no error. Say which failure mode each row has: loud, or silent.

This table is the highest-value section in the document. It is also your
test list — see below.

### 6. Tests
Which existing suite covers this, which specs get extended, and which new
assertions get written. Every silent row in section 5 needs an assertion,
because nothing else will catch it.

For money or entitlement paths, name the assertion at the database level,
not the UI level: granted exactly once, declines grant nothing, replay and
double-submit cannot double-grant, refund reverses.

If a page or flow is covered by an automated content or legal scan, check
whether the new route is actually in the scanned list. It usually is not.

### 7. Phases
Each phase ships something independently and states its user-visible win.
If a phase is blocked on an external party, place it late and say what the
earlier phases ship without it.

Keep phases small enough to finish. If a phase lists five verbs, it is
several phases. A single developer will discover this the expensive way.

### 8. Rollback
How this gets turned off without a deploy. What the kill switch is, what
users see when it is off, and what happens to in-flight work.

Also: what the recovery surface is when the happy path half-completes. If a
payment can succeed while the record write fails, there must be somewhere a
human can see that and act.

### 9. Open dependencies
A table: item, owner, date asked, expected by, blocks which phase. An
owner without a date is a note, not a tracked dependency. External parties —
lawyers, regulators, suppliers — are the long poles; put them at the top.

For a blocked external integration, state how the design degrades if the
answer is no. An interface with a swappable adapter turns a "no" into a
manual fallback rather than a dead project.

---

## 2. How to write it

- **Tables over prose** for anything enumerable. Better to read, and harder
  to be vague in.
- **Decisions, not narration.** "We chose X because Y" beats a paragraph
  exploring the space.
- **Name the trap.** Where two things look alike and mean opposite things —
  `null` meaning "not ready yet" versus an error array meaning "failed" —
  say so in one line. That confusion ships otherwise.
- **Do not invent vocabulary.** If the repo already calls it a shop, it is a
  shop in models, routes, permissions and docs. A synonym introduced in a
  spec becomes a second concept in the codebase forever.
- **Third-party names live behind an interface,** never sprayed through
  business logic.
- **Reproduce evidence, do not summarise it.** For a probe or investigation,
  show the request and the response verbatim in a table. A summary of an
  error message is not debuggable by the next reader.
- **Flag anything a human must decide** — legal, pricing, contractual,
  anything with a permit or a regulator attached. Do not decide it in the
  spec and let it slip through as though it were settled.

---

## 3. Done check

The spec is ready for sign-off when:

- [ ] Sections 1 and 2 fit on one screen and were approved before the rest
      was written
- [ ] Every claim about existing code has a `file:line`
- [ ] Every claim has a provenance tag; no bare assertions
- [ ] Every absence claim has a control search reported beside it
- [ ] Every silent-failure row in section 5 has a matching assertion in
      section 6
- [ ] Every open question is either decided in section 2 or listed in
      section 9 with an owner and a date
- [ ] Each phase has one user-visible win and could ship alone
- [ ] There is a way to turn this off

If it runs past roughly three pages, either the feature is three features,
or explanation has crept in where decisions belong. Check which before
adding a fourth.