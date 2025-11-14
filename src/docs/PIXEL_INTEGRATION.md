# Pixel Integration Guide

This guide explains how to use the integrated Meta (Facebook) Pixel and TikTok Pixel tracking system in the Tools Australia website.

## Overview

The pixel integration provides:
- **Meta Pixel (Facebook)**: Tracks user interactions for advertising and analytics
- **TikTok Pixel**: Measures advertising effectiveness and user engagement
- **Unified tracking system**: Single interface for both platforms
- **Privacy compliance**: GDPR-ready consent management
- **TypeScript support**: Fully typed for better development experience

## Environment Variables

Add these to your `.env.local` file:

```env
# Meta Pixel (Facebook)
NEXT_PUBLIC_FACEBOOK_PIXEL_ID=794467123372847

# TikTok Pixel
NEXT_PUBLIC_TIKTOK_PIXEL_ID=D3NFN8RC77U1STIOI7F0
```

## Components

### 1. PixelTracker Component

The main component that manages both pixels:

```tsx
import PixelTracker from "@/components/PixelTracker";

<PixelTracker 
  facebookPixelId={process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID}
  tiktokPixelId={process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID}
  disabled={process.env.NODE_ENV === "development"}
/>
```

### 2. Individual Pixel Components

- `FacebookPixel`: Handles Meta Pixel initialization and tracking
- `TikTokPixel`: Handles TikTok Pixel initialization and tracking

### 3. Auto-Accept Mode

- **No Consent Modal**: All users automatically consent to pixel tracking
- **Immediate Tracking**: Pixels start tracking immediately on page load
- **No User Interaction**: No popup or user choice required

## Usage Examples

### Basic Event Tracking

```tsx
import { usePixelTracking } from "@/hooks/usePixelTracking";

function ProductPage() {
  const { trackEvent } = usePixelTracking();

  const handleProductView = () => {
    trackEvent("ViewContent", {
      value: 99.99,
      currency: "USD",
      productId: "product-123"
    });
  };

  return (
    <div>
      <button onClick={handleProductView}>
        View Product
      </button>
    </div>
  );
}
```

### Purchase Tracking

```tsx
import { usePixelTracking } from "@/hooks/usePixelTracking";

function CheckoutSuccess() {
  const { trackPurchase } = usePixelTracking();

  useEffect(() => {
    trackPurchase({
      value: 199.99,
      currency: "USD",
      orderId: "order-12345"
    });
  }, []);

  return <div>Thank you for your purchase!</div>;
}
```

### Platform-Specific Tracking

```tsx
import { usePixelTracking } from "@/hooks/usePixelTracking";

function ContactForm() {
  const { trackContact } = usePixelTracking();

  const handleSubmit = () => {
    // Only track on TikTok
    trackContact(['tiktok']);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form content */}
    </form>
  );
}
```

## Available Tracking Methods

### Generic Methods

- `trackEvent(eventName, parameters, platforms?)`: Track custom events
- `trackCustomEvent(eventName, parameters, platforms?)`: Alias for trackEvent

### E-commerce Methods

- `trackPurchase(params, platforms?)`: Track completed purchases
- `trackAddToCart(params, platforms?)`: Track add to cart events
- `trackInitiateCheckout(params, platforms?)`: Track checkout initiation
- `trackViewContent(params, platforms?)`: Track product page views

### User Engagement Methods

- `trackSearch(searchString, platforms?)`: Track search queries
- `trackCompleteRegistration(params, platforms?)`: Track user registration
- `trackLead(params, platforms?)`: Track lead generation
- `trackSubscribe(params, platforms?)`: Track newsletter subscriptions
- `trackContact(platforms?)`: Track contact form submissions

## Event Parameters

All tracking methods accept a `PixelEventParams` object:

```typescript
interface PixelEventParams {
  value?: number;           // Monetary value
  currency?: string;        // Currency code (default: "USD")
  productId?: string;       // Product identifier
  orderId?: string;         // Order identifier
  numItems?: number;        // Number of items
  method?: string;          // Registration method
  [key: string]: any;       // Additional custom parameters
}
```

## Privacy & Consent

### Automatic Consent Management

The system automatically shows a consent modal in production if no consent has been given:

```tsx
import { usePixelConsent } from "@/components/modals/PixelConsentModal";

function App() {
  const { showConsent, handleAccept, handleDecline, handleClose } = usePixelConsent();

  return (
    <>
      {/* Your app content */}
      <PixelConsentModal
        isOpen={showConsent}
        onClose={handleClose}
        onAccept={handleAccept}
        onDecline={handleDecline}
      />
    </>
  );
}
```

### Manual Consent Management

```tsx
import { grantPixelConsent, revokePixelConsent, hasPixelConsent } from "@/components/PixelTracker";

// Check current consent status
const userHasConsent = hasPixelConsent();

// Grant consent (reloads page to initialize pixels)
const handleAccept = () => {
  grantPixelConsent();
};

// Revoke consent
const handleDecline = () => {
  revokePixelConsent();
};
```

## Best Practices

### 1. Performance Optimization

- Pixels are disabled in development mode by default
- Scripts are loaded asynchronously to avoid blocking page load
- Consent is cached in localStorage to avoid repeated prompts

### 2. Error Handling

- All tracking functions include safety checks for `window` object
- Failed tracking calls don't break the application
- Console warnings for missing pixel IDs

### 3. Development vs Production

```tsx
// Development: Pixels disabled
<PixelTracker 
  facebookPixelId={process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID}
  tiktokPixelId={process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID}
  disabled={process.env.NODE_ENV === "development"}
/>

// Production: Pixels enabled with consent
<PixelTracker 
  facebookPixelId={process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID}
  tiktokPixelId={process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID}
  enableConsent={true}
/>
```

### 4. Testing

```tsx
// Test specific platforms
const { trackPurchase } = usePixelTracking();

// Test only Facebook
trackPurchase({ value: 100 }, ['facebook']);

// Test only TikTok
trackPurchase({ value: 100 }, ['tiktok']);

// Test both (default)
trackPurchase({ value: 100 });
```

## Troubleshooting

### Common Issues

1. **Pixels not loading**: Check environment variables are set correctly
2. **Events not firing**: Ensure consent has been granted in production
3. **Development issues**: Pixels are disabled in development by default

### Debug Mode

Enable debug mode in browser console:

```javascript
// Facebook Pixel debug
fbq('debug', true);

// TikTok Pixel debug
ttq.debug(true);
```

### Verification

Use browser developer tools to verify pixel loading:

1. Open Network tab
2. Look for requests to:
   - `connect.facebook.net/en_US/fbevents.js`
   - `analytics.tiktok.com/i18n/pixel/events.js`
3. Check for pixel firing in Events tab

## Integration Checklist

- [ ] Add pixel IDs to environment variables
- [ ] Update layout.tsx to use PixelTracker
- [ ] Implement consent modal (if required)
- [ ] Add tracking calls to key user actions
- [ ] Test in development and production
- [ ] Verify pixel firing in browser tools
- [ ] Set up conversion tracking in ad platforms

## Support

For issues or questions about pixel integration:

1. Check browser console for errors
2. Verify environment variables
3. Test with browser developer tools
4. Check ad platform dashboards for data
