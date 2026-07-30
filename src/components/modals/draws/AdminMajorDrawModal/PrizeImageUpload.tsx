"use client";

import React from "react";
import { ImageUpload } from "../../ui";

interface PrizeImageUploadProps {
  images: (string | File)[];
  onImagesChange: (images: (string | File)[]) => void;
  error?: string;
}

const PrizeImageUpload: React.FC<PrizeImageUploadProps> = ({ images, onImagesChange, error }) => (
  <div className="space-y-2">
    <ImageUpload
      label="Prize Gallery"
      images={images}
      onImagesChange={onImagesChange}
      maxImages={25}
      maxFileSize={10}
      required
      error={error}
      uploadToCloudinary={false}
      storeLocally
    />
  </div>
);

export default PrizeImageUpload;
