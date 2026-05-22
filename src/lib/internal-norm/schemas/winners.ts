// src/lib/internal-norm/schemas/winners.ts
//
// Norm response schema for the winners.get read endpoint. Winners can be
// attached to either MajorDraw or MiniDraw (the `drawType` field discriminates).
//
// PII discipline:
// - winner.firstName + winner.state are exposed (operationally useful — same
//   restraint as `major-draw.participants`).
// - winner.lastName / winner.email / winner.mobile are intentionally NOT
//   projected — admin route returns them in its richer shape, but Norm receives
//   only the opaque `userId` correlation key plus first-name + state.
// - selectedBy (the admin who chose the winner) is fully stripped — Norm does
//   not get the selecting admin's id/name/email.
import { z } from "zod";

export const NormWinnerDetailSchema = z.object({
  id: z.string(),                              // Winner._id
  drawId: z.string(),
  drawName: z.string(),                        // joined name from MajorDraw or MiniDraw
  drawType: z.enum(["major", "mini"]),
  userId: z.string(),                          // opaque correlation key (Mongo User._id)
  firstName: z.string(),                       // PII-safe winner name surface
  state: z.string(),                           // AU state abbreviation or full name; "" when blank
  prize: z.object({
    name: z.string(),
    description: z.string(),
    value: z.number(),                         // AUD dollars
    images: z.array(z.string()),
  }),
  entryNumber: z.number().nullable(),
  selectedDate: z.string(),                    // ISO 8601 UTC
  imageUrl: z.string().nullable(),             // Cloudinary URL of the winner-selection photo
  drawResultUrl: z.string().nullable(),        // external verification link (RandomDraws)
  testimony: z.string().nullable(),            // free-form testimony recorded by admin
  selectedPrize: z.string().nullable(),        // free-text prize the winner chose; falls back to legacy slug
  selectedPrizeSlug: z.string().nullable(),    // legacy field; retained for parity
  cycle: z.number().int(),
  createdAt: z.string(),                       // ISO 8601 UTC
  updatedAt: z.string(),                       // ISO 8601 UTC
});
