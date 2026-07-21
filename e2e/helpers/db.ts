import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { resolveE2eEnv } from "../lib/env";

let conn: typeof mongoose | null = null;

export const MEMBER = {
  email: (process.env.E2E_TEST_USER_EMAIL || "e2e.member@e2e.local").toLowerCase(),
  password: process.env.E2E_TEST_USER_PASSWORD || "E2e!Passw0rd",
};
export const ADMIN = { email: "e2e.admin@e2e.local", password: MEMBER.password };

export async function connectE2eDb(): Promise<typeof mongoose> {
  if (conn) return conn;
  const { mongoUri } = resolveE2eEnv(); // re-runs the safety guard on every connection
  conn = await mongoose.connect(mongoUri);
  return conn;
}

export async function disconnectE2eDb(): Promise<void> {
  if (conn) { await conn.disconnect(); conn = null; }
}

export async function findUserByEmail(email: string) {
  const db = await connectE2eDb();
  return db.connection.collection("users").findOne({ email: email.toLowerCase() });
}

/** Total entries the active major draw holds for this user (0 when none). */
export async function entriesForUser(userId: string): Promise<number> {
  const db = await connectE2eDb();
  const draw = await db.connection
    .collection("majordraws")
    .findOne({ status: "active" }, { projection: { entries: 1 } });
  const rows = (draw?.entries ?? []).filter((e: { userId?: unknown }) => String(e.userId) === String(userId));
  return rows.reduce((sum: number, e: { totalEntries?: number }) => sum + (e.totalEntries ?? 0), 0);
}

/** Exactly-once proof: count of BenefitsGranted payment events.
 * For kind "invoice", pass raw invoice id (e.g. "inv_abc") — "invoice_" prefix added here.
 * For kind "pi", pass full payment-intent id (e.g. "pi_abc") — used verbatim as namespace.
 */
export async function benefitsGrantedCount(kind: "invoice" | "pi", id: string): Promise<number> {
  const db = await connectE2eDb();
  const docId = kind === "invoice" ? `BenefitsGranted-invoice_${id}` : `BenefitsGranted-${id}`;
  return db.connection
    .collection<{ _id: string }>("paymentevents")
    .countDocuments({ _id: docId });
}

/** Creates a credentials-login-capable user directly (register API makes passwordless users). */
export async function createLoginableUser(opts: {
  email: string;
  password: string;
  firstName?: string;
}): Promise<{ id: string; email: string }> {
  const db = await connectE2eDb();
  const email = opts.email.toLowerCase();
  const hash = await bcrypt.hash(opts.password, 12);
  const res = await db.connection.collection("users").insertOne({
    email,
    password: hash,
    firstName: opts.firstName ?? "E2E",
    lastName: "Tester",
    role: "user",
    userType: "customer",
    isActive: true,
    isEmailVerified: true,
    profileSetupCompleted: true,
    birthdate: new Date("1990-01-01"),
    state: "NSW",
    tokenVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id: String(res.insertedId), email };
}
