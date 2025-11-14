import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get("image");
    // const logoUrl = searchParams.get("logo"); // TODO: Implement logo watermarking

    if (!imageUrl) {
      return NextResponse.json({ error: "Image URL is required" }, { status: 400 });
    }

    // For now, return the original image URL
    // In a production environment, you would:
    // 1. Download the image from imageUrl
    // 2. Download the logo from _logoUrl
    // 3. Use a library like Sharp or Canvas to composite them
    // 4. Return the watermarked image

    // Temporary implementation - just return the original image
    // This allows the metadata to work without breaking
    const response = await fetch(imageUrl);

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch image" }, { status: 404 });
    }

    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error processing watermark:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* 
TODO: Implement proper watermarking with Sharp
Example implementation:

import sharp from 'sharp';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get("image");
    // const logoUrl = searchParams.get("logo"); // TODO: Implement logo watermarking

    if (!imageUrl) {
      return NextResponse.json({ error: "Image URL is required" }, { status: 400 });
    }

    // Download the main image
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // Download the logo
    const logoResponse = await fetch(_logoUrl || "/images/Tools Australia Logo/White-Text Logo.png");
    const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());

    // Create watermarked image
    const watermarkedImage = await sharp(imageBuffer)
      .resize(1200, 630, { fit: 'cover', position: 'center' })
      .composite([
        {
          input: await sharp(logoBuffer)
            .resize(200, 60, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer(),
          gravity: 'southeast',
          blend: 'over',
        }
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    return new NextResponse(watermarkedImage, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error processing watermark:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
*/
