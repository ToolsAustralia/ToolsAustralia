# Email — Models

_N/A — emails are not persisted in our DB. SendGrid / Klaviyo are systems of record for delivery._

Recipient data comes from `User` (in [subscription](../subscription/models.md)). Newsletter subscriptions tracked in Klaviyo, not Mongo.
