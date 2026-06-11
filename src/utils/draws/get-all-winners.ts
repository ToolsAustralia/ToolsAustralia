import { Types } from "mongoose";
import connectDB from "@/lib/mongodb";
import Winner from "@/models/Winner";
// Importing these ensures the User & MajorDraw models are registered before populate.
import User from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import type { WinnerSummary } from "@/types/winner";

// Suppress unused import warning - imports are needed for model registration.
void User;
void MajorDraw;

/** Safely extract an ObjectId string from a populated or unpopulated ref. */
const toIdString = (
  id: Types.ObjectId | string | { _id?: Types.ObjectId | string } | undefined,
): string => {
  if (!id) return "";
  if (id instanceof Types.ObjectId) return id.toString();
  if (typeof id === "string") return id;
  if (typeof id === "object" && "_id" in id && id._id) {
    return id._id instanceof Types.ObjectId ? id._id.toString() : String(id._id);
  }
  return String(id);
};

export interface GetAllWinnersOptions {
  /** Max winners to return (applied per-type before the final merge+slice). Defaults to 20. */
  limit?: number;
  /** Restrict to a single draw type. Omit/undefined for the merged feed. */
  drawType?: "major" | "mini" | null;
}

/**
 * Loads the unified winners feed (major + mini), newest first.
 *
 * This is the single source of truth shared by the public `/api/winners/all`
 * route and the SSR `/draw-results` page. Both major and mini winners come from
 * the one `Winner` collection; major draws additionally populate their parent
 * `MajorDraw` for the canonical name/prize/draw-end-date. Names are kept raw
 * here (firstName/lastName) — callers format to "First L." for public display.
 */
export async function getAllWinners({
  limit = 20,
  drawType = null,
}: GetAllWinnersOptions = {}): Promise<WinnerSummary[]> {
  await connectDB();

  const winners: WinnerSummary[] = [];

  // ---- Major draw winners ---------------------------------------------------
  if (!drawType || drawType === "major") {
    const majorDrawWinners = await Winner.find({ drawType: "major" })
      .sort({ selectedDate: -1 })
      .limit(limit)
      .populate("userId", "firstName lastName state")
      .populate({
        path: "drawId",
        model: "MajorDraw", // string model name is consistent with the codebase pattern
        select: "name prize drawDate resultUrl watchUrl",
      })
      .lean();

    majorDrawWinners.forEach((winner) => {
      const w = winner as unknown as {
        _id: Types.ObjectId | string;
        drawId:
          | Types.ObjectId
          | string
          | {
              _id?: Types.ObjectId | string;
              name?: string;
              prize?: { name?: string; description?: string; value?: number; images?: string[] };
              drawDate?: Date;
              resultUrl?: string;
              watchUrl?: string;
            };
        userId: Types.ObjectId | string | { firstName?: string; lastName?: string; state?: string };
        prizeSnapshot?: { name?: string; description?: string; value?: number; images?: string[] };
        imageUrl?: string;
        selectedDate: Date;
        entryNumber?: number;
        testimony?: string;
        selectedPrize?: string;
        selectedPrizeSlug?: string; // legacy field
        drawResultUrl?: string;
        cycle?: number;
      };

      const winnerUser =
        typeof w.userId === "object" && !(w.userId instanceof Types.ObjectId) && "firstName" in w.userId
          ? w.userId
          : null;

      const majorDraw =
        typeof w.drawId === "object" && !(w.drawId instanceof Types.ObjectId) && "name" in w.drawId
          ? (w.drawId as {
              name?: string;
              prize?: { name?: string; description?: string; value?: number; images?: string[] };
              drawDate?: Date;
              resultUrl?: string;
              watchUrl?: string;
            })
          : null;

      // "Won on" = draw end date (drawDate) when available, not the admin selection date.
      const wonOnDate = majorDraw?.drawDate ? majorDraw.drawDate : w.selectedDate;

      winners.push({
        id: toIdString(w._id),
        drawId: toIdString(w.drawId),
        drawName: majorDraw?.name || w.prizeSnapshot?.name || "Major Draw",
        drawType: "major",
        // Prefer the LIVE draw record (what admin edits) over the point-in-time
        // prizeSnapshot, so editing a completed draw's image/name updates the
        // public page immediately instead of showing the stale snapshot.
        prize: {
          name: majorDraw?.prize?.name || w.prizeSnapshot?.name || "Major Prize",
          description: majorDraw?.prize?.description || w.prizeSnapshot?.description || "",
          value: majorDraw?.prize?.value || w.prizeSnapshot?.value || 0,
          images:
            (majorDraw?.prize?.images?.length ? majorDraw.prize.images : w.prizeSnapshot?.images) || [],
        },
        winnerFirstName: winnerUser?.firstName || "",
        winnerLastName: winnerUser?.lastName || "",
        winnerState: winnerUser?.state || "",
        imageUrl: w.imageUrl,
        selectedDate: w.selectedDate.toISOString(),
        wonOnDate: wonOnDate.toISOString(),
        entryNumber: w.entryNumber,
        testimony: w.testimony || undefined,
        selectedPrize: w.selectedPrize || w.selectedPrizeSlug || undefined,
        // Draw-level result/watch links (set in admin "Edit Draw") win over the
        // legacy per-winner drawResultUrl, so they stay in sync after an edit.
        drawResultUrl: majorDraw?.resultUrl || w.drawResultUrl,
        watchUrl: majorDraw?.watchUrl || undefined,
        cycle: w.cycle || 1,
      });
    });
  }

  // ---- Mini draw winners ----------------------------------------------------
  if (!drawType || drawType === "mini") {
    const miniDrawWinners = await Winner.find({ drawType: "mini" })
      .sort({ selectedDate: -1 })
      .limit(limit)
      .populate("userId", "firstName lastName state")
      .lean();

    miniDrawWinners.forEach((winner) => {
      const w = winner as unknown as {
        _id: Types.ObjectId | string;
        drawId: Types.ObjectId | string;
        userId: Types.ObjectId | string | { firstName?: string; lastName?: string; state?: string };
        prizeSnapshot?: { name?: string; description?: string; value?: number; images?: string[] };
        imageUrl?: string;
        selectedDate: Date;
        entryNumber?: number;
        testimony?: string;
        selectedPrize?: string;
        selectedPrizeSlug?: string; // legacy field
        drawResultUrl?: string;
        cycle?: number;
      };

      const winnerUser =
        typeof w.userId === "object" && !(w.userId instanceof Types.ObjectId) && "firstName" in w.userId
          ? w.userId
          : null;

      // Mini draws don't carry a drawDate on the model; use selectedDate for "won on".
      winners.push({
        id: toIdString(w._id),
        drawId: toIdString(w.drawId),
        drawName: w.prizeSnapshot?.name || "Mini Draw",
        drawType: "mini",
        prize: {
          name: w.prizeSnapshot?.name || "",
          description: w.prizeSnapshot?.description || "",
          value: w.prizeSnapshot?.value || 0,
          images: w.prizeSnapshot?.images || [],
        },
        winnerFirstName: winnerUser?.firstName || "",
        winnerLastName: winnerUser?.lastName || "",
        winnerState: winnerUser?.state || "",
        imageUrl: w.imageUrl,
        selectedDate: w.selectedDate.toISOString(),
        wonOnDate: w.selectedDate.toISOString(),
        entryNumber: w.entryNumber,
        testimony: w.testimony || undefined,
        selectedPrize: w.selectedPrize || w.selectedPrizeSlug || undefined,
        drawResultUrl: w.drawResultUrl,
        cycle: w.cycle || 1,
      });
    });
  }

  // Merge both types, newest first, then cap at `limit`.
  winners.sort((a, b) => new Date(b.selectedDate).getTime() - new Date(a.selectedDate).getTime());

  return winners.slice(0, limit);
}
