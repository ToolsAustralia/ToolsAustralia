# Promo banner static art

Left-column images when neither A/B **`leftImageUrl`** nor scheduled admin **`imageUrl`** is set.

## Path pattern

```
/images/promoBanner/{Brand}/{State}/{stem}-{multiplier}x.webp
```

| Part | Values |
|------|--------|
| **Brand** | `Dewalt`, `Hikoki`, `Makita`, `Milwaukee`, `Ryobi`, `Stihl` (PascalCase folder names) |
| **State** | `DrawnTonight`, `DrawnTomorrow`, `SpecialPromo` |
| **stem** | `drawn-tonight`, `drawn-tomorrow`, `special-promo` |
| **multiplier** | DrawnTonight/DrawnTomorrow: `2`/`3`/`5`/`10`; SpecialPromo: `3`/`5`/`10` (unknown/null — and `2` — maps to **10**) |

Example: `Milwaukee/SpecialPromo/special-promo-10x.webp`.

**A folder here is not enough — the brand must also be listed in**
[`resolve-promo-banner-asset-brand.ts`](../../../src/utils/promo-banner/resolve-promo-banner-asset-brand.ts).
That map is the source of truth for which folder a toolset resolves to, and it deliberately does
NOT derive the folder by capitalising the slug: STIHL joined the landing slugs a branch before its
art existed, and a derived name meant every STIHL visitor took a 404 per banner before the
`onError` fallback kicked in. Add the art and the map row in the same change —
`npm run test:promo-banner-brand` asserts every resolvable brand has all nine files on disk.

STIHL art landed 2026-08-27 (draw 10). All six brands now carry the full 3x/5x/10x set across all
three states. Note `Dewalt` additionally has a `DrawnTonight/drawn-tonight-2x.webp` and a
`Holiday/` folder; neither is part of the common set every brand is required to have.

`SpecialPromo` art reads "SPECIAL PROMO — {N}x ENTRIES ACTIVATED" and is the default state whenever the
draw is not today and the freeze window is more than 48h away. There is no `2x` SpecialPromo asset — keep
2× out of promos, or it will fall back to the `10x` art.

## Resolution order (code)

1. Branded path for the theme-derived brand
2. Same state + tier under **Milwaukee** (if brand ≠ Milwaukee)
3. Optional **legacy** path without a brand folder: `/images/promoBanner/{State}/...`
   (DrawnTonight/DrawnTomorrow only — SpecialPromo never had a flat layout)

See `docs/PROMO_BANNER_BEHAVIOUR.md`.
