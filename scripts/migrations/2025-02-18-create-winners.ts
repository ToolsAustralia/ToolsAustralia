import mongoose from "mongoose";
import connectDB from "../../src/lib/mongodb";
import MiniDraw from "../../src/models/MiniDraw";
import MajorDraw from "../../src/models/MajorDraw";
import Winner from "../../src/models/Winner";

async function migrateWinners() {
  await connectDB();

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = {
      miniCreated: 0,
      majorCreated: 0,
      miniSkipped: 0,
      majorSkipped: 0,
    };

    const now = new Date();

    const miniDraws = await MiniDraw.find({ "winner.userId": { $exists: true } }).session(session);
    for (const draw of miniDraws) {
      if (!draw.winner?.userId) {
        results.miniSkipped += 1;
        continue;
      }

      const existingWinner = await Winner.findOne({ drawId: draw._id, drawType: "mini" }).session(session);
      if (existingWinner) {
        results.miniSkipped += 1;
        continue;
      }

      // Snapshot the prize details so the Winner record stays accurate even if the draw changes later
      // Use either the existing prize snapshot or fall back to the draw metadata
      const prize = draw.prize || {
        name: draw.name,
        description: draw.description,
        value: 0,
        images: [],
        category: undefined,
      };

      const winnerDoc = await Winner.create(
        [
          {
            drawId: draw._id,
            drawType: "mini",
            userId: draw.winner.userId,
            entryNumber: draw.winner.entryNumber,
            selectedDate: draw.winner.selectedDate || now,
            selectionMethod: draw.winner.selectionMethod,
            notified: draw.winner.notified ?? false,
            selectedBy: draw.winner.selectedBy,
            prizeSnapshot: {
              name: prize.name,
              description: prize.description,
              value: prize.value ?? 0,
              images: prize.images ?? [],
              category: prize.category,
            },
            fulfillmentStatus: draw.winner.notified ? "contacted" : "pending",
            cycle: (draw as unknown as { cycle?: number }).cycle ?? 1,
          },
        ],
        { session }
      );

      draw.set({
        latestWinnerId: winnerDoc[0]._id,
        winnerHistory: [...(draw.winnerHistory || []), winnerDoc[0]._id],
      });

      results.miniCreated += 1;

      await draw.save({ session });
    }

    const majorDraws = await MajorDraw.find({ "winner.userId": { $exists: true } }).session(session);
    for (const draw of majorDraws) {
      if (!draw.winner?.userId) {
        results.majorSkipped += 1;
        continue;
      }

      const existingWinner = await Winner.findOne({ drawId: draw._id, drawType: "major" }).session(session);
      if (existingWinner) {
        results.majorSkipped += 1;
        continue;
      }

      const prize = draw.prize || {
        name: draw.name,
        description: draw.description,
        value: 0,
        images: [],
        category: undefined,
      };

      const winnerDoc = await Winner.create(
        [
          {
            drawId: draw._id,
            drawType: "major",
            userId: draw.winner.userId,
            entryNumber: draw.winner.entryNumber ?? 0,
            selectedDate: draw.winner.selectedDate || now,
            selectionMethod: draw.winner.selectionMethod,
            notified: draw.winner.notified ?? false,
            selectedBy: draw.winner.selectedBy,
            prizeSnapshot: {
              name: prize.name ?? draw.name,
              description: prize.description ?? draw.description,
              value: prize.value ?? 0,
              images: prize.images ?? [],
              category: prize.category,
            },
            fulfillmentStatus: draw.winner.notified ? "contacted" : "pending",
            cycle: 1,
          },
        ],
        { session }
      );

      draw.set({
        latestWinnerId: winnerDoc[0]._id,
        winnerHistory: [...(draw.winnerHistory || []), winnerDoc[0]._id],
      });

      results.majorCreated += 1;

      await draw.save({ session });
    }

    await session.commitTransaction();
    console.log("✅ Winner migration completed", results);
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Winner migration failed:", error);
    throw error;
  } finally {
    await session.endSession();
    await mongoose.disconnect();
  }
}

void migrateWinners();
