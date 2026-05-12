# Stripe Webhook Async Queue

> **Status:** In progress — full documentation lands in Task 16 of the implementation plan. See [docs/superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md](../superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md) for design.

## Overview

Stripe webhook events are received by a thin receiver that returns 200 in <1s, then processed asynchronously by a worker route with a 300s budget. A Mongo-backed queue (`stripewebhookqueue` collection) buffers events between receiver and worker. A cron sweeper retries failed events with exponential backoff and recovers orphaned in-flight rows.
