import { NextResponse } from "next/server";
import { checkMajorDrawActiveForNewPurchases } from "./major-draw-helpers";

/**
 * Returns 403 JSON if major draw is not accepting new entry purchases; otherwise null.
 */
export async function enforceMajorDrawOpenForNewPurchasesOr403(): Promise<NextResponse | null> {
  const gate = await checkMajorDrawActiveForNewPurchases();
  if (gate.ok) return null;
  return NextResponse.json(
    {
      success: false,
      error: gate.message,
      code: gate.code,
      nextActivationDate: gate.nextActivationDate,
      nextDrawName: gate.nextDrawName,
    },
    { status: 403 }
  );
}
