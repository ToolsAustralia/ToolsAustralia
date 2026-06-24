"use client";

/**
 * ChatMarkdown.tsx
 *
 * Lightweight markdown renderer for Cobber assistant messages and the /faq page.
 *
 * Allowed elements: p, strong, em, ul, ol, li, a — no raw HTML passthrough.
 * Links:
 *   - Internal (href starts with /): plain <a> with brand-red underline
 *   - External (href starts with http): opens in new tab, rel="noopener noreferrer"
 * Body text inherits the parent's text color so this component is context-agnostic
 * (works inside the dark chat bubble and the light FAQ accordion alike).
 */

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import type { ReactNode } from "react";

const LINK_CLASS = "underline text-[#ee0000] hover:opacity-80 transition-opacity";

const components: Components = {
  // Paragraphs — inherit parent color, preserve spacing
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-1 last:mb-0">{children}</p>
  ),
  // Strong / emphasis
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  // Lists
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc list-inside mb-1 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal list-inside mb-1 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  // Links — internal vs external
  a: ({ href, children }: { href?: string; children?: ReactNode }) => {
    if (!href) return <>{children}</>;
    const isInternal = href.startsWith("/");
    if (isInternal) {
      return (
        <a href={href} className={LINK_CLASS}>
          {children}
        </a>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
      >
        {children}
      </a>
    );
  },
};

const ALLOWED_ELEMENTS = [
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "a",
] as const;

interface ChatMarkdownProps {
  children: string;
  /** Extra Tailwind classes applied to the wrapper div */
  className?: string;
}

export default function ChatMarkdown({ children, className }: ChatMarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        allowedElements={ALLOWED_ELEMENTS as unknown as string[]}
        unwrapDisallowed
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
