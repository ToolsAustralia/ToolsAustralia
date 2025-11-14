import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MiniDraw from "@/models/MiniDraw";
import { z } from "zod";
import { verify } from "jsonwebtoken";
import { JwtPayload } from "jsonwebtoken";

// Validation schemas
const purchaseTicketsSchema = z.object({
  miniDrawId: z.string().min(1),
  quantity: z.number().int().min(1),
  useFreeEntries: z.boolean().optional().default(false),
});

const useFreeEntriesSchema = z.object({
  miniDrawId: z.string().min(1),
  quantity: z.number().int().min(1),
});

// Helper function to get user from token
async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("No token provided");
  }

  const token = authHeader.substring(7);
  const decoded = verify(token, process.env.NEXTAUTH_SECRET!) as JwtPayload;
  const user = await User.findById(decoded.userId);

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

// GET - Get user's available entries and mini draw info
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await getUserFromToken(request);
    const { searchParams } = new URL(request.url);
    const miniDrawId = searchParams.get("miniDrawId");

    if (!miniDrawId) {
      return NextResponse.json({
        availableEntries: user.entryWallet,
        accumulatedEntries: user.accumulatedEntries,
        message: "User entry information retrieved successfully",
      });
    }

    // Get specific mini draw information
    const miniDraw = await MiniDraw.findById(miniDrawId);
    if (!miniDraw) {
      return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
    }

    // Check if user already has entries in this mini draw
    const userTickets = miniDraw.tickets.filter(
      (ticket: { userId: { toString: () => string } }) => ticket.userId.toString() === user._id.toString()
    );

    return NextResponse.json({
      availableEntries: user.entryWallet,
      accumulatedEntries: user.accumulatedEntries,
      miniDraw: {
        id: miniDraw._id,
        name: miniDraw.name,
        ticketPrice: miniDraw.ticketPrice,
        totalTickets: miniDraw.totalTickets,
        soldTickets: miniDraw.soldTickets,
        ticketsRemaining: miniDraw.totalTickets - miniDraw.soldTickets,
        isActive: miniDraw.isActive,
        startDate: miniDraw.startDate,
        endDate: miniDraw.endDate,
      },
      userTickets: userTickets.length,
      canUseFreeEntries: user.entryWallet > 0 && miniDraw.isActive,
    });
  } catch (error) {
    console.error("Error fetching entry information:", error);
    return NextResponse.json({ error: "Failed to fetch entry information" }, { status: 500 });
  }
}

// POST - Purchase tickets or use free entries
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await getUserFromToken(request);
    const body = await request.json();
    const validatedData = purchaseTicketsSchema.parse(body);

    const miniDraw = await MiniDraw.findById(validatedData.miniDrawId);
    if (!miniDraw) {
      return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
    }

    // Validate mini draw is active and accepting entries
    const now = new Date();
    if (!miniDraw.isActive || now < miniDraw.startDate || now > miniDraw.endDate) {
      return NextResponse.json(
        {
          error: "Mini draw is not currently accepting entries",
        },
        { status: 400 }
      );
    }

    // Check if there are enough tickets remaining
    const ticketsRemaining = miniDraw.totalTickets - miniDraw.soldTickets;
    if (ticketsRemaining < validatedData.quantity) {
      return NextResponse.json(
        {
          error: `Only ${ticketsRemaining} tickets remaining`,
        },
        { status: 400 }
      );
    }

    // Check if user has enough free entries (if requested)
    if (validatedData.useFreeEntries && user.entryWallet < validatedData.quantity) {
      return NextResponse.json(
        {
          error: `Insufficient free entries. You have ${user.entryWallet} available.`,
        },
        { status: 400 }
      );
    }

    // Generate ticket numbers
    const ticketNumbers = [];
    const startTicketNumber = miniDraw.soldTickets + 1;

    for (let i = 0; i < validatedData.quantity; i++) {
      ticketNumbers.push(startTicketNumber + i);
    }

    // Add tickets to mini draw
    const newTickets = ticketNumbers.map((ticketNumber) => ({
      ticketNumber,
      userId: user._id,
      purchaseDate: new Date(),
      source: validatedData.useFreeEntries ? "membership" : "purchase",
      isWinner: false,
    }));

    miniDraw.tickets.push(...newTickets);
    miniDraw.soldTickets += validatedData.quantity;

    // Update user's entry wallet if using free entries
    if (validatedData.useFreeEntries) {
      user.entryWallet -= validatedData.quantity;
    }

    // Update user's accumulated entries
    user.accumulatedEntries += validatedData.quantity;

    // Save changes
    await Promise.all([miniDraw.save(), user.save()]);

    return NextResponse.json({
      message: validatedData.useFreeEntries
        ? `Successfully used ${validatedData.quantity} free entries`
        : `Successfully purchased ${validatedData.quantity} tickets`,
      tickets: newTickets,
      totalCost: validatedData.useFreeEntries ? 0 : validatedData.quantity * miniDraw.ticketPrice,
      remainingEntries: user.entryWallet,
      accumulatedEntries: user.accumulatedEntries,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error purchasing tickets:", error);
    return NextResponse.json({ error: "Failed to purchase tickets" }, { status: 500 });
  }
}

// PUT - Use free entries only
export async function PUT(request: NextRequest) {
  try {
    await connectDB();
    const user = await getUserFromToken(request);
    const body = await request.json();
    const validatedData = useFreeEntriesSchema.parse(body);

    const miniDraw = await MiniDraw.findById(validatedData.miniDrawId);
    if (!miniDraw) {
      return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
    }

    // Validate mini draw is active and accepting entries
    const now = new Date();
    if (!miniDraw.isActive || now < miniDraw.startDate || now > miniDraw.endDate) {
      return NextResponse.json(
        {
          error: "Mini draw is not currently accepting entries",
        },
        { status: 400 }
      );
    }

    // Check if there are enough tickets remaining
    const ticketsRemaining = miniDraw.totalTickets - miniDraw.soldTickets;
    if (ticketsRemaining < validatedData.quantity) {
      return NextResponse.json(
        {
          error: `Only ${ticketsRemaining} tickets remaining`,
        },
        { status: 400 }
      );
    }

    // Check if user has enough free entries
    if (user.entryWallet < validatedData.quantity) {
      return NextResponse.json(
        {
          error: `Insufficient free entries. You have ${user.entryWallet} available.`,
        },
        { status: 400 }
      );
    }

    // Generate ticket numbers
    const ticketNumbers = [];
    const startTicketNumber = miniDraw.soldTickets + 1;

    for (let i = 0; i < validatedData.quantity; i++) {
      ticketNumbers.push(startTicketNumber + i);
    }

    // Add tickets to mini draw
    const newTickets = ticketNumbers.map((ticketNumber) => ({
      ticketNumber,
      userId: user._id,
      purchaseDate: new Date(),
      source: "membership",
      isWinner: false,
    }));

    miniDraw.tickets.push(...newTickets);
    miniDraw.soldTickets += validatedData.quantity;

    // Update user's entry wallet
    user.entryWallet -= validatedData.quantity;

    // Save changes
    await Promise.all([miniDraw.save(), user.save()]);

    return NextResponse.json({
      message: `Successfully used ${validatedData.quantity} free entries`,
      tickets: newTickets,
      remainingEntries: user.entryWallet,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error using free entries:", error);
    return NextResponse.json({ error: "Failed to use free entries" }, { status: 500 });
  }
}
