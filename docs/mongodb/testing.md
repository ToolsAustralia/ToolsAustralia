# MongoDB — Testing

## Connection smoke

```bash
npx tsx -e "import('./src/lib/mongodb.ts').then(async m => { await m.default(); console.log('ok'); })"
```

(or whatever the actual default-export is — _TODO: confirm._)

## Migration dry-runs

For any new migration:
```bash
npx tsx scripts/migrations/<file>.ts --dry-run
# review output
npx tsx scripts/migrations/<file>.ts
```

## What's NOT well tested

- Connection pool sizing under load
- Index coverage for new query patterns
- Aggregation performance on production-scale data
