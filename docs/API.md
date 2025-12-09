# API Documentation

## Overview

This document describes the API endpoints and their usage patterns.

## API Route Handler

All API routes use the standardized route handler wrapper for consistency:

### Public Routes

```typescript
import { createPublicRouteHandler } from '@/lib/api/route-handler';

export const POST = createPublicRouteHandler(async (request) => {
  // Handler logic
});
```

### Authenticated Routes

```typescript
import { createAuthenticatedRouteHandler } from '@/lib/api/route-handler';

export const POST = createAuthenticatedRouteHandler(async (request, { session }) => {
  // Handler logic with authenticated user
});
```

### Admin Routes

```typescript
import { createAdminRouteHandler } from '@/lib/api/route-handler';

export const POST = createAdminRouteHandler(async (request, { session }) => {
  // Handler logic with admin user
});
```

## Request Validation

Request validation is handled using Zod schemas:

```typescript
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  amount: z.number().positive(),
});

export const POST = createRouteHandler(async (request, { body }) => {
  const data = schema.parse(body);
  // Use validated data
}, {
  validateBody: schema,
});
```

## Error Responses

All errors follow a standardized format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {},
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Success Responses

Success responses follow a consistent format:

```json
{
  "success": true,
  "data": {}
}
```

## Services Usage

API routes should use services for business logic:

```typescript
import { paymentService } from '@/services/payment/PaymentService';

export const POST = createAuthenticatedRouteHandler(async (request, { session, body }) => {
  const result = await paymentService.createPaymentIntent({
    amount: body.amount,
    currency: 'aud',
    userId: session.user.id,
  });
  
  return NextResponse.json({ success: true, data: result });
});
```

