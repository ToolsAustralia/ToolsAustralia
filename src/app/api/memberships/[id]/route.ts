import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import MembershipPackage from "@/models/MembershipPackage";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().min(1),
});

const updateMembershipSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["subscription", "one-time", "additional"]).optional(),
  price: z.number().positive().optional(),
  description: z.string().min(1).optional(),
  features: z.array(z.string()).min(1).optional(),
  stripeProductId: z.string().optional(),
  stripePriceId: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const membership = await MembershipPackage.findById(id);

    if (!membership) {
      return NextResponse.json({ error: "Membership package not found" }, { status: 404 });
    }

    return NextResponse.json({ membership });
  } catch (error) {
    console.error("Error fetching membership:", error);
    return NextResponse.json({ error: "Failed to fetch membership package" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const body = await request.json();
    const validatedData = updateMembershipSchema.parse(body);

    const membership = await MembershipPackage.findByIdAndUpdate(id, validatedData, { new: true });

    if (!membership) {
      return NextResponse.json({ error: "Membership package not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Membership package updated successfully",
      membership,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error updating membership:", error);
    return NextResponse.json({ error: "Failed to update membership package" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const membership = await MembershipPackage.findByIdAndDelete(id);

    if (!membership) {
      return NextResponse.json({ error: "Membership package not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Membership package deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting membership:", error);
    return NextResponse.json({ error: "Failed to delete membership package" }, { status: 500 });
  }
}
