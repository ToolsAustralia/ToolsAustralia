import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MiniDraw from "@/models/MiniDraw";
import { z } from "zod";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Validation schema for mini draw creation (without images - images uploaded separately after validation)
const createMiniDrawSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
  description: z.string().min(1, "Description is required").max(2000, "Description too long"),
  minimumEntries: z.number().int().min(1, "Minimum entries must be at least 1"),
  status: z.enum(["active", "cancelled"]).optional(),
  prize: z.object({
    name: z.string().min(1, "Prize name is required"),
    description: z.string().min(1, "Prize description is required"),
    value: z.number().min(0, "Prize value must be positive"),
    category: z.enum(["vehicle", "electronics", "travel", "cash", "experience", "home", "fashion", "sports", "other"]),
  }),
});

// Helper function to upload images to Cloudinary
async function uploadImageToCloudinary(file: File, folder: string = "mini-draws"): Promise<string> {
  // Validate file type
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image");
  }

  // Validate file size (10MB max)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error("File size must be less than 10MB");
  }

  // Convert file to buffer
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Upload to Cloudinary
  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: folder,
          resource_type: "auto",
          quality: "auto",
          fetch_format: "auto",
          transformation: [
            { width: 1200, height: 1200, crop: "limit" }, // Limit max dimensions
            { quality: "auto" },
            { fetch_format: "auto" },
          ],
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve(result);
          } else {
            reject(new Error("Upload failed"));
          }
        }
      )
      .end(buffer);
  });

  return result.secure_url;
}

/**
 * POST /api/admin/mini-draw/create
 * Create a new mini draw (no monthly restriction - multiple minidraws can be active)
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🎲 Creating new mini draw...");

    // Parse FormData
    const formData = await request.formData();

    // Extract text fields
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const minimumEntriesStr = formData.get("minimumEntries") as string;
    const statusStr = (formData.get("status") as string | null) ?? undefined;
    const prizeName = formData.get("prize.name") as string;
    const prizeDescription = formData.get("prize.description") as string;
    const prizeValue = formData.get("prize.value") as string;
    const prizeCategory = formData.get("prize.category") as string;

    // Extract image files
    const imageFiles: File[] = [];
    const images = formData.getAll("images");
    for (const image of images) {
      if (image instanceof File) {
        imageFiles.push(image);
      }
    }

    // Validate at least one image is provided
    if (imageFiles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: [{ field: "prize.images", message: "At least one prize image is required" }],
        },
        { status: 400 }
      );
    }

    // Prepare data for validation
    const dataToValidate = {
      name,
      description,
      minimumEntries: parseInt(minimumEntriesStr, 10),
      status: statusStr as "active" | "cancelled" | undefined,
      prize: {
        name: prizeName,
        description: prizeDescription,
        value: parseFloat(prizeValue),
        category: prizeCategory,
      },
    };

    // ✅ STEP 1: Validate all fields (EXCEPT images) BEFORE uploading to Cloudinary
    const validatedData = createMiniDrawSchema.parse(dataToValidate);

    // ✅ STEP 2: Upload images to Cloudinary ONLY AFTER validation passes
    console.log(`📤 Uploading ${imageFiles.length} image(s) to Cloudinary...`);
    const imageUrls: string[] = [];

    try {
      for (const file of imageFiles) {
        const url = await uploadImageToCloudinary(file, "mini-draws");
        imageUrls.push(url);
        console.log(`✅ Uploaded image: ${file.name} -> ${url}`);
      }
    } catch (uploadError) {
      console.error("❌ Image upload failed:", uploadError);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to upload images",
          details: uploadError instanceof Error ? uploadError.message : "Image upload failed",
        },
        { status: 500 }
      );
    }

    // ✅ STEP 3: Create mini draw with uploaded image URLs
    console.log(`📝 Creating mini draw with ${imageUrls.length} uploaded image(s)...`);
    const newMiniDraw = new MiniDraw({
      name: validatedData.name.trim(),
      description: validatedData.description.trim(),
      prize: {
        name: validatedData.prize.name.trim(),
        description: validatedData.prize.description.trim(),
        value: validatedData.prize.value,
        images: imageUrls,
        category: validatedData.prize.category,
      },
      minimumEntries: validatedData.minimumEntries,
      status: validatedData.status ?? "active",
      isActive: (validatedData.status ?? "active") === "active",
      configurationLocked: false,
      entries: [],
      totalEntries: 0,
    });

    await newMiniDraw.save();

    console.log(`✅ Mini draw created successfully: ${newMiniDraw.name} (ID: ${newMiniDraw._id})`);

    return NextResponse.json({
      success: true,
      data: {
        miniDraw: {
          _id: newMiniDraw._id,
          name: newMiniDraw.name,
          description: newMiniDraw.description,
          status: newMiniDraw.status,
          configurationLocked: newMiniDraw.configurationLocked,
          prize: newMiniDraw.prize,
          totalEntries: newMiniDraw.totalEntries,
          minimumEntries: newMiniDraw.minimumEntries,
          createdAt: newMiniDraw.createdAt,
          updatedAt: newMiniDraw.updatedAt,
        },
      },
      message: "Mini draw created successfully",
    });
  } catch (error) {
    console.error("❌ Error creating mini draw:", error);

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
        error: "Failed to create mini draw",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
