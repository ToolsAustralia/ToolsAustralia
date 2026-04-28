# Contact — Architecture

User submits form on `/contact/` → POSTs to `/api/contact-submissions/` → writes `ContactSubmission` row → admin reviews via admin panel.

No auto-reply email at present. _TODO: confirm._

Files:
- [src/app/(site)/contact/](../../src/app/(site)/contact/) — public page
- [src/app/api/contact-submissions/](../../src/app/api/contact-submissions/) — submission endpoint
- [src/models/ContactSubmission.ts](../../src/models/ContactSubmission.ts) — model
