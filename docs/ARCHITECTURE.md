# Architecture Documentation

## Overview

This document describes the architecture of the Tools Australia application, a Next.js-based platform for managing memberships, payments, and draws.

## Architecture Principles

1. **Separation of Concerns**: Business logic is separated into services, API routes are thin controllers
2. **Type Safety**: TypeScript is used throughout with strict type checking
3. **Error Handling**: Standardized error classes and handling across the application
4. **Logging**: Centralized logging utility for consistent logging across services
5. **Configuration**: Type-safe environment variable access with validation

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
├── components/             # React components
│   ├── modals/            # Modal components
│   └── ui/                # Reusable UI components
├── config/                # Configuration files
│   └── env.ts             # Environment variable configuration
├── constants/             # Application constants
├── contexts/              # React contexts
├── hooks/                 # Custom React hooks
├── lib/                   # Library code
│   ├── api/               # API utilities
│   ├── errors/            # Error handling
│   └── mongodb.ts         # Database connection
├── models/                # Mongoose models
├── services/              # Business logic services
│   ├── payment/           # Payment services
│   ├── user/              # User services
│   ├── tracking/           # Analytics services
│   └── draws/             # Draw services
├── types/                 # TypeScript type definitions
├── utils/                 # Utility functions
│   ├── logger.ts          # Logging utility
│   └── payment/           # Payment utilities
└── __tests__/             # Test files
```

## Service Layer

The service layer encapsulates business logic and provides reusable functionality:

- **PaymentService**: PaymentIntent creation and management
- **SubscriptionService**: Subscription creation and management
- **RefundService**: Refund processing
- **PaymentMethodService**: Payment method management
- **UserService**: User CRUD operations
- **AuthService**: Authentication logic
- **ProfileService**: Profile management
- **KlaviyoService**: Klaviyo event tracking
- **PixelService**: Facebook/TikTok pixel tracking
- **AnalyticsService**: Unified analytics interface
- **MajorDrawService**: Major draw operations
- **MiniDrawService**: Mini draw operations
- **EntryService**: Draw entry management

## API Route Pattern

API routes follow a consistent pattern using the route handler wrapper:

```typescript
import { createAuthenticatedRouteHandler } from '@/lib/api/route-handler';
import { paymentService } from '@/services/payment/PaymentService';

export const POST = createAuthenticatedRouteHandler(async (request, { session }) => {
  // Business logic using services
  const result = await paymentService.createPaymentIntent({...});
  return NextResponse.json({ success: true, data: result });
});
```

## Error Handling

Errors are handled using standardized error classes:

- `AppError`: Base error class
- `ValidationError`: Input validation errors
- `AuthenticationError`: Authentication failures
- `AuthorizationError`: Authorization failures
- `NotFoundError`: Resource not found
- `PaymentError`: Payment-related errors
- `ExternalServiceError`: External API errors

## Logging

All logging uses the centralized logger utility:

```typescript
import { logger } from '@/utils/logger';

logger.info('Operation completed', { userId, result });
logger.error('Operation failed', error, { context });
```

## Configuration

Environment variables are accessed through the type-safe config:

```typescript
import { env } from '@/config/env';

const apiKey = env.stripe.secretKey;
const isProduction = env.isProduction;
```

## Constants

Application constants are centralized:

```typescript
import { PAYMENT, AUTH, RATE_LIMITS } from '@/constants';

const currency = PAYMENT.CURRENCY;
const otpLength = AUTH.OTP_LENGTH;
```

