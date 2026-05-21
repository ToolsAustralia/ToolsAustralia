# Upsell image system

## Overview

Hero images for upsell modals are stored under `public/images/upsells/` in four groups. Each static upsell package in [`src/data/upsellPackages.ts`](../src/data/upsellPackages.ts) declares an `image: { group, slug }` field that maps to files on disk.

Resolution is implemented by [`resolveUpsellImage`](../src/utils/upsell/upsell-image-selector.ts) in [`src/utils/upsell/upsell-image-selector.ts`](../src/utils/upsell/upsell-image-selector.ts). The UI uses it from [`UpsellModal`](../src/components/modals/UpsellModal.tsx).

## Folder layout

```
public/images/upsells/
  membership-pack/           # subscription-plus (Tradie / Foreman / Boss package art)
  one-time-pack/             # one-time-plus (+ additional-apprentice alias uses apprentice-plus here)
  additional-one-time-pack/  # additional-upgrade (tradie/boss/foreman/power/vip upgrade art; includes 12x/15x/20x)
  mini-pack/                 # mini-pack-1 … mini-pack-8 (no promo variants)
```

File naming:

- Base: `{slug}.webp` (e.g. `tradie-package.webp`, `boss-plus.webp`)
- Promo variant (when it exists): `{n}x-{slug}.webp` with lowercase `n` (e.g. `10x-tradie-package.webp`, `15x-vip-upgrade.webp`)

## Resolution rule

**Strict, base-only fallback**

1. If `promoMultiplier` is a known promo value (`src/types/promo-multiplier.ts`) **and** `{group}/{n}x-{slug}.webp` exists in the manifest, use that URL.
2. Otherwise use `{group}/{slug}.webp`.

There is no “nearest lower multiplier” fallback: if a variant file is missing, users see the base image.

## Manifest (build-time)

[`src/generated/upsellImageManifest.ts`](../src/generated/upsellImageManifest.ts) is generated from the filesystem and lists every `.webp` path under `public/images/upsells/` (relative to that folder). Regenerate after adding or renaming assets:

```bash
npm run build:upsell-manifest
```

This runs automatically via `prebuild` and `predev` in `package.json`.

## Adding a new upsell image

1. Add WebP files under the correct group folder (`membership-pack`, `one-time-pack`, `additional-one-time-pack`, or `mini-pack`).
2. Ensure a **base** `{slug}.webp` exists for that offer (required so the modal never 404s when a promo variant is absent).
3. Add optional `2x-` … `20x-` prefixed files matching [`PROMO_MULTIPLIERS`](../src/types/promo-multiplier.ts) where you want promo-specific art.
4. Add `image: { group, slug }` on the corresponding `StaticUpsellPackage` in [`upsellPackages.ts`](../src/data/upsellPackages.ts).
5. Run `npm run build:upsell-manifest` and commit the updated manifest.
6. Run `npm run test:upsell-images` to verify every package resolves to a path that exists on disk.

## PNG conversion

Large PNG sources can be converted with [`scripts/convert-upsells-to-webp.ts`](../scripts/convert-upsells-to-webp.ts) (uses `sharp`, quality 82). Prefer committing WebP only in `public/images/upsells/`.

## Tests

[`src/utils/upsell/__tests__/upsell-image-selector.test.ts`](../src/utils/upsell/__tests__/upsell-image-selector.test.ts) asserts:

- Every package’s base `{group}/{slug}.webp` is present in the manifest.
- For every package and every catalogued promo multiplier, `resolveUpsellImage` returns a path that exists.

```bash
npm run test:upsell-images
```

## Related files

| File | Role |
|------|------|
| [`src/data/upsellPackages.ts`](../src/data/upsellPackages.ts) | `image` metadata per offer |
| [`src/utils/upsell/upsell-image-selector.ts`](../src/utils/upsell/upsell-image-selector.ts) | `resolveUpsellImage` |
| [`src/generated/upsellImageManifest.ts`](../src/generated/upsellImageManifest.ts) | Generated asset index |
| [`scripts/build-upsell-image-manifest.ts`](../scripts/build-upsell-image-manifest.ts) | Manifest generator |
| [`src/components/modals/UpsellModal.tsx`](../src/components/modals/UpsellModal.tsx) | Chooses promo multiplier, calls resolver |
