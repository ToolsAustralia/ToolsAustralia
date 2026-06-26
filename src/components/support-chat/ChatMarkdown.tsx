"use client";

/**
 * ChatMarkdown.tsx
 *
 * Lightweight markdown renderer for Cobber assistant messages and the /faq page.
 *
 * Allowed elements: p, strong, em, ul, ol, li, a — no raw HTML passthrough.
 * Links:
 *   - Internal (href starts with /): client-side navigation via useRouter so the
 *     widget remount (and thus message-history loss) from a full-page reload is avoided.
 *   - External (href starts with http): opens in new tab, rel="noopener noreferrer"
 * Body text inherits the parent's text color so this component is context-agnostic
 * (works inside the dark chat bubble and the light FAQ accordion alike).
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import type { ReactNode } from "react";

const LINK_CLASS = "underline text-[#ee0000] hover:opacity-80 transition-opacity";

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
  const router = useRouter();

  // Build the components map inside the component so the `a` renderer has access
  // to `router`. useMemo keeps the reference stable across re-renders.
  const components: Components = useMemo(
    () => ({
      // Paragraphs — inherit parent color, preserve spacing
      p: ({ children: c }: { children?: ReactNode }) => (
        <p className="mb-1 last:mb-0">{c}</p>
      ),
      // Strong / emphasis
      strong: ({ children: c }: { children?: ReactNode }) => (
        <strong className="font-semibold">{c}</strong>
      ),
      em: ({ children: c }: { children?: ReactNode }) => (
        <em className="italic">{c}</em>
      ),
      // Lists
      ul: ({ children: c }: { children?: ReactNode }) => (
        <ul className="list-disc list-inside mb-1 space-y-0.5">{c}</ul>
      ),
      ol: ({ children: c }: { children?: ReactNode }) => (
        <ol className="list-decimal list-inside mb-1 space-y-0.5">{c}</ol>
      ),
      li: ({ children: c }: { children?: ReactNode }) => (
        <li className="leading-relaxed">{c}</li>
      ),
      // Links — internal vs external
      a: ({ href, children: c }: { href?: string; children?: ReactNode }) => {
        if (!href) return <>{c}</>;
        const isInternal = href.startsWith("/");
        if (isInternal) {
          return (
            <a
              href={href}
              className={LINK_CLASS}
              onClick={(e) => {
                // Intercept plain left-clicks only; let modifier-key combos open
                // new tabs naturally. This keeps the widget mounted across navigation.
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  router.push(href);
                }
              }}
            >
              {c}
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
            {c}
          </a>
        );
      },
    }),
    [router]
  );

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
