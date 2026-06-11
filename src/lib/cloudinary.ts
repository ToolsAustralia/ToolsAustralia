import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary lazily
function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Helper function to upload a single image
export async function uploadImageToCloudinary(
  file: Buffer | File,
  folder: string,
  options: {
    public_id?: string;
    public_id_prefix?: string;
    tags?: string[];
  } = {}
): Promise<{
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
}> {
  try {
    // Configure Cloudinary before uploading
    configureCloudinary();
    const uploadOptions = {
      folder,
      resource_type: "image" as const,
      ...options,
    };

    let uploadResult;

    if (typeof File !== "undefined" && file instanceof File) {
      // Convert File to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(uploadOptions, (error, result) => {
            if (error) return reject(error);
            resolve(result);
          })
          .end(buffer);
      });
    } else {
      // File is already a Buffer
      uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(uploadOptions, (error, result) => {
            if (error) return reject(error);
            resolve(result);
          })
          .end(file);
      });
    }

    return {
      public_id: (uploadResult as { public_id: string }).public_id,
      secure_url: (uploadResult as { secure_url: string }).secure_url,
      width: (uploadResult as { width: number }).width,
      height: (uploadResult as { height: number }).height,
    };
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw new Error(`Failed to upload image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Helper function to upload multiple images
export async function uploadMultipleImages(
  files: File[],
  folder: string,
  options: {
    public_id_prefix?: string;
    tags?: string[];
  } = {}
): Promise<
  Array<{
    public_id: string;
    secure_url: string;
    width: number;
    height: number;
  }>
> {
  // Configure Cloudinary before uploading
  configureCloudinary();

  const uploadPromises = files.map(async (file, index) => {
    const fileOptions = {
      ...options,
      public_id: options.public_id_prefix ? `${options.public_id_prefix}_${index}` : undefined,
    };

    return uploadImageToCloudinary(file, folder, fileOptions);
  });

  return Promise.all(uploadPromises);
}

/**
 * Derives a Cloudinary `public_id` from a stored secure URL. We only persist
 * URLs (not public_ids), so deletion has to reverse-engineer the id.
 * Handles optional transformation segments + the `v<version>/` prefix, e.g.
 * `https://res.cloudinary.com/<cloud>/image/upload/v1700000000/major-draws/abc.webp`
 * → `major-draws/abc`. Returns null for non-Cloudinary / unparseable URLs.
 */
export function cloudinaryPublicIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("res.cloudinary.com")) return null;
    const marker = "/upload/";
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    const segs = u.pathname
      .slice(idx + marker.length)
      .split("/")
      .filter(Boolean);
    // Everything after the `v<digits>` version segment is the public_id path
    // (folder + name). If there's no version segment, fall back to the whole tail.
    const vIdx = segs.findIndex((s) => /^v\d+$/.test(s));
    const idSegs = vIdx >= 0 ? segs.slice(vIdx + 1) : segs;
    if (idSegs.length === 0) return null;
    return idSegs.join("/").replace(/\.[a-z0-9]+$/i, "") || null;
  } catch {
    return null;
  }
}

/**
 * Permanently deletes a Cloudinary image given its stored URL. Best-effort:
 * returns true on success (or "not found"), false on any failure — never throws.
 */
export async function deleteCloudinaryImageByUrl(url: string): Promise<boolean> {
  const publicId = cloudinaryPublicIdFromUrl(url);
  if (!publicId) return false;
  try {
    configureCloudinary();
    const result = (await cloudinary.uploader.destroy(publicId)) as { result?: string };
    return result?.result === "ok" || result?.result === "not found";
  } catch (error) {
    console.error(`Cloudinary delete failed for ${publicId}:`, error);
    return false;
  }
}

export default cloudinary;
