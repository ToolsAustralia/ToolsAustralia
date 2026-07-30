"use client";

import React from "react";
import { Image as ImageIcon } from "lucide-react";
import ImageUpload from "../../ui/ImageUpload";

interface WinnerImageFieldProps {
  images: (File | string)[];
  onImagesChange: (images: (File | string)[]) => void;
}

const WinnerImageField: React.FC<WinnerImageFieldProps> = ({ images, onImagesChange }) => (
  <div className="space-y-2">
    <ImageUpload
      label="Winner Photo"
      images={images}
      onImagesChange={(next) => onImagesChange(next.slice(0, 1))}
      maxImages={1}
      accept="image/*"
      uploadToCloudinary={false}
      storeLocally
      className="border border-dashed border-gray-200 dark:border-neutral-600 rounded-lg"
    />
    <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
      <ImageIcon className="w-4 h-4 text-gray-400 dark:text-neutral-500" />
      Upload or drop an image of the winner. We&apos;ll store it once you submit.
    </p>
  </div>
);

export default WinnerImageField;
