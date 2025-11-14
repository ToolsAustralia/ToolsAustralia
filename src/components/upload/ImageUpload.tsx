"use client";

import React, { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { Upload, X, Image as ImageIcon, Loader2, AlertCircle } from "lucide-react";

interface ImageUploadProps {
  onUpload: (urls: string[]) => void;
  onError?: (error: string) => void;
  maxFiles?: number;
  maxSize?: number; // in MB
  acceptedTypes?: string[];
  className?: string;
  disabled?: boolean;
  label?: string;
  required?: boolean;
  error?: string;
  accept?: string;
}

interface UploadedImage {
  file: File;
  preview: string;
  uploading: boolean;
  url?: string;
  error?: string;
}

export default function ImageUpload({
  onUpload,
  onError,
  maxFiles = 5,
  maxSize = 10,
  acceptedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  className = "",
  disabled = false,
  label,
  required = false,
  error,
  accept = "image/*",
}: ImageUploadProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!acceptedTypes.includes(file.type)) {
        return `File type not supported. Please use: ${acceptedTypes.join(", ")}`;
      }

      if (file.size > maxSize * 1024 * 1024) {
        return `File size too large. Maximum size is ${maxSize}MB`;
      }

      return null;
    },
    [acceptedTypes, maxSize]
  );

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("files", file);
    formData.append("type", "general");

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Upload failed");
    }

    const data = await response.json();
    return data.images[0].url;
  };

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);

      // Validate files
      for (const file of fileArray) {
        const error = validateFile(file);
        if (error) {
          onError?.(error);
          return;
        }
      }

      // Check if adding these files would exceed maxFiles
      if (images.length + fileArray.length > maxFiles) {
        onError?.(`Maximum ${maxFiles} files allowed`);
        return;
      }

      // Create preview objects
      const newImages: UploadedImage[] = fileArray.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        uploading: true,
      }));

      setImages((prev) => [...prev, ...newImages]);

      // Upload images
      try {
        const uploadPromises = newImages.map(async (image, index) => {
          try {
            const url = await uploadImage(image.file);
            return { index, url, error: null };
          } catch (error) {
            return {
              index,
              url: null,
              error: error instanceof Error ? error.message : "Upload failed",
            };
          }
        });

        const results = await Promise.all(uploadPromises);

        // Update images with results
        setImages((prev) =>
          prev.map((img, index) => {
            const result = results.find((r) => r.index === index - (prev.length - newImages.length));
            if (result) {
              return {
                ...img,
                uploading: false,
                url: result.url || undefined,
                error: result.error || undefined,
              };
            }
            return img;
          })
        );

        // Get successful uploads
        const successfulUploads = results.filter((r) => r.url).map((r) => r.url!);

        if (successfulUploads.length > 0) {
          onUpload(successfulUploads);
        }
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Upload failed");
      }
    },
    [images.length, maxFiles, onError, onUpload, validateFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const newImages = prev.filter((_, i) => i !== index);
      // Revoke object URL to prevent memory leaks
      URL.revokeObjectURL(prev[index].preview);
      return newImages;
    });
  };

  const openFileDialog = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Label */}
      {label && (
        <h3 className="text-lg font-semibold text-gray-900">
          {label} {required && <span className="text-red-500">*</span>}
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({images.length}/{maxFiles})
          </span>
        </h3>
      )}

      {/* Upload Area - Show if less than max images */}
      {images.length < maxFiles && (
        <div
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
            transition-colors duration-200
            ${
              isDragging
                ? "border-red-500 bg-red-50"
                : error
                ? "border-red-500 bg-red-50"
                : "border-gray-300 hover:border-red-400 hover:bg-gray-50"
            }
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={openFileDialog}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple={maxFiles > 1}
            accept={accept}
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={disabled}
          />

          <Upload className="mx-auto h-10 w-10 text-gray-400 mb-3" />
          <p className="text-base font-medium text-gray-900 mb-2">
            Drop your {maxFiles > 1 ? "images" : "image"} here, or <span className="text-red-600">browse</span>
          </p>
          <p className="text-sm text-gray-500">
            PNG, JPG, GIF up to {maxSize}MB each
            {maxFiles > 1 && (
              <>
                {" "}
                • Maximum {maxFiles} images • {maxFiles - images.length} slots remaining
              </>
            )}
          </p>
        </div>
      )}

      {/* Image Previews Grid */}
      {images.length > 0 && (
        <div
          className={`grid gap-4 ${
            maxFiles === 1 ? "grid-cols-1" : maxFiles <= 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2 md:grid-cols-4"
          }`}
        >
          {images.map((image, index) => (
            <div key={index} className="relative group">
              <Image
                src={image.preview}
                alt={`Preview ${index + 1}`}
                width={128}
                height={128}
                className="w-full h-32 object-cover rounded-lg border border-gray-300"
              />

              {/* Upload Status Overlay */}
              {image.uploading && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              )}

              {image.error && (
                <div className="absolute inset-0 bg-red-500 bg-opacity-75 flex items-center justify-center rounded-lg">
                  <div className="text-white text-xs text-center p-2">
                    <X className="w-4 h-4 mx-auto mb-1" />
                    <p>Upload failed</p>
                  </div>
                </div>
              )}

              {image.url && (
                <div className="absolute inset-0 bg-green-500 bg-opacity-75 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                  <div className="text-white text-xs text-center">
                    <ImageIcon className="w-4 h-4 mx-auto mb-1" />
                    <p>Uploaded</p>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => removeImage(index)}
                disabled={image.uploading}
                className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full hover:bg-red-700 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-3 h-3" />
              </button>
              {maxFiles > 1 && (
                <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                  {index + 1}
                </div>
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
}
