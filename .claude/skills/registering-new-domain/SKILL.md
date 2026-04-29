---
name: registering-new-domain
description: Use when creating files under a new feature folder that no existing manifest entry covers, when the doc-sync hook reports an orphan path, when you see "BLOCKED: Stale docs" with no matching docs/ folder, or when scaffolding a brand-new feature area. Triggers on phrases like "new domain", "add a new feature area", "manifest", "doc-sync hook complained".
---

# registering-new-domain

## When to use
You created (or are about to create) a file whose path doesn't match any `paths` glob in the Domain Manifest at the bottom of `CLAUDE.md`. The Stop hook (`.claude/hooks/doc-sync.mjs`) will keep blocking task completion until the path is registered.

## Steps
1. Read the Domain Manifest JSON block in `CLAUDE.md` (between the `Domain Manifest` heading and the closing fence). Do **not** maintain a domain list anywhere else — it is the single source of truth.
2. First decide: does this file actually belong to an existing domain? If yes, just add its path glob to that domain's `paths` array — done.
3. If it's truly a new feature area, add a new top-level entry under `domains`:
   ```json
   "<domain-key>": {
     "docs": "docs/<domain-key>/",
     "paths": [
       "src/services/<domain-key>/**",
       "src/app/api/<domain-key>/**",
       "src/models/<RelevantModel>.ts"
     ],
     "lastVerified": null
   }
   ```
4. Bump the `lastModified` field at the top of the manifest to today's date (`YYYY-MM-DD`).
5. Create the docs folder: `docs/<domain-key>/` with at least one `.md` file describing the domain (overview + key invariants). The hook only checks the folder exists and has updated content.
6. Verify the manifest still parses: a quick way is to let the doc-sync hook run on Stop — if it doesn't error, the JSON is valid.

## Conventions
- Domain key is lower-kebab-case, singular when possible (`subscription`, not `subscriptions`). Hyphenated when multi-word (`rewards-redeemables`, `cart-shop-products`).
- `paths` globs use minimatch syntax — `**` for any depth, `{a,b}` for alternatives. Prefer broad globs (`src/services/<domain>/**`) over enumerating files.
- Do **not** let two domains' globs overlap. If you find overlap, the more specific path globs win — but rework the boundaries instead.
- Leave `lastVerified: null` on creation; the doc-sync hook auto-bumps it when docs are updated.
- Models go in the domain that owns their lifecycle. `User.ts` lives in `subscription` because that's where its mutations live, not in `auth`.

## Verification
```bash
node --input-type=module -e "import('./.claude/hooks/lib/manifest.mjs').then(m => { const r = m.readManifest(process.cwd()); console.log('domains:', Object.keys(r.domains).length, 'version:', r.version); });"
```
That command is already pre-allowed in `.claude/settings.local.json`. It should print the new domain count. After a save under the new domain's path, the Stop hook should accept the doc you created in step 5.
