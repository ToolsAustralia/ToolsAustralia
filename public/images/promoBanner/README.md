# Promo banner static art

Left-column images when neither A/B **`leftImageUrl`** nor scheduled admin **`imageUrl`** is set.

## Path pattern

```
/images/promoBanner/{Brand}/{State}/{stem}-{multiplier}x.webp
```

| Part | Values |
|------|--------|
| **Brand** | `Dewalt`, `Makita`, `Milwaukee`, `Ryobi` (PascalCase folder names) |
| **State** | `DrawnTonight`, `DrawnTomorrow`, `SpecialPromo` |
| **stem** | `drawn-tonight`, `drawn-tomorrow`, `special-promo` |
| **multiplier** | DrawnTonight/DrawnTomorrow: `2`/`3`/`5`/`10`; SpecialPromo: `3`/`5`/`10` (unknown/null — and `2` — maps to **10**) |

Example: `Milwaukee/SpecialPromo/special-promo-10x.webp`.

`SpecialPromo` art reads "SPECIAL PROMO — {N}x ENTRIES ACTIVATED" and is the default state whenever the
draw is not today and the freeze window is more than 48h away. There is no `2x` SpecialPromo asset — keep
2× out of promos, or it will fall back to the `10x` art.

## Resolution order (code)

1. Branded path for the theme-derived brand
2. Same state + tier under **Milwaukee** (if brand ≠ Milwaukee)
3. Optional **legacy** path without a brand folder: `/images/promoBanner/{State}/...`
   (DrawnTonight/DrawnTomorrow only — SpecialPromo never had a flat layout)

See `docs/PROMO_BANNER_BEHAVIOUR.md`.
