/**
 * Stable import surface for the build-time generated knowledge pack.
 *
 * The generated file (src/generated/chatKnowledgePack.ts) is created by:
 *   npm run build:chat-knowledge-pack
 * which runs automatically via prebuild/predev, and is committed to the repo
 * (mirroring src/generated/upsellImageManifest.ts). It is therefore expected to
 * exist whenever this module is imported.
 *
 * We import it statically (the house convention for generated files), and add a
 * runtime guard so a missing/empty generation produces a clear, actionable error
 * instead of a cryptic undefined downstream.
 */

import { CHAT_KNOWLEDGE_PACK, CHAT_KNOWLEDGE_SOURCES } from "@/generated/chatKnowledgePack";

export interface KnowledgePack {
  text: string;
  sources: { id: string; title: string }[];
}

/**
 * Returns the curated knowledge pack text and section catalog.
 * Generated at build time from canonical source files — never hand-edited.
 *
 * @throws if the generated pack is missing/empty (run `npm run build:chat-knowledge-pack`).
 */
export function getKnowledgePack(): KnowledgePack {
  if (!CHAT_KNOWLEDGE_PACK || CHAT_KNOWLEDGE_SOURCES?.length === 0) {
    throw new Error(
      "[support-chat/knowledge] chatKnowledgePack is missing or empty. " +
        "Run `npm run build:chat-knowledge-pack` to (re)generate it, " +
        "or run `npm run dev` / `npm run build` which call it automatically via prebuild/predev."
    );
  }

  return {
    text: CHAT_KNOWLEDGE_PACK,
    sources: CHAT_KNOWLEDGE_SOURCES,
  };
}
