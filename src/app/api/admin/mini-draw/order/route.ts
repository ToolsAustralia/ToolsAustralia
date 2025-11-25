import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MiniDraw from "@/models/MiniDraw";
import mongoose from "mongoose";
import { z } from "zod";

const orderSchema = z.object({
  orderedIds: z.array(z.string().min(1, "Mini draw id is required")).min(1, "Provide at least one mini draw id"),
});

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { orderedIds } = orderSchema.parse(body);

    const operations = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(id) },
        update: { $set: { displayOrder: index + 1 } },
      },
    }));

    if (operations.length === 0) {
      return NextResponse.json({ success: true, message: "Nothing to update" });
    }

    await MiniDraw.bulkWrite(operations);

    return NextResponse.json({
      success: true,
      message: "Mini draw order updated",
    });
  } catch (error) {
    console.error("Failed to update mini draw order:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update mini draw order",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



