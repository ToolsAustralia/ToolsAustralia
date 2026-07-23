import type { Connection } from "mongoose";
import { MEMBER } from "../helpers/db";

/** Required-when-active fields per src/models/MajorDraw.ts:145-166. */
export async function seedMajorDraw(c: Connection): Promise<void> {
  const now = new Date();
  const days = (n: number) => new Date(now.getTime() + n * 24 * 3600 * 1000);

  // The seeded member holds a real 15-entry position in the draw (added 2026-07-22):
  // an active Tradie subscriber with zero entries is a state production never produces,
  // and it made the dashboard demo's EntryWallet show "0". Subdoc shape verified against
  // src/models/MajorDraw.ts:47-64 (userId + totalEntries required) and what
  // getUserMajorDrawStats reads (src/utils/database/queries/major-draw-queries.ts:123-154).
  // totalEntries MUST equal the entriesBySource sum — EntryWallet displays the bucket sum
  // while e2e/helpers/db.ts entriesForUser() reads totalEntries; keep them consistent.
  const member = await c.collection("users").findOne({ email: MEMBER.email }, { projection: { _id: 1 } });
  if (!member) throw new Error("seedMajorDraw: seed users before the draw — member not found");

  await c.collection("majordraws").insertOne({
    name: "E2E Major Draw",
    description: "Seeded draw for automated end-to-end tests.",
    status: "active",
    isActive: true,
    activationDate: days(-1),
    drawDate: days(20),
    freezeEntriesAt: days(19),
    entries: [
      {
        userId: member._id,
        totalEntries: 15,
        entriesBySource: { membership: 15 },
        firstAddedDate: now,
        lastUpdatedDate: now,
      },
    ],
    totalEntries: 15,
    createdAt: now,
    updatedAt: now,
  });
}
