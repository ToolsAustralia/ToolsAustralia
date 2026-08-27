import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { listPrintProviderProducts } from "@/lib/print-provider/client";
import {
  syncAllPrintProviderProducts,
  syncByPlatformProductId,
} from "@/services/shop/printProviderSync";

/**
 * Pull garments from the print provider into the catalogue.
 *
 * GET  — what the provider will show us, and whether we already hold it.
 * POST — sync one product by our own `platformProductId`, or sync everything.
 *
 * The provider's product ids never cross this boundary in either direction. They
 * are opaque and may embed the account uid, so the listing exposes names only and
 * a re-sync is addressed by the stable id we persist.
 *
 * POST is slow by nature — every colour mockup is downloaded and re-uploaded to
 * Cloudinary — so it runs on the Node runtime with a raised duration rather than
 * behind a job queue nobody asked for.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

const syncSchema = z
  .object({
    platformProductId: z.string().trim().min(1).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.platformProductId) !== Boolean(v.all), {
    message: "Provide either platformProductId or all, not both",
  });

export async function GET() {
  const guard = await requirePermission("shop.view");
  if (guard instanceof NextResponse) return guard;

  try {
    await connectDB();
    const available = await listPrintProviderProducts();

    const held = await Product.find(
      { "printProvider.platformProductId": { $exists: true } },
      {
        name: 1,
        isActive: 1,
        price: 1,
        "printProvider.platformProductId": 1,
        "printProvider.syncedAt": 1,
      }
    ).lean<
      {
        _id: unknown;
        name?: string;
        isActive?: boolean;
        price?: number;
        printProvider?: { platformProductId?: string; syncedAt?: Date };
      }[]
    >();

    // Matched on name, because the provider id is not something we keep.
    const byName = new Map(held.map((h) => [h.name ?? "", h]));

    return NextResponse.json({
      success: true,
      products: available.map((p) => {
        const match = byName.get(p.name);
        return {
          name: p.name,
          synced: Boolean(match),
          productId: match ? String(match._id) : null,
          platformProductId: match?.printProvider?.platformProductId ?? null,
          syncedAt: match?.printProvider?.syncedAt ?? null,
          isActive: match?.isActive ?? null,
          price: match?.price ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("[admin] print provider listing failed", error);
    return NextResponse.json(
      { success: false, error: "Could not reach the print provider" },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  // No resourceId: a sync can touch several products at once, and the audit row's
  // path plus method already identify the action.
  const guard = await requirePermissionWithAudit("shop.edit", request, {
    resourceType: "Product",
  });
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    await connectDB();
    const results = parsed.data.all
      ? await syncAllPrintProviderProducts()
      : [await syncByPlatformProductId(parsed.data.platformProductId!)];

    guard.log(200);
    return NextResponse.json({ success: true, results });
  } catch (error) {
    // The adapter masks the API key out of its own messages, but keep the client
    // response generic regardless.
    console.error("[admin] print provider sync failed", error);
    return NextResponse.json(
      { success: false, error: "Sync failed — see server logs" },
      { status: 502 }
    );
  }
}
