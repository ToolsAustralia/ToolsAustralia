# MongoDB — Models conventions

This domain doesn't own a specific model — it owns the conventions that all model files in [src/models/](../../src/models/) follow.

## Conventions

- One model per file
- File name = model name (`User.ts`, `MajorDraw.ts`)
- Default export: the Mongoose model
- Named export: the TypeScript interface (`IUser`, `IMajorDraw`)
- Indexes declared at the bottom of the file via `Schema.index()`
- **An index that exists to serve an `$exists` filter must be `partialFilterExpression`, not plain** —
  a non-sparse index stores a missing field as `null`, so `$exists: true` spans its whole key range
  and narrows nothing. Renaming/re-optioning an index is a two-step change (new name in the schema +
  a `scripts/migrations/` drop of the old name); see [gotchas.md](gotchas.md#do-not-hint-a-non-partial-index-for-an-exists-filter-2026-07-29-panel-f-020f-021).
- Force `collection: "name"` only when Mongoose's auto-pluralization is wrong
- Use `timestamps: true` for createdAt/updatedAt (most models)
- Avoid `mongoose.models[name] || mongoose.model(...)` pattern — let the singleton handle re-registration; or do the explicit `delete + register` like `ChargeJobLock` if you want idempotent dev behaviour.

## Typical structure

```ts
import mongoose, { Document, Schema } from "mongoose";

export interface IFoo extends Document {
  // fields
}

const FooSchema = new Schema<IFoo>(
  { /* fields */ },
  { timestamps: true }
);

FooSchema.index({ /* compound */ });

export default mongoose.models.Foo || mongoose.model<IFoo>("Foo", FooSchema);
```
