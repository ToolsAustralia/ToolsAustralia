# Promo banner static art

Left-column images when neither A/B **`leftImageUrl`** nor scheduled admin **`imageUrl`** is set.

## Path pattern

```
/images/promoBanner/{Brand}/{State}/{stem}-{multiplier}x.png
```

| Part | Values |
|------|--------|
| **Brand** | `Dewalt`, `Makita`, `Milwaukee`, `Ryobi` (PascalCase folder names) |
| **State** | `DrawnTonight`, `LastChance`, `EndsTonight` |
| **stem** | `drawn-tonight`, `last-chance`, `ends-tonight` |
| **multiplier** | `2`, `3`, `5`, or `10` (unknown/null effective multiplier maps to **10**) |

Example: `Milwaukee/DrawnTonight/drawn-tonight-10x.png`.

## Resolution order (code)

1. Branded path for the theme-derived brand  
2. Same state + tier under **Milwaukee** (if brand ≠ Milwaukee)  
3. Optional **legacy** path without a brand folder: `/images/promoBanner/{State}/...`

See `docs/PROMO_BANNER_BEHAVIOUR.md`.
