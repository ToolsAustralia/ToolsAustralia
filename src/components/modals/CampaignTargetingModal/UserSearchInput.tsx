"use client";

import React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/modals/ui";

interface UserSearchInputProps {
  value: string;
  onChange: (next: string) => void;
}

export default function UserSearchInput({ value, onChange }: UserSearchInputProps) {
  return (
    <div className="relative">
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search name or email (updates list when previewed)"
        icon={Search}
      />
    </div>
  );
}
