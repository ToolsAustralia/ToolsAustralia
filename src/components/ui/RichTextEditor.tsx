"use client";

import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import UnderlineExtension from "@tiptap/extension-underline";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Highlighter,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
}

/**
 * RichTextEditor - A beautiful rich text editor using Tiptap
 * Supports formatting, colors, highlights, and more
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Start typing...",
  className = "",
  minHeight = "200px",
  maxHeight,
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: {
          HTMLAttributes: {
            class: "my-2 border-l-4 border-gray-300 pl-4 italic dark:border-neutral-600",
          },
        },
      }),
      TextStyle,
      Color,
      UnderlineExtension,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Highlight.configure({
        multicolor: true,
        HTMLAttributes: {
          class: "bg-yellow-200 px-1 rounded",
        },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose-base max-w-none dark:prose-invert focus:outline-none ${className}`,
        style: `min-height: ${minHeight};`,
      },
    },
  });

  // Update editor content when value prop changes
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  // Hide placeholder when there is text: from the value prop (e.g. loaded from DB) or from the editor
  const valueHasText = typeof value === "string" && value.replace(/<[^>]*>/g, "").trim() !== "";
  const editorHasText = editor.getText().trim() !== "";
  const showPlaceholder = !valueHasText && !editorHasText;

  return (
    <div className="overflow-hidden rounded-lg border-2 border-gray-200 bg-white transition-all duration-200 focus-within:border-red-600 focus-within:ring-2 focus-within:ring-red-600/20 dark:border-neutral-600 dark:bg-neutral-900">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 p-2 dark:border-neutral-700 dark:bg-neutral-800">
        {/* Text Formatting */}
        <div className="mr-1 flex items-center gap-1 border-r border-gray-300 pr-2 dark:border-neutral-600">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className={`rounded p-2 text-gray-800 transition-colors hover:bg-gray-200 dark:text-neutral-200 dark:hover:bg-neutral-700 ${
              editor.isActive("bold") ? "bg-gray-300 dark:bg-neutral-600" : ""
            }`}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className={`rounded p-2 text-gray-800 transition-colors hover:bg-gray-200 dark:text-neutral-200 dark:hover:bg-neutral-700 ${
              editor.isActive("italic") ? "bg-gray-300 dark:bg-neutral-600" : ""
            }`}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`rounded p-2 text-gray-800 transition-colors hover:bg-gray-200 dark:text-neutral-200 dark:hover:bg-neutral-700 ${
              editor.isActive("underline") ? "bg-gray-300 dark:bg-neutral-600" : ""
            }`}
            title="Underline"
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Text Alignment */}
        <div className="mr-1 flex items-center gap-1 border-r border-gray-300 pr-2 dark:border-neutral-600">
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={`rounded p-2 text-gray-800 transition-colors hover:bg-gray-200 dark:text-neutral-200 dark:hover:bg-neutral-700 ${
              editor.isActive({ textAlign: "left" }) ? "bg-gray-300 dark:bg-neutral-600" : ""
            }`}
            title="Align Left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={`rounded p-2 text-gray-800 transition-colors hover:bg-gray-200 dark:text-neutral-200 dark:hover:bg-neutral-700 ${
              editor.isActive({ textAlign: "center" }) ? "bg-gray-300 dark:bg-neutral-600" : ""
            }`}
            title="Align Center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={`rounded p-2 text-gray-800 transition-colors hover:bg-gray-200 dark:text-neutral-200 dark:hover:bg-neutral-700 ${
              editor.isActive({ textAlign: "right" }) ? "bg-gray-300 dark:bg-neutral-600" : ""
            }`}
            title="Align Right"
          >
            <AlignRight className="w-4 h-4" />
          </button>
        </div>

        {/* Lists */}
        <div className="mr-1 flex items-center gap-1 border-r border-gray-300 pr-2 dark:border-neutral-600">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`rounded p-2 text-gray-800 transition-colors hover:bg-gray-200 dark:text-neutral-200 dark:hover:bg-neutral-700 ${
              editor.isActive("bulletList") ? "bg-gray-300 dark:bg-neutral-600" : ""
            }`}
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`rounded p-2 text-gray-800 transition-colors hover:bg-gray-200 dark:text-neutral-200 dark:hover:bg-neutral-700 ${
              editor.isActive("orderedList") ? "bg-gray-300 dark:bg-neutral-600" : ""
            }`}
            title="Numbered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`rounded p-2 text-gray-800 transition-colors hover:bg-gray-200 dark:text-neutral-200 dark:hover:bg-neutral-700 ${
              editor.isActive("blockquote") ? "bg-gray-300 dark:bg-neutral-600" : ""
            }`}
            title="Quote"
          >
            <Quote className="w-4 h-4" />
          </button>
        </div>

        {/* Colors and Highlight */}
        <div className="mr-1 flex items-center gap-1 border-r border-gray-300 pr-2 dark:border-neutral-600">
          <input
            type="color"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            className="h-8 w-8 cursor-pointer rounded border border-gray-300 dark:border-neutral-600 dark:bg-neutral-800"
            title="Text Color"
          />
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={`rounded p-2 text-gray-800 transition-colors hover:bg-gray-200 dark:text-neutral-200 dark:hover:bg-neutral-700 ${
              editor.isActive("highlight") ? "bg-gray-300 dark:bg-neutral-600" : ""
            }`}
            title="Highlight"
          >
            <Highlighter className="w-4 h-4" />
          </button>
        </div>

        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().chain().focus().undo().run()}
            className="rounded p-2 text-gray-800 transition-colors hover:bg-gray-200 dark:text-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Undo"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().chain().focus().redo().run()}
            className="rounded p-2 text-gray-800 transition-colors hover:bg-gray-200 dark:text-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Redo"
          >
            <Redo className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Content - scrollable when content exceeds maxHeight */}
      <div
        className="relative overflow-y-auto bg-white dark:bg-neutral-900"
        style={{
          minHeight,
          maxHeight: maxHeight || "none",
          padding: "1rem",
        }}
      >
        <EditorContent
          editor={editor}
          className="focus:outline-none [&_.ProseMirror]:min-h-[80px] [&_.ProseMirror]:font-['Inter'] [&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-relaxed [&_.ProseMirror]:text-gray-800 [&_.ProseMirror]:outline-none [&_.ProseMirror]:dark:text-neutral-100 [&_.ProseMirror_blockquote]:my-4 [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-gray-300 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-gray-600 [&_.ProseMirror_blockquote]:dark:border-neutral-600 [&_.ProseMirror_blockquote]:dark:text-neutral-400 [&_.ProseMirror_em]:italic [&_.ProseMirror_mark]:rounded [&_.ProseMirror_mark]:bg-yellow-200 [&_.ProseMirror_mark]:px-1 [&_.ProseMirror_mark]:dark:bg-yellow-800/50 [&_.ProseMirror_ol]:my-3 [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_p:first-child]:mt-0 [&_.ProseMirror_p:last-child]:mb-0 [&_.ProseMirror_p]:my-3 [&_.ProseMirror_strong]:font-semibold [&_.ProseMirror_u]:underline [&_.ProseMirror_ul]:my-3 [&_.ProseMirror_ul]:pl-6"
        />
        {showPlaceholder && (
          <div className="pointer-events-none absolute left-4 top-4 font-['Inter'] text-gray-400 dark:text-neutral-500">
            {placeholder}
          </div>
        )}
      </div>

      {/* Line Spacing Control */}
      <div className="border-t border-gray-200 bg-gray-50 px-4 pb-2 dark:border-neutral-700 dark:bg-neutral-800">
        <label className="text-xs text-gray-600 dark:text-neutral-400 font-medium flex items-center gap-2">
          <span>Line Spacing:</span>
          <select
            onChange={(e) => {
              const spacing = e.target.value;
              editor.commands.setParagraph();
              // Apply line height via CSS
              const style = document.createElement("style");
              style.id = "editor-line-spacing";
              style.textContent = `.ProseMirror { line-height: ${spacing} !important; }`;
              const existing = document.getElementById("editor-line-spacing");
              if (existing) existing.remove();
              document.head.appendChild(style);
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200"
            defaultValue="1.6"
          >
            <option value="1.2">Tight (1.2)</option>
            <option value="1.4">Normal (1.4)</option>
            <option value="1.6">Relaxed (1.6)</option>
            <option value="1.8">Loose (1.8)</option>
            <option value="2.0">Very Loose (2.0)</option>
          </select>
        </label>
      </div>
    </div>
  );
}

