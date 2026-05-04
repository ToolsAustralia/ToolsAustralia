# Infrastructure — Testing

## Health check

```bash
curl http://localhost:3000/api/health
```

Should return 200 with simple JSON status.

## Cron simulation

```bash
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/major-draw-transition
```

## Migration dry-run

```bash
npm run migrate:<name>:dry
```

## What's NOT well tested

- Cron endpoint auth thoroughness
- Cloudinary signing edge cases
- Env validation across all consumers
- DST handling in date helpers
