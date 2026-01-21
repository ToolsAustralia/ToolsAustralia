# Error Reporting System Documentation

> **⚠️ This documentation is for the legacy error reporting system.**
> 
> **For the complete, up-to-date documentation including all new features (analytics, categorization, severity classification, guest user support, etc.), please see:**
> 
> **[ERROR_REPORTING_AND_LOGGING.md](./ERROR_REPORTING_AND_LOGGING.md)**
> 
> The new documentation includes:
> - Automatic error categorization and severity classification
> - Analytics dashboard with charts and metrics
> - Error grouping functionality
> - Guest user email support
> - Severity-based rate limiting
> - Category-aware deduplication
> - Export functionality
> - Advanced filtering
> - And much more...

---

## Overview

The Error Reporting System allows users to report problems directly from error toast notifications. The system automatically captures comprehensive error context, user information, API endpoints, and debugging logs, while preventing database flooding through rate limiting and deduplication.

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [User Flow](#user-flow)
4. [Admin Workflow](#admin-workflow)
5. [Error Context Collection](#error-context-collection)
6. [Rate Limiting & Spam Prevention](#rate-limiting--spam-prevention)
7. [Deduplication](#deduplication)
8. [API Reference](#api-reference)
9. [Component Reference](#component-reference)
10. [Integration Guide](#integration-guide)
11. [Best Practices](#best-practices)
12. [Troubleshooting](#troubleshooting)

---

## Features

### Core Features

- **Report Problem Button**: Appears on error toasts for reportable errors
- **Automatic Context Collection**: Captures error details, API endpoints, browser info, console errors, and more
- **Automatic Error Logging**: Critical errors (especially payment failures) are automatically logged to the database without requiring user interaction
- **User Notes**: Optional field for users to provide additional context
- **Admin Dashboard**: Comprehensive interface for viewing and managing error reports
- **Status Workflow**: Track reports through new → investigating → resolved/dismissed
- **Privacy Protection**: IP addresses are hashed for privacy
- **Rate Limiting**: Prevents abuse and database flooding
- **Deduplication**: Prevents duplicate reports from the same user/error
- **Auto-Cleanup**: Reports older than 90 days are automatically deleted

### Security Features

- **Input Sanitization**: User notes are sanitized to prevent XSS attacks
- **Admin-Only Access**: Error reports are only accessible to admin users
- **Privacy Protection**: IP addresses are hashed using SHA-256
- **Rate Limiting**: Per-user and per-IP rate limiting prevents spam

---

## Architecture

### Data Flow

#### User-Initiated Reports
```
User Error Occurs
  ↓
Error Context Collected Automatically
  ↓
Toast Error Displayed (with "Report Problem" button)
  ↓
User Clicks "Report Problem"
  ↓
Report Problem Modal Opens
  ↓
User Optionally Adds Notes
  ↓
Error Report Created (with auto-captured context)
  ↓
Admin Views Reports in Dashboard
  ↓
Admin Updates Status & Adds Notes
```

#### Automatic Error Logging (Hybrid Approach)
```
Critical Error Occurs (e.g., Payment Failure)
  ↓
Error Context Collected Automatically
  ↓
Error Automatically Logged to Database (no user interaction required)
  ↓
Toast Error Displayed (with "Report Problem" button for user context)
  ↓
[Optional] User Clicks "Report Problem" to Add Additional Notes
  ↓
Admin Views All Reports (Auto-logged + User-Reported)
```

**Benefits of Hybrid Approach:**
- **Complete Coverage**: All critical errors are logged, even if users don't report
- **User Context**: Users can still add additional context via "Report Problem"
- **Revenue Debugging**: Payment failures are always tracked for revenue analysis
- **No Database Flooding**: Rate limiting and deduplication still apply

### Component Structure

```
src/
├── models/
│   └── ErrorReport.ts              # MongoDB model
├── components/
│   ├── ui/
│   │   └── Toast.tsx               # Enhanced with reportable prop
│   ├── modals/
│   │   └── ReportProblemModal.tsx  # Report submission modal
│   └── admin/
│       └── ErrorReportsManagement.tsx  # Admin dashboard
├── app/
│   └── api/
│       ├── error-reports/
│       │   └── route.ts            # POST /api/error-reports
│       └── admin/
│           └── error-reports/
│               ├── route.ts        # GET /api/admin/error-reports
│               └── [id]/
│                   └── route.ts    # GET/PATCH /api/admin/error-reports/[id]
├── utils/
│   └── error-reporting/
│       ├── collect-error-context.ts  # Context collection utility
│       ├── deduplication.ts          # Deduplication logic
│       ├── auto-log-error.ts          # Client-side automatic logging
│       └── auto-log-error-server.ts   # Server-side automatic logging
├── lib/
│   └── rate-limiting/
│       └── error-reports.ts          # Rate limiting
└── types/
    └── error-reporting.ts           # TypeScript types
```

---

## User Flow

### 1. Error Occurs

When an error occurs in the application:
- Error context is automatically collected (URL, API endpoint, browser info, etc.)
- Error toast is displayed with a "Report Problem" button (for reportable errors)

### 2. User Reports Problem

1. User clicks "Report Problem" button on error toast
2. Report Problem modal opens
3. Modal displays:
   - Error message (read-only)
   - Information that will be included (transparent)
   - Optional textarea for user notes
4. User can add additional details or submit immediately
5. Report is submitted to the server

### 3. Report Processing

- Rate limiting check (5 reports/hour for authenticated, 3/hour for anonymous)
- Deduplication check (prevents duplicate reports within 1 hour)
- Error context is stored in database
- Success message is shown to user

---

## Admin Workflow

### Viewing Error Reports

1. Navigate to Admin Dashboard → Error Reports tab
2. View statistics dashboard:
   - Total reports
   - Reports by status (new, investigating, resolved, dismissed)
   - Reports in last 24 hours
3. Filter reports by:
   - Status
   - Date range
   - User
   - Search in error messages
4. View paginated list of reports

### Managing Error Reports

1. Click on a report to view details
2. View comprehensive error information:
   - Error message and stack trace
   - API endpoint and HTTP status
   - Browser information
   - User information
   - Console errors
   - User notes
3. Update status:
   - **New**: Initial state when report is created
   - **Investigating**: Admin is looking into the issue
   - **Resolved**: Issue has been fixed
   - **Dismissed**: Report is not actionable
4. Add admin notes for internal tracking
5. Save changes

---

## Error Context Collection

The system automatically collects comprehensive error context:

### Collected Information

- **Error Details**:
  - Error message
  - Error stack trace
  - Error name/type

- **Request/Response Information**:
  - API endpoint
  - HTTP method
  - HTTP status code
  - Request URL

- **User Information**:
  - User ID (if authenticated)
  - User email (if authenticated)
  - Authentication status

- **Browser/Environment Information**:
  - User agent
  - Browser name, version, OS
  - Current URL
  - Route
  - Referrer
  - Timezone

- **Console Errors**:
  - Last 5 console errors (if available)
  - Error source, line, column

- **Privacy-Protected Information**:
  - Hashed IP address (SHA-256)

### Context Collection Utility

The `collectErrorContext` function automatically gathers all available information:

```typescript
import { collectErrorContext } from "@/utils/error-reporting/collect-error-context";

const errorContext = await collectErrorContext(error, {
  url: "/api/endpoint",
  method: "POST",
  status: 500,
});
```

---

## Rate Limiting & Spam Prevention

### Rate Limits

- **Authenticated Users**: 5 reports per hour per user
- **Anonymous Users**: 3 reports per hour per IP address

### Implementation

Rate limiting is implemented using an in-memory store with time windows:

```typescript
import { checkErrorReportRateLimit } from "@/lib/rate-limiting/error-reports";

const rateCheck = checkErrorReportRateLimit(userId, request);
if (!rateCheck.allowed) {
  // Return 429 Too Many Requests
}
```

### Rate Limit Response

When rate limited, the API returns:
- HTTP 429 status code
- Error message
- `retryAfterSeconds`: Time to wait before retrying

---

## Deduplication

### How It Works

Deduplication prevents duplicate reports from the same user for the same error within a 1-hour window.

### Deduplication Hash

The hash is generated from:
- Normalized error message (variable data removed)
- Error name
- User ID (or "anonymous")
- API endpoint
- Hour timestamp (rounded to nearest hour)

### Normalization

Error messages are normalized to remove variable data:
- UUIDs → `[UUID]`
- MongoDB ObjectIds → `[ObjectId]`
- Timestamps → `[Timestamp]`
- Email addresses → `[Email]`
- URLs → `[URL]`
- Long numbers → `[Number]`

### Duplicate Detection

If a duplicate report is detected:
- Returns success response
- Indicates `isDuplicate: true`
- Returns existing report ID
- Does not create a new report

---

## API Reference

### POST /api/error-reports

Create a new error report.

**Request Body**:
```typescript
{
  errorContext: ErrorContext;
  userNotes?: string; // Optional, max 2000 characters
}
```

**Response** (Success):
```typescript
{
  success: true;
  message: "Error report submitted successfully";
  reportId: string;
}
```

**Response** (Duplicate):
```typescript
{
  success: true;
  message: "This error has already been reported recently";
  isDuplicate: true;
  reportId: string;
}
```

**Response** (Rate Limited):
```typescript
{
  success: false;
  error: "Rate limit exceeded";
  message: string;
  retryAfterSeconds: number;
  rateLimited: true;
}
```

### GET /api/admin/error-reports

Get error reports with filtering and pagination (admin only).

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `status`: Filter by status (new, investigating, resolved, dismissed)
- `userId`: Filter by user ID
- `startDate`: Filter by start date (ISO string)
- `endDate`: Filter by end date (ISO string)
- `search`: Search in error messages
- `sortBy`: Sort field (createdAt, status, errorMessage)
- `sortOrder`: Sort order (asc, desc)

**Response**:
```typescript
{
  reports: IErrorReport[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  statistics: {
    total: number;
    byStatus: Record<ErrorReportStatus, number>;
    recentCount: number;
  };
}
```

### GET /api/admin/error-reports/[id]

Get a single error report by ID (admin only).

**Response**:
```typescript
{
  report: IErrorReport;
}
```

### PATCH /api/admin/error-reports/[id]

Update an error report status and admin notes (admin only).

**Request Body**:
```typescript
{
  status?: ErrorReportStatus;
  adminNotes?: string; // Max 2000 characters
}
```

**Response**:
```typescript
{
  success: true;
  message: "Error report updated successfully";
  report: IErrorReport;
}
```

---

## Component Reference

### Toast Component

Enhanced toast component with error reporting support:

```typescript
import { useToast } from "@/components/ui/Toast";

const { showToast } = useToast();

showToast({
  type: "error",
  title: "Error",
  message: "Something went wrong",
  reportable: true, // Enable "Report Problem" button
  errorContext: errorContext, // Error context for reporting
});
```

### ReportProblemModal

Modal component for submitting error reports:

```typescript
import ReportProblemModal from "@/components/modals/ReportProblemModal";

<ReportProblemModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  errorContext={errorContext}
/>
```

### ErrorReportsManagement

Admin component for managing error reports:

```typescript
import ErrorReportsManagement from "@/components/admin/ErrorReportsManagement";

<ErrorReportsManagement />
```

---

## Automatic Error Logging

### Overview

The error reporting system includes **automatic error logging** for critical errors, especially payment-related failures. This ensures that all critical errors are tracked in the database, even if users don't click "Report Problem".

### When Errors Are Auto-Logged

**Critical Errors (Always Auto-Logged):**
- Payment failures (card declined, insufficient funds)
- Stripe API errors
- StripeElements loading failures
- PaymentIntent creation failures
- Payment confirmation errors

**High Priority (Auto-Logged):**
- Payment method setup failures
- Subscription creation failures
- Server-side payment processing errors

**User-Reported Only:**
- Validation errors
- Network timeouts (user can retry)
- Client-side input errors

### Client-Side Auto-Logging

For client-side errors (e.g., in React components):

```typescript
import { autoLogPaymentError, autoLogStripeError } from "@/utils/error-reporting/auto-log-error";

// Auto-log payment errors
try {
  // Payment processing code
} catch (error) {
  // Automatically log payment error
  await autoLogPaymentError(error, {
    paymentIntentId: paymentIntent.id,
    customerId: customer.id,
    amount: amountInCents,
    packageId: packageId,
    packageName: packageName,
    errorCode: extractStripeErrorCode(error),
    declineCode: extractStripeDeclineCode(error),
    errorMessage: error.message,
  });
  
  // Still show user-friendly toast with "Report Problem" button
  showToast({
    type: "error",
    title: "Payment Failed",
    message: "Your payment could not be processed. Please try again.",
    reportable: true,
    errorContext: await collectErrorContext(error),
  });
}

// Auto-log Stripe Elements loading failures
useEffect(() => {
  if (stripePromise) {
    stripePromise.then((stripe) => {
      if (!stripe) {
        autoLogStripeError(new Error("Stripe failed to load"), {
          component: "PaymentMethodSelector",
          stripeLoaded: false,
        });
      }
    });
  }
}, [stripePromise]);
```

### Server-Side Auto-Logging

For server-side errors (e.g., in API routes):

```typescript
import { autoLogPaymentErrorServer } from "@/utils/error-reporting/auto-log-error-server";

export async function POST(request: NextRequest) {
  try {
    // Payment processing code
  } catch (error) {
    // Auto-log payment error on server
    await autoLogPaymentErrorServer(error, request, {
      paymentIntentId: paymentIntent?.id,
      customerId: customer?.id,
      amount: amountInCents,
      packageId: packageId,
      packageName: membershipPackage?.name,
      userId: user?._id?.toString(),
      userEmail: user?.email,
      errorCode: stripeError.code,
      declineCode: stripeError.decline_code,
      errorMessage: error.message,
    });
    
    // Return error response
    return NextResponse.json(
      { error: "Payment failed" },
      { status: 400 }
    );
  }
}
```

### Payment Error Examples

#### Example 1: Card Declined

```typescript
// Automatically logged with:
{
  category: "payment",
  severity: "critical",
  paymentIntentId: "pi_1234567890",
  customerId: "cus_1234567890",
  amount: 2999, // $29.99 in cents
  packageId: "apprentice-pack",
  packageName: "Apprentice Package",
  errorCode: "card_declined",
  declineCode: "insufficient_funds",
  errorMessage: "Your card was declined due to insufficient funds"
}
```

#### Example 2: Stripe Elements Loading Failure

```typescript
// Automatically logged with:
{
  category: "stripe",
  severity: "critical",
  component: "PaymentMethodSelector",
  stripeLoaded: false,
  elementsLoaded: false,
  errorMessage: "Stripe payment form failed to load"
}
```

#### Example 3: Payment API Error

```typescript
// Automatically logged with:
{
  category: "payment",
  severity: "critical",
  apiEndpoint: "/api/stripe/create-subscription",
  httpMethod: "POST",
  httpStatus: 400,
  errorCode: "card_declined",
  declineCode: "generic_decline",
  errorMessage: "Your card was declined"
}
```

### Auto-Logged vs User-Reported Reports

**Auto-Logged Reports:**
- Created automatically without user interaction
- Marked with `autoLogged: true` flag
- Include payment context (PaymentIntent ID, amount, package info)
- Still subject to deduplication (prevents duplicate auto-logs)

**User-Reported Reports:**
- Created when user clicks "Report Problem"
- May include additional user notes
- Can be created for auto-logged errors (adds user context)

### Benefits

1. **Complete Error Tracking**: All critical errors are logged, even if users don't report
2. **Revenue Debugging**: Track payment failure reasons (insufficient funds, card declined, etc.)
3. **User Experience**: Users still see friendly error messages with option to report
4. **No Database Flooding**: Rate limiting and deduplication still apply

---

## Integration Guide

### Automatic Integration

The error reporting system is automatically integrated with:

1. **API Request Errors**: `apiRequest` in `src/lib/queries.ts` automatically collects error context for API errors
2. **Error Handling Hook**: `useErrorHandling` hook automatically shows reportable error toasts
3. **Payment Errors**: Payment failures in `MembershipModal` and Stripe API routes are automatically logged
4. **Stripe Elements**: Stripe loading failures are automatically detected and logged

### Manual Integration

To manually show a reportable error toast:

```typescript
import { useToast } from "@/components/ui/Toast";
import { collectErrorContext } from "@/utils/error-reporting/collect-error-context";

const { showToast } = useToast();

try {
  // Your code that might error
} catch (error) {
  const errorContext = await collectErrorContext(error, {
    url: "/api/endpoint",
    method: "POST",
    status: 500,
  });

  showToast({
    type: "error",
    title: "Error",
    message: error.message,
    reportable: true,
    errorContext,
  });
}
```

### Console Error Tracking

Initialize console error tracking in your app (typically in `_app.tsx` or `layout.tsx`):

```typescript
import { initializeConsoleErrorTracking } from "@/utils/error-reporting/collect-error-context";

// Initialize on app load
if (typeof window !== "undefined") {
  initializeConsoleErrorTracking();
}
```

---

## Tracked Toast Errors

This section documents all the toast errors that are currently tracked by the error reporting system. These errors display a "Report Problem" button and can be reported by users.

### 1. API Request Errors

**Location**: `src/lib/queries.ts` - `apiRequest` function

**Automatically Tracked**:
- ✅ **All API errors** (non-2xx HTTP responses)
  - Error context includes: API endpoint, HTTP method, HTTP status code, error message
  - Automatically collected and attached to `ApiError` instances
  - Passed to error handling hooks for display

- ✅ **Network errors** (fetch failures, connection issues)
  - Error message: "Network error - please check your connection"
  - Error context includes: API endpoint, HTTP method
  - Status code: `0` (indicates network error)

- ✅ **Unknown errors** from API calls
  - Error message: "An unknown error occurred"
  - Error context includes: API endpoint, HTTP method

**Example Error Messages**:
- "An error occurred" (generic API error)
- "Network error - please check your connection" (network failure)
- "Invalid JSON response from server" (parsing error)
- "Validation failed: [field errors]" (Zod validation errors)

---

### 2. Error Handling Hook Errors

**Location**: `src/hooks/useErrorHandling.ts`

#### `handleError` - Generic Errors
- ✅ **All generic errors** - Reportable
  - Title: "Error"
  - Message: Extracted from error object
  - Error context automatically collected

#### `handleApiError` - API-Specific Errors
- ✅ **Server errors (500, 502, 503, 504)** - Reportable
  - Title: "Server Error"
  - Message: Error message from API or "A server error occurred. Please try again later."
  - Error context includes full API error details

- ✅ **Other server errors (5xx)** - Reportable
  - Title: "Error"
  - Message: Error message from API or "An unexpected error occurred."
  - Error context includes full API error details

- ❌ **401 Unauthorized** - NOT reportable
  - Automatically triggers logout
  - No toast shown (redirects to login)

- ❌ **403 Forbidden** - NOT reportable
  - Title: "Access Denied"
  - Message: "You do not have permission to perform this action."
  - Expected behavior, not a system error

- ❌ **404 Not Found** - NOT reportable
  - Title: "Not Found"
  - Message: "The requested resource was not found."
  - Expected behavior for missing resources

- ❌ **429 Too Many Requests** - NOT reportable
  - Title: "Too Many Requests"
  - Message: "Too many requests. Please try again later."
  - Type: `warning` (not error)
  - Expected rate limiting behavior

#### `handleNetworkError` - Network Errors
- ✅ **Network connectivity errors** - Reportable
  - Title: "Network Error"
  - Message: "Network connection error. Please check your internet connection and try again."
  - Error context automatically collected

- ✅ **General network errors** - Reportable
  - Title: "Network Error"
  - Message: "A network error occurred. Please try again."
  - Error context automatically collected

#### `handleValidationError` - Validation Errors
- ❌ **Validation errors** - NOT reportable
  - User input issues, not system errors
  - Shown via console only

---

### 3. Payment Errors

**Location**: `src/components/modals/MembershipModal.tsx` - `handleSubmit` function

**Automatically Tracked & Auto-Logged**:
- ✅ **Payment failures** - Reportable + Auto-logged
  - **Insufficient funds**:
    - Title: "Payment Failed - Insufficient Funds"
    - Message: "Your card was declined due to insufficient funds. Please try a different payment method or contact your bank."
    - Auto-logged with: PaymentIntent ID, amount, package info, error codes
  
  - **Card declined**:
    - Title: "Payment Declined"
    - Message: "Your card was declined. Please check your card details or try a different payment method."
    - Auto-logged with: PaymentIntent ID, amount, package info, error codes
  
  - **Other payment failures**:
    - Title: "Purchase Failed" (authenticated) or "Account Creation Failed" (new users)
    - Message: Error message from API or Stripe
    - Auto-logged with: PaymentIntent ID, amount, package info, error codes

**Error Context Includes**:
- API endpoint: `/api/stripe/create-subscription` or `/api/stripe/create-one-time-purchase`
- HTTP method: `POST`
- PaymentIntent ID (if available)
- Customer ID (if available)
- Package ID and name
- Error codes (Stripe error code, decline code)
- Amount in cents

**Special Cases**:
- ❌ **EXISTING_SUBSCRIPTION error** - NOT reportable
  - Title: "Active Subscription Found"
  - Message: Error message from API
  - Has special action button: "Manage Subscription" (redirects to `/my-account`)
  - Duration: 10 seconds (longer than normal)
  - This is expected behavior, not an error

**Auto-Logged Payment Errors**:
All payment failures are automatically logged to the database with full context, even if the user doesn't click "Report Problem". This ensures complete tracking of revenue-impacting errors.

---

### 4. Stripe Elements Loading Errors

**Location**: `src/components/modals/PaymentMethodSelector.tsx` - StripeElements validation

**Automatically Tracked & Auto-Logged**:
- ✅ **Stripe payment form loading failures** - Reportable + Auto-logged
  - Title: "Payment Form Error"
  - Message: "Failed to load payment form. Please refresh the page and try again."
  - Triggered when Stripe Elements fails to load after 5-second timeout
  - Auto-logged with: Component name, Stripe/Elements loading status
  - Error context includes: Current page URL, browser information

**Error Context Includes**:
- Component: "StripeCardForm" or "PaymentMethodSelector"
- Stripe loaded status: `true`/`false`
- Elements loaded status: `true`/`false`
- Current page URL
- Browser information

---

### 5. Server-Side Auto-Logged Errors

**Location**: `src/app/api/stripe/create-subscription/route.ts` and `src/app/api/stripe/create-one-time-purchase/route.ts`

**Automatically Logged (No User Toast)**:
- ✅ **Stripe API errors** - Auto-logged on server
  - Payment processing errors
  - Subscription creation failures
  - PaymentIntent creation failures
  - Error context includes: PaymentIntent ID, Customer ID, amount, package info, error codes

- ✅ **Server errors** - Auto-logged on server
  - Database errors
  - Unexpected server errors
  - Error context includes: Package info, user info, error details

**Note**: These errors are logged server-side and may also trigger client-side error toasts if the error propagates to the frontend.

---

## Error Tracking Summary

### Reportable Errors (Show "Report Problem" Button)

| Error Type | Location | Auto-Logged | User Can Report |
|------------|----------|------------|-----------------|
| API Server Errors (5xx) | `src/lib/queries.ts` | ❌ | ✅ |
| Network Errors | `src/lib/queries.ts` | ❌ | ✅ |
| Generic Errors | `src/hooks/useErrorHandling.ts` | ❌ | ✅ |
| Payment Failures | `src/components/modals/MembershipModal.tsx` | ✅ | ✅ |
| Stripe Elements Loading | `src/components/modals/PaymentMethodSelector.tsx` | ✅ | ✅ |
| Server Payment Errors | API Routes | ✅ | ❌ (server-side only) |

### Non-Reportable Errors (No "Report Problem" Button)

| Error Type | Location | Reason |
|------------|----------|--------|
| 401 Unauthorized | `src/hooks/useErrorHandling.ts` | Expected behavior (triggers logout) |
| 403 Forbidden | `src/hooks/useErrorHandling.ts` | Expected behavior (access control) |
| 404 Not Found | `src/hooks/useErrorHandling.ts` | Expected behavior (missing resource) |
| 429 Rate Limited | `src/hooks/useErrorHandling.ts` | Expected behavior (rate limiting) |
| Validation Errors | `src/hooks/useErrorHandling.ts` | User input issues |
| EXISTING_SUBSCRIPTION | `src/components/modals/MembershipModal.tsx` | Expected behavior (user already has subscription) |

---

## Best Practices

### When to Make Errors Reportable

- ✅ **Server errors (5xx)**: Always reportable
- ✅ **Network errors**: Always reportable
- ✅ **Unexpected errors**: Reportable
- ✅ **Payment errors**: Always reportable and auto-logged
- ❌ **Client errors (4xx)**: Not reportable (user input issues)
- ❌ **Auth errors (401, 403)**: Not reportable (expected behavior)
- ❌ **Validation errors (400)**: Not reportable (user input issues)

### When to Auto-Log Errors

- ✅ **Payment failures**: Always auto-log (critical for revenue debugging)
- ✅ **Stripe API errors**: Always auto-log
- ✅ **StripeElements loading failures**: Always auto-log
- ✅ **PaymentIntent creation failures**: Always auto-log
- ✅ **Server-side payment processing errors**: Always auto-log
- ❌ **Validation errors**: Don't auto-log (user input issues)
- ❌ **Network timeouts**: Don't auto-log (user can retry)

### Error Message Guidelines

- Use clear, user-friendly error messages
- Avoid technical jargon when possible
- Include actionable information when available

### Admin Notes Guidelines

- Document investigation steps
- Note related issues or patterns
- Include resolution steps for resolved reports
- Reference ticket numbers or related reports

---

## Troubleshooting

### Reports Not Appearing

1. Check admin authentication (must be admin role)
2. Verify database connection
3. Check browser console for errors
4. Verify API endpoints are accessible

### Rate Limiting Issues

- Rate limits reset after the time window expires
- Authenticated users have higher limits than anonymous users
- Check `retryAfterSeconds` in error response

### Duplicate Reports

- Duplicates are detected within 1-hour windows
- Same error + same user + same endpoint = duplicate
- Normalized error messages help identify similar errors

### Context Collection Fails

- Context collection fails silently
- Errors are still reportable, just with less context
- Check browser console for warnings

---

## Database Schema

### ErrorReport Model

```typescript
{
  // User Information
  userId?: ObjectId;
  userEmail?: string;
  isAuthenticated: boolean;

  // Error Details
  errorMessage: string;
  errorStack?: string;
  errorName?: string;

  // Request/Response
  apiEndpoint?: string;
  httpMethod?: string;
  httpStatus?: number;
  requestUrl?: string;

  // User Notes
  userNotes?: string;

  // Browser/Environment
  userAgent?: string;
  browserInfo?: { name, version, os };
  currentUrl?: string;
  route?: string;
  referrer?: string;

  // Console Errors
  consoleErrors?: Array<{ message, source, line, column, timestamp }>;

  // Privacy
  ipAddressHash?: string;

  // Status & Admin
  status: "new" | "investigating" | "resolved" | "dismissed";
  adminNotes?: string;
  resolvedAt?: Date;
  resolvedBy?: ObjectId;

  // Deduplication
  deduplicationHash: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes

- `userId + createdAt` (for user history)
- `status + createdAt` (for admin filtering)
- `deduplicationHash` (unique, for deduplication)
- `apiEndpoint + createdAt` (for endpoint debugging)
- `errorMessage` (text index for search)
- `createdAt` (TTL index, auto-delete after 90 days)

---

## Security Considerations

### Data Privacy

- IP addresses are hashed using SHA-256 (one-way hash)
- No sensitive user data is stored
- User notes are sanitized to prevent XSS

### Access Control

- Error reports are admin-only
- Admin authentication is required for all admin endpoints
- User can only create reports, not view them

### Input Validation

- All inputs are validated using Zod schemas
- User notes are sanitized (HTML tags removed, special characters encoded)
- Maximum length limits prevent abuse

---

## Performance Considerations

### Database Optimization

- TTL index automatically deletes reports older than 90 days
- Indexes optimize common queries (status, date, user)
- Pagination prevents loading too many reports at once

### Rate Limiting

- In-memory rate limiting (fast, no database queries)
- Prevents database flooding from spam
- Configurable limits per user type

### Deduplication

- Prevents duplicate reports from cluttering database
- Hash-based comparison is fast
- 1-hour window balances deduplication with new issue detection

---

## Version History

### v1.1.0 (Automatic Logging Enhancement)

- **Automatic error logging** for critical errors (payment failures, Stripe errors)
- Client-side and server-side auto-logging utilities
- Payment error tracking with full context (PaymentIntent ID, amount, package info)
- StripeElements loading validation and error logging
- Hybrid approach: Auto-logged errors + user-reported context
- Enhanced error context for payment debugging

### v1.0.0 (Initial Release)

- Basic error reporting functionality
- Report Problem button on error toasts
- Admin dashboard for viewing reports
- Rate limiting and deduplication
- Automatic context collection
- 90-day TTL for automatic cleanup

---

## Additional Resources

- [Error Handling Best Practices](./ERROR_HANDLING_BEST_PRACTICES.md) (if exists)
- [Admin Dashboard Guide](./ADMIN_DASHBOARD_GUIDE.md) (if exists)
- [API Documentation](./API_DOCUMENTATION.md) (if exists)

---

## Support

For issues or questions about the Error Reporting System:
1. Check this documentation
2. Review error reports in admin dashboard
3. Contact the development team

