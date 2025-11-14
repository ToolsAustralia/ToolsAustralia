# Prize Catalog Overview

The major draw and promotional experiences now fetch their prize content from a single source of truth: `src/config/prizes.ts`.

- Each entry in `PRIZE_CATALOG` represents one selectable prize pack. The slug is reused across the promotions route (`/promotions/[slug]`), the home major draw toggle, and the specs modal.
- Rich data — gallery images, highlight bullets, and long-form specifications — lives alongside the slug so that frontend teams can iterate without touching backend collections.
- If marketing needs to adjust copy or imagery, add/remove entries in `PRIZE_CATALOG` or tweak the shared constants (`MILWAUKEE_POWER_TOOLS`, `DEWALT_SIDCHROME_POWER_TOOLS`, etc.). Comments in the config highlight the expectations for icon names and spec sections.
- Whenever you add a new prize slug, the promotions route automatically statically generates a page (`generateStaticParams`) and the major draw toggle will pick it up.

> Remember: backend `MajorDraw` documents intentionally no longer expose `prize` metadata. Keep the catalog in sync instead of editing Mongo records.
