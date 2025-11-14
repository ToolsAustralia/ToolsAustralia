import { NextRequest, NextResponse } from "next/server";
import { uploadImageToCloudinary, uploadMultipleImages } from "@/lib/cloudinary";
import { z } from "zod";

// Validation schema for upload request
const uploadSchema = z.object({
  folder: z.string().optional().default("tools-australia"),
  type: z.enum(["product", "mini-draw", "general"]).optional().default("general"),
  tags: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const folder = (formData.get("folder") as string) || "tools-australia";
    const type = (formData.get("type") as string) || "general";
    const tags = formData.get("tags") ? JSON.parse(formData.get("tags") as string) : [];

    // Validate request
    const validatedData = uploadSchema.parse({
      folder,
      type,
      tags,
    });

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // Validate file types
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const invalidFiles = files.filter((file) => !allowedTypes.includes(file.type));

    if (invalidFiles.length > 0) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, and WebP images are allowed." },
        { status: 400 }
      );
    }

    // Validate file sizes (max 10MB per file)
    const maxSize = 10 * 1024 * 1024; // 10MB
    const oversizedFiles = files.filter((file) => file.size > maxSize);

    if (oversizedFiles.length > 0) {
      return NextResponse.json({ error: "File size too large. Maximum size is 10MB per file." }, { status: 400 });
    }

    // Create folder path based on type
    const folderPath = `${validatedData.folder}/${validatedData.type}`;

    // Upload images
    const uploadOptions = {
      public_id_prefix: `${validatedData.type}_${Date.now()}`,
      tags: [...(validatedData.tags || []), validatedData.type],
    };

    const uploadResults = await uploadMultipleImages(files, folderPath, uploadOptions);

    return NextResponse.json({
      success: true,
      message: "Images uploaded successfully",
      images: uploadResults.map((result) => ({
        public_id: result.public_id,
        url: result.secure_url,
        width: result.width,
        height: result.height,
      })),
    });
  } catch (error) {
    console.error("Upload error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to upload images" }, { status: 500 });
  }
}

// Handle single file upload
export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const folder = (formData.get("folder") as string) || "tools-australia";
    const type = (formData.get("type") as string) || "general";
    const tags = formData.get("tags") ? JSON.parse(formData.get("tags") as string) : [];

    // Validate request
    const validatedData = uploadSchema.parse({
      folder,
      type,
      tags,
    });

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, and WebP images are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File size too large. Maximum size is 10MB." }, { status: 400 });
    }

    // Create folder path based on type
    const folderPath = `${validatedData.folder}/${validatedData.type}`;

    // Upload image
    const uploadOptions = {
      public_id: `${validatedData.type}_${Date.now()}`,
      tags: [...(validatedData.tags || []), validatedData.type],
    };

    const uploadResult = await uploadImageToCloudinary(file, folderPath, uploadOptions);

    return NextResponse.json({
      success: true,
      message: "Image uploaded successfully",
      image: {
        public_id: uploadResult.public_id,
        url: uploadResult.secure_url,
        width: uploadResult.width,
        height: uploadResult.height,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}
