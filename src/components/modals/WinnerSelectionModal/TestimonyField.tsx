"use client";

import React from "react";
import { MessageSquare } from "lucide-react";
import RichTextEditor from "@/components/ui/RichTextEditor";

interface TestimonyFieldProps {
  value: string;
  onChange: (html: string) => void;
}

const TestimonyField: React.FC<TestimonyFieldProps> = ({ value, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
        Winner Testimony (Optional)
      </div>
    </label>
    <RichTextEditor
      value={value}
      onChange={onChange}
      placeholder="Enter the winner's testimony here. You can format text, highlight important parts, and adjust line spacing."
      minHeight="250px"
    />
    <p className="mt-2 text-xs text-gray-500 dark:text-neutral-400">
      The winner&apos;s testimony will be displayed on the winners page. Use the toolbar to format text, add highlights, and adjust line spacing. You can add or update this later.
    </p>
  </div>
);

export default TestimonyField;
