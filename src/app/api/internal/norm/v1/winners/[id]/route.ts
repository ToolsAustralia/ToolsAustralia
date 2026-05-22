import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormWinnerDetailSchema } from "@/lib/internal-norm/schemas/winners";
import { getWinnerDetail } from "@/services/admin/MajorDrawService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "winners.get",
    requiredPermission: "majorDraw.view",
    responseSchema: NormWinnerDetailSchema,
  },
  async (ctx) => {
    const id = ctx.param(0) ?? "";
    if (!id) return ctx.error(400, "bad_path", "Missing winner id");

    const outcome = await getWinnerDetail(id);
    if (!outcome.ok) {
      if (outcome.code === "bad_id") {
        return ctx.error(400, "bad_id", "Invalid winner id");
      }
      return ctx.error(404, "not_found", "Winner not found");
    }

    // PII projection: strip lastName, email, and the entire selectedBy block
    // (the admin route returns those fields; Norm receives only firstName +
    // state + the opaque userId correlation key).
    const d = outcome.data;
    return ctx.ok({
      id: d.id,
      drawId: d.drawId,
      drawName: d.drawName,
      drawType: d.drawType,
      userId: d.userId,
      firstName: d.winnerFirstName,
      state: d.winnerState,
      prize: d.prize,
      entryNumber: d.entryNumber,
      selectedDate: d.selectedDate,
      imageUrl: d.imageUrl,
      drawResultUrl: d.drawResultUrl,
      testimony: d.testimony,
      selectedPrize: d.selectedPrize,
      selectedPrizeSlug: d.selectedPrizeSlug,
      cycle: d.cycle,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    });
  },
);
