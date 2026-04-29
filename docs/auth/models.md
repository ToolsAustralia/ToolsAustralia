# Auth — Models

`User` model is owned by [subscription](../subscription/models.md) but used heavily here. Auth-relevant fields:

- `email` — unique, primary identifier
- `password?` — optional (passwordless via OAuth)
- `role: "user" | "admin"` — drives admin gates
- `firstName`, `lastName`, `mobile`, `state`, `profession`, `birthdate`
- `profileSetupCompleted` — flag for first-time setup flow

See [subscription/models.md](../subscription/models.md) for the full schema.
