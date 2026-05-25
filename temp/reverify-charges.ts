/**
 * RE-VERIFY (authoritative) — distinguishes AUTHORIZED vs CAPTURED money.
 * Ground truth = net captured (amount_captured - amount_refunded) and PI.amount_received,
 * which must equal the Stripe dashboard "Spent". READ-ONLY.
 */
import { config } from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Stripe from "stripe";

config({ path: path.resolve(process.cwd(), ".env.local") });

const CASES: Record<string, string[]> = {
  "#3 double-charge": [
    "aedanmccu@gmail.com", "gaza-r-k@hotmail.com", "jacobrowan85@gmail.com",
    "ben.grantham.98@hotmail.com", "liammurray454@gmail.com", "rusty_4eva154@hotmail.com",
    "ranifesaitu@yahoo.com", "lewis.mayers@hotmail.com", "gypseymiller67@gmail.com",
  ],
  "#4 cancelled-but-charged": [
    "jacson_lalande98@hotmail.com", "cecil.farah1@gmail.com", "lowriemark4@gmail.com",
    "bigdano@y7mail.com", "tasulu2008@live.com",
  ],
};

const isoU = (s?: number | null) => (s ? new Date(s * 1000).toISOString().slice(0, 16).replace("T", " ") : "—");
const last = (s?: string | null, n = 8) => (s ? "…" + s.slice(-n) : "—");
const d2 = (cents?: number | null) => (cents == null ? "?" : (cents / 100).toFixed(2));

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const users = db.collection("users");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!) as Stripe;

  for (const [group, emails] of Object.entries(CASES)) {
    console.log(`\n################ ${group} ################`);
    for (const email of emails) {
      console.log(`\n----- ${email} -----`);
      const u = await users.findOne({ email: email.toLowerCase() }, { projection: { stripeCustomerId: 1 } });
      const custIds = new Set<string>();
      if (u?.stripeCustomerId) custIds.add(u.stripeCustomerId as string);
      try {
        const found = await stripe.customers.list({ email: email.toLowerCase(), limit: 10 });
        for (const c of found.data) custIds.add(c.id);
      } catch { /* ignore */ }
      if (custIds.size === 0) { console.log("  no stripe customer"); continue; }

      for (const cid of custIds) {
        // PaymentIntents (authoritative status + amount_received)
        const pis = await stripe.paymentIntents.list({ customer: cid, limit: 100 });
        let received = 0;
        const piRows = pis.data
          .map((p) => ({ id: p.id, created: p.created, amount: p.amount, status: p.status, recv: p.amount_received }))
          .sort((a, b) => a.created - b.created);
        for (const p of piRows) received += p.recv;

        // Charges (authoritative capture/refund)
        const charges = await stripe.charges.list({ customer: cid, limit: 100 });
        let netCaptured = 0;
        const chRows = charges.data
          .map((c) => ({
            created: c.created, amount: c.amount, status: c.status, paid: c.paid, captured: c.captured,
            amount_captured: c.amount_captured, amount_refunded: c.amount_refunded, refunded: c.refunded,
            pi: typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id,
          }))
          .sort((a, b) => a.created - b.created);
        for (const c of chRows) netCaptured += (c.amount_captured || 0) - (c.amount_refunded || 0);

        console.log(`  customer ${cid}`);
        console.log(`  >> NET CAPTURED (charges amount_captured - refunded): A$${d2(netCaptured)}`);
        console.log(`  >> PI amount_received total:                          A$${d2(received)}   (should equal dashboard "Spent")`);
        console.log(`  PaymentIntents (${piRows.length}):`);
        for (const p of piRows) console.log(`     ${isoU(p.created)}  A$${d2(p.amount)}  status=${p.status}  received=A$${d2(p.recv)}  ${last(p.id)}`);
        console.log(`  Charges (${chRows.length}):`);
        for (const c of chRows) console.log(`     ${isoU(c.created)}  A$${d2(c.amount)}  status=${c.status} paid=${c.paid} captured=${c.captured} amt_captured=A$${d2(c.amount_captured)} refunded=A$${d2(c.amount_refunded)} pi=${last(c.pi)}`);

        // TRUE double-capture: >=2 PIs with received>0, same amount, <30min apart
        const realPaid = piRows.filter((p) => p.recv > 0).sort((a, b) => a.created - b.created);
        let trueDup = false;
        for (let i = 1; i < realPaid.length; i++) {
          if (realPaid[i].amount === realPaid[i - 1].amount && realPaid[i].created - realPaid[i - 1].created <= 1800) {
            console.log(`     ⚠ TRUE DOUBLE-CAPTURE: two A$${d2(realPaid[i].amount)} RECEIVED ${realPaid[i].created - realPaid[i - 1].created}s apart`);
            trueDup = true;
          }
        }
        if (!trueDup) console.log(`     ✓ no true double-capture (multiple attempts but only one captured per window)`);
      }
    }
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
