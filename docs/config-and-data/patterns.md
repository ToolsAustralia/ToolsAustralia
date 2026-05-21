# Config & Data — Patterns

## P1. Re-export through `index.ts`

`src/data/index.ts` re-exports common data files for clean imports:
```ts
import { AUSTRALIAN_STATES, professions } from "@/data";
```

## P2. Fixture data prefixed with `sample`

`sampleProducts`, `sampleUsers`, etc. — naming convention to make it obvious this is fixture data, not production reference.

## P3. Package data as `Record<string, PackageDef>`

Static package files export keyed objects so lookups by id are O(1):
```ts
export const membershipPackages: Record<string, MembershipPackage> = {
  bronze: { name: "Bronze", entriesPerMonth: 5, ... },
  silver: { name: "Silver", entriesPerMonth: 15, ... },
};
```

## P4. Constants in SCREAMING_SNAKE_CASE

`Z_INDEX`, `LEGAL_DISCLAIMER` — consistent with TS convention.

## P5. Brand assets via `brandLogos.ts` map

Don't hardcode image paths in components — go through the map so renames are central.

The `name` field is the human-readable label rendered as visible text in shop / mini-draw filters / partner sections (and as image `alt`). Use **Title Case** (e.g. `"Sidchrome"`, `"Milwaukee"`, `"Kincrome"`), not all-caps — capitalised wordmark styling, if needed, is achieved at render time with `uppercase` Tailwind classes, not by baking caps into the data. Several legacy entries (`DEWALT`, `KINCROME`) still use all-caps; normalise on touch.
