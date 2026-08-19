import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    console.log("☁️ [Cloudinary Upload] Request received");

    // Verify staff authentication with upload permission
    const guard = await requirePermissionWithAudit("promos.edit", request);
    if (guard instanceof NextResponse) {
      console.error("❌ [Cloudinary Upload] Unauthorized");
      return guard;
    }
    const { session, log } = guard;

    console.log("☁️ [Cloudinary Upload] Staff authenticated:", session.user.email);
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const folder = formData.get("folder") as string || "major-draws";
    // Print-ready artwork must reach the printer at the resolution the admin
    // uploaded. The default path below limits to 1200px and applies q_auto /
    // f_auto, which is right for a product photo and ruinous for a print file:
    // a front print across ~30cm at 1200px is about 100dpi against the 150-300
    // providers need, and q_auto/f_auto is exactly what flattens a transparent
    // background. An incoming transformation is applied BEFORE storage, so the
    // original would not be recoverable.
    const preserveOriginal = formData.get("preserveOriginal") === "true";

    console.log("☁️ [Cloudinary Upload] FormData parsed:", {
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      folder: folder,
    });

    if (!file) {
      console.error("❌ [Cloudinary Upload] No file provided");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    // Validate file size (10MB max)
    // Print artwork is legitimately large: a 4500px transparent PNG is commonly
    // 15-40MB. The 10MB cap stays for ordinary imagery.
    const maxSize = (preserveOriginal ? 40 : 10) * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size must be less than ${maxSize / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Cloudinary
    console.log("☁️ [Cloudinary Upload] Starting Cloudinary upload to folder:", folder);
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        preserveOriginal
          ? { folder, resource_type: "auto" as const }
          : {
              folder: folder,
              resource_type: "auto" as const,
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
            console.error("❌ [Cloudinary Upload] Cloudinary error:", error);
            reject(error);
          } else {
            console.log("✅ [Cloudinary Upload] Upload successful:", {
              url: result?.secure_url,
              public_id: result?.public_id,
            });
            resolve(result);
          }
        }
      ).end(buffer);
    });

    const uploadResult = result as { secure_url: string; public_id: string };
    console.log("✅ [Cloudinary Upload] Returning success response");

    await log(200);
    return NextResponse.json({
      success: true,
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    });

  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Verify staff authentication with upload permission
    const guard = await requirePermissionWithAudit("promos.edit", request);
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    const { searchParams } = new URL(request.url);
    const publicId = searchParams.get("public_id");

    if (!publicId) {
      return NextResponse.json({ error: "No public_id provided" }, { status: 400 });
    }

    // Delete from Cloudinary
    const result = await cloudinary.uploader.destroy(publicId);

    await log(200);
    return NextResponse.json({
      success: true,
      result: result,
    });

  } catch (error) {
    console.error("Cloudinary delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete image" },
      { status: 500 }
    );
  }
}
