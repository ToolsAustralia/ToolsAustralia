import type { Connection } from "mongoose";

/** Required-when-active fields per src/models/MajorDraw.ts:145-166. */
export async function seedMajorDraw(c: Connection): Promise<void> {
  const now = new Date();
  const days = (n: number) => new Date(now.getTime() + n * 24 * 3600 * 1000);
  await c.collection("majordraws").insertOne({
    name: "E2E Major Draw",
    description: "Seeded draw for automated end-to-end tests.",
    status: "active",
    isActive: true,
    activationDate: days(-1),
    drawDate: days(20),
    freezeEntriesAt: days(19),
    entries: [],
    totalEntries: 0,
    createdAt: now,
    updatedAt: now,
  });
}
