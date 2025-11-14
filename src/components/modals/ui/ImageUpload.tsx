"use client";

import React, { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { X, Upload, AlertCircle, Loader2, Cloud, CheckCircle } from "lucide-react";

interface ImageUploadProps {
  images: (File | string)[];
  onImagesChange: (images: (File | string)[]) => void;
  maxImages?: number;
  maxFileSize?: number; // in MB
  label?: string;
  required?: boolean;
  error?: string;
  className?: string;
  accept?: string;
  disabled?: boolean;
  uploadToCloudinary?: boolean; // New prop to enable Cloudinary upload
  storeLocally?: boolean; // New prop to store files locally until submit
}

interface UploadProgress {
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  url?: string;
  error?: string;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  images,
  onImagesChange,
  maxImages = 4,
  maxFileSize = 10,
  label,
  required = false,
  error,
  className = "",
  accept = "image/*",
  disabled = false,
  uploadToCloudinary = true,
  storeLocally = false,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload to Cloudinary via secure API endpoint
  const uploadToCloudinaryAPI = async (file: File, folder: string = "major-draws"): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const response = await fetch("/api/upload/cloudinary", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.url;
  };

  // Handle Cloudinary upload with progress
  const handleCloudinaryUpload = useCallback(
    async (files: File[]) => {
      setIsUploading(true);
      const newUploadProgress: UploadProgress[] = files.map((file) => ({
        file,
        progress: 0,
        status: "uploading",
      }));

      setUploadProgress(newUploadProgress);

      try {
        const uploadPromises = files.map(async (file, index) => {
          try {
            const url = await uploadToCloudinaryAPI(file);

            // Update progress
            setUploadProgress((prev) =>
              prev.map((item, i) => (i === index ? { ...item, progress: 100, status: "success", url } : item))
            );

            return url;
          } catch (error) {
            // Update progress with error
            setUploadProgress((prev) =>
              prev.map((item, i) =>
                i === index
                  ? {
                      ...item,
                      progress: 0,
                      status: "error",
                      error: error instanceof Error ? error.message : "Upload failed",
                    }
                  : item
              )
            );
            return null;
          }
        });

        const results = await Promise.all(uploadPromises);
        const successfulUploads = results.filter((url): url is string => url !== null);

        if (successfulUploads.length > 0) {
          const updatedImages = [...images, ...successfulUploads];
          onImagesChange(updatedImages);
        }
      } finally {
        setIsUploading(false);
        // Clear upload progress after a delay
        setTimeout(() => setUploadProgress([]), 3000);
      }
    },
    [images, onImagesChange]
  );

  // Update previews when images change
  React.useEffect(() => {
    const newPreviews: string[] = [];
    let loadedCount = 0;

    if (images.length === 0) {
      setImagePreviews([]);
      return;
    }

    images.forEach((image, index) => {
      if (typeof image === "string") {
        // It's already a URL
        newPreviews[index] = image;
        loadedCount++;
        if (loadedCount === images.length) {
          setImagePreviews(newPreviews);
        }
      } else {
        // It's a File object
        const reader = new FileReader();
        reader.onload = (e) => {
          newPreviews[index] = e.target?.result as string;
          loadedCount++;

          if (loadedCount === images.length) {
            setImagePreviews(newPreviews);
          }
        };
        reader.readAsDataURL(image);
      }
    });
  }, [images]);

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  // Handle file selection
  const handleFiles = useCallback(
    async (newFiles: File[], replaceIndex?: number) => {
      if (disabled) return;

      const validImages = newFiles.filter((file) => {
        const isValidType = file.type.startsWith("image/");
        const isValidSize = file.size <= maxFileSize * 1024 * 1024;
        return isValidType && isValidSize;
      });

      if (validImages.length === 0) {
        return;
      }

      // If replacing a specific image
      if (replaceIndex !== undefined && replaceIndex >= 0) {
        const fileToReplace = validImages[0];

        if (uploadToCloudinary && !storeLocally) {
          try {
            const url = await uploadToCloudinaryAPI(fileToReplace);
            const updatedImages = [...images];
            updatedImages[replaceIndex] = url;
            onImagesChange(updatedImages);
          } catch (error) {
            console.error("Failed to upload replacement image:", error);
          }
        } else {
          // Store locally
          const updatedImages = [...images];
          updatedImages[replaceIndex] = fileToReplace;
          onImagesChange(updatedImages);
        }
        return;
      }

      // Original logic for adding new images
      const currentImageCount = images.length;
      const availableSlots = maxImages - currentImageCount;

      if (availableSlots <= 0) {
        return;
      }

      const filesToAdd = validImages.slice(0, availableSlots);

      if (uploadToCloudinary && !storeLocally) {
        // Upload to Cloudinary immediately
        await handleCloudinaryUpload(filesToAdd);
      } else {
        // Keep as File objects (store locally)
        const updatedImages = [...images, ...filesToAdd];
        onImagesChange(updatedImages);
      }
    },
    [images, maxImages, maxFileSize, onImagesChange, disabled, uploadToCloudinary, storeLocally, handleCloudinaryUpload]
  );

  // Handle drop event
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files) {
        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  // Remove specific image
  const removeImage = (index: number) => {
    if (disabled) return;

    const updatedImages = images.filter((_, i) => i !== index);
    onImagesChange(updatedImages);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Replace image at specific index
  const replaceImage = async (index: number, newFile: File) => {
    if (disabled) return;

    const validFile = newFile.type.startsWith("image/") && newFile.size <= maxFileSize * 1024 * 1024;
    if (!validFile) return;

    if (uploadToCloudinary) {
      try {
        const url = await uploadToCloudinaryAPI(newFile);
        const updatedImages = [...images];
        updatedImages[index] = url;
        onImagesChange(updatedImages);
      } catch (error) {
        console.error("Failed to upload replacement image:", error);
      }
    } else {
      const updatedImages = [...images];
      updatedImages[index] = newFile;
      onImagesChange(updatedImages);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Label */}
      {label && (
        <h3 className="text-lg font-semibold text-gray-900">
          {label} {required && <span className="text-red-500">*</span>}
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({images.length}/{maxImages})
          </span>
          {uploadToCloudinary && (
            <span className="text-xs text-blue-600 ml-2 flex items-center gap-1">
              <Cloud className="w-3 h-3" />
              Cloudinary
            </span>
          )}
        </h3>
      )}

      {/* Upload Area - Show if less than max images */}
      {images.length < maxImages && !disabled && (
        <div
          className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-all ${
            dragActive
              ? "border-red-500 bg-red-50"
              : error
              ? "border-red-500 bg-red-50"
              : "border-gray-300 hover:border-red-400 hover:bg-gray-50"
          } ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple={maxImages > 1}
            onChange={handleFileInputChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isUploading}
          />
          {isUploading ? (
            <Loader2 className="mx-auto h-10 w-10 text-red-500 mb-3 animate-spin" />
          ) : (
            <Upload className="mx-auto h-10 w-10 text-gray-400 mb-3" />
          )}
          <p className="text-base font-medium text-gray-900 mb-2">
            {isUploading ? (
              "Uploading..."
            ) : (
              <>
                Drop your {maxImages > 1 ? "images" : "image"} here, or <span className="text-red-600">browse</span>
              </>
            )}
          </p>
          <p className="text-sm text-gray-500">
            PNG, JPG, GIF up to {maxFileSize}MB each
            {maxImages > 1 && (
              <>
                {" "}
                • Maximum {maxImages} images • {maxImages - images.length} slots remaining
              </>
            )}
          </p>
        </div>
      )}

      {/* Upload Progress */}
      {uploadProgress.length > 0 && (
        <div className="space-y-2">
          {uploadProgress.map((progress, index) => (
            <div key={index} className="bg-gray-50 p-3 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 truncate">{progress.file.name}</span>
                <div className="flex items-center gap-2">
                  {progress.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                  {progress.status === "success" && <CheckCircle className="w-4 h-4 text-green-500" />}
                  {progress.status === "error" && <AlertCircle className="w-4 h-4 text-red-500" />}
                </div>
              </div>
              {progress.status === "uploading" && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
              )}
              {progress.status === "error" && <p className="text-red-500 text-sm">{progress.error}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Image Previews Grid */}
      {imagePreviews.length > 0 && (
        <div
          className={`grid gap-4 ${
            maxImages === 1
              ? "grid-cols-1 max-w-md mx-auto"
              : maxImages <= 2
              ? "grid-cols-1 md:grid-cols-2"
              : "grid-cols-2 md:grid-cols-4"
          }`}
        >
          {imagePreviews.map((preview, index) => (
            <div key={index} className="relative group">
              <Image
                src={preview}
                alt={`Preview ${index + 1}`}
                width={500}
                height={400}
                className="w-full h-80 object-contain rounded-lg border border-gray-300 bg-gray-50"
              />

              {/* Overlay for drag and drop replacement */}
              {!disabled && (
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                  <div className="text-center text-white">
                    <Upload className="w-6 h-6 mx-auto mb-1" />
                    <p className="text-xs">Drop to replace</p>
                  </div>
                </div>
              )}

              {/* Remove button */}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full hover:bg-red-700 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              {/* Image number */}
              {maxImages > 1 && (
                <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                  {index + 1}
                </div>
              )}

              {/* Hidden file input for replacement */}
              {!disabled && (
                <input
                  type="file"
                  accept={accept}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      replaceImage(index, e.target.files[0]);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <p className="text-red-500 text-sm flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}
    </div>
  );
};

export default ImageUpload;
