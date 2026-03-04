# SendGrid Email Testing Guide

This guide will help you test the SendGrid email integration to ensure all email types are working correctly.

For module architecture and API reference, see [EMAIL_MODULE.md](./EMAIL_MODULE.md).

## Prerequisites

1. **SendGrid Account Setup**
   - Sign up at [SendGrid](https://sendgrid.com/) (free tier available)
   - Verify your account (check email)
   - Create an API Key:
     - Go to Settings → API Keys
     - Click "Create API Key"
     - Name it (e.g., "Tools Australia Production")
     - Select "Full Access" or "Restricted Access" with Mail Send permissions
     - Copy the API key (you'll only see it once!)

2. **Domain Authentication (Recommended for Production)**
   - Go to Settings → Sender Authentication
   - Authenticate your domain (`toolsaustralia.com.au`)
   - This improves deliverability and allows you to send from `@toolsaustralia.com.au`
   - For testing, you can use the default SendGrid sender

## Environment Configuration

Add these variables to your `.env.local` (development) or production environment:

```bash
# SendGrid Configuration
SENDGRID_API_KEY=SG.your-actual-api-key-here
EMAIL_ENABLED=true
EMAIL_RETRY_ATTEMPTS=3
EMAIL_RETRY_DELAY_MS=1000

# Recipient for contact form and partner application notifications
CONTACT_EMAIL=support@toolsaustralia.com.au

# Email Verification: 3 per 5 min, 24hr expiry
EMAIL_VERIFICATION_EXPIRY_MINUTES=1440
EMAIL_VERIFICATION_RATE_LIMIT_PER_5MIN=3

# Password Reset: 24hr expiry
PASSWORD_RESET_EXPIRY_MINUTES=1440
```

**Important:** 
- Replace `SG.your-actual-api-key-here` with your actual SendGrid API key
- `SENDGRID_FROM_EMAIL` and `SENDGRID_FROM_NAME` are NOT used; sender addresses are per email type
- Domain authentication is required: all sender addresses use `@toolsaustralia.com.au`. Authenticate in SendGrid (Settings → Sender Authentication) before sending

## Testing Methods

### Method 1: Using the Test API Endpoint

The easiest way to test email verification:

```bash
# Test email verification
curl -X POST http://localhost:3000/api/test/email-verification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-test-email@example.com",
    "userName": "Test User"
  }'
```

Or use a tool like Postman, Thunder Client, or the browser console:

```javascript
fetch('/api/test/email-verification', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'your-test-email@example.com',
    userName: 'Test User'
  })
})
.then(r => r.json())
.then(console.log);
```

### Method 2: Test Through Application Flow

#### 1. Email Verification Test

1. Start your development server: `npm run dev`
2. Navigate to the registration/login page
3. Enter a test email address
4. Request email verification
5. Check your email inbox (and spam folder)
6. Verify the email contains:
   - Correct branding (Tools Australia logo)
   - Verification code displayed clearly
   - Proper styling and layout

#### 2. Password Reset Test

1. Go to the login page
2. Click "Forgot Password"
3. Enter a test email address
4. Check your email for the reset link
5. Verify:
   - Reset button/link works
   - Email styling is correct
   - Link expires after 60 minutes

#### 3. Contact Form Test

1. Navigate to `/contact`
2. Fill out the contact form
3. Submit the form
4. Check the `CONTACT_EMAIL` inbox for the notification
5. Verify:
   - All form data is included
   - Reply-to is set to the submitter's email
   - Email formatting is correct

#### 4. Partner Application Test

1. Navigate to `/partner`
2. Fill out the partner application form
3. Submit the application
4. Check the `CONTACT_EMAIL` inbox
5. Verify all application details are included

### Method 3: Direct API Testing

Test each email type directly via API:

#### Email Verification
```bash
POST /api/auth/send-email-verification
{
  "email": "test@example.com"
}
```

#### Password Reset
```bash
POST /api/auth/request-password-reset
{
  "email": "test@example.com"
}
```

#### Contact Submission
```bash
POST /api/contact-submissions
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "0412345678",
  "subject": "Test Subject",
  "message": "Test message"
}
```

#### Partner Application
```bash
POST /api/partner-applications
{
  "firstName": "Jane",
  "lastName": "Smith",
  "businessName": "Test Business",
  "email": "jane@example.com",
  "phone": "0412345678",
  "abn": "12345678901",
  "goals": "Test partnership goals"
}
```

## Sender Identity Mapping

Each email type uses a different "from" address for clarity and deliverability:

| Email Type | From Address | Reply-To |
|------------|--------------|----------|
| Verification | verify-email@toolsaustralia.com.au | — |
| Password reset | reset-password@toolsaustralia.com.au | — |
| Contact form notification | no-reply@toolsaustralia.com.au | Submitter's email |
| Partner application notification | no-reply@toolsaustralia.com.au | Submitter's email |
| Admin support email | support@toolsaustralia.com.au | support@toolsaustralia.com.au |
| Custom / transactional | no-reply@toolsaustralia.com.au | — |

Contact and partner form notifications are sent **to** `CONTACT_EMAIL` (default: support@toolsaustralia.com.au).

## Verification Checklist

For each email type, verify:

- [ ] **Email is received** (check inbox and spam)
- [ ] **Sender name** matches the type (e.g. "Tools Australia" or "Tools Australia Support")
- [ ] **From email** matches the sender identity (verify-email@, reset-password@, no-reply@, support@)
- [ ] **Subject line** is correct
- [ ] **HTML rendering** is correct (logo, colors, layout)
- [ ] **Text version** is readable (if provided)
- [ ] **Links work** (password reset, etc.)
- [ ] **Dynamic content** is correct (user name, codes, etc.)
- [ ] **Mobile responsive** (test on phone/email client)
- [ ] **No broken images** (logo loads correctly)

## SendGrid Dashboard Monitoring

1. **Activity Feed**
   - Go to SendGrid Dashboard → Activity
   - View all sent emails
   - Check delivery status
   - Monitor bounces and spam reports

2. **Statistics**
   - View delivery rates
   - Check open rates (if tracking enabled)
   - Monitor bounce rates

3. **Email Events** (Webhooks - Optional)
   - Set up webhooks to track:
     - Delivered
     - Opened
     - Clicked
     - Bounced
     - Spam reports
     - Unsubscribes

## Common Issues & Solutions

### Issue: "SENDGRID_API_KEY is required but not configured"
**Solution:** Make sure you've added `SENDGRID_API_KEY` to your `.env.local` file and restarted the dev server.

### Issue: "Email not received"
**Solutions:**
1. Check spam/junk folder
2. Verify sender email is authenticated in SendGrid
3. Check SendGrid Activity Feed for delivery status
4. Verify `EMAIL_ENABLED=true` in environment
5. Check server logs for errors

### Issue: "Invalid sender email"
**Solution:** 
- Authenticate your domain in SendGrid (Settings → Sender Authentication). Once the domain `toolsaustralia.com.au` is authenticated, all addresses under that domain (verify-email@, reset-password@, no-reply@, support@) are valid.

### Issue: "Rate limit exceeded"
**Solution:**
- SendGrid free tier: 100 emails/day
- Check your SendGrid dashboard for usage
- Wait for the rate limit to reset or upgrade your plan

### Issue: "Email looks broken"
**Solutions:**
1. Check that logo URL is accessible (must be absolute URL)
2. Verify base URL is correct in environment variables
3. Test in different email clients (Gmail, Outlook, Apple Mail)
4. Check SendGrid Activity for rendering issues

## Testing in Production

Before going live:

1. **Verify Domain Authentication**
   - Complete domain authentication in SendGrid
   - Set up SPF, DKIM, and DMARC records
   - Wait for verification (can take 24-48 hours)

2. **Test with Real Users**
   - Send test emails to real email addresses
   - Verify delivery across different providers (Gmail, Outlook, etc.)
   - Check spam scores

3. **Monitor First 24 Hours**
   - Watch SendGrid Activity Feed
   - Monitor bounce rates
   - Check for any delivery issues
   - Review user feedback

4. **Set Up Alerts** (Optional)
   - Configure SendGrid webhooks
   - Set up monitoring for high bounce rates
   - Alert on delivery failures

## Quick Test Script

Create a test file `test-emails.ts`:

```typescript
import { emailService } from '@/lib/email/';

async function testAllEmails() {
  const testEmail = 'your-test-email@example.com';
  
  console.log('Testing email verification...');
  const verification = await emailService.sendVerificationEmail(testEmail, {
    userName: 'Test User',
    verificationCode: 'ABC123',
    expiryHours: 24,
  });
  console.log('Verification:', verification);
  
  console.log('Testing password reset...');
  const reset = await emailService.sendPasswordResetEmail(testEmail, {
    userName: 'Test User',
    resetUrl: 'https://toolsaustralia.com.au/reset-password?token=test123',
    expiryMinutes: 60,
  });
  console.log('Reset:', reset);
  
  console.log('Testing contact submission (sends to CONTACT_EMAIL)...');
  const contact = await emailService.sendContactSubmissionEmail({
    firstName: 'John',
    lastName: 'Doe',
    email: testEmail,
    phone: '0412345678',
    subject: 'Test Subject',
    message: 'Test message',
    submittedAt: new Date().toISOString(),
  });
  console.log('Contact:', contact);
}

testAllEmails();
```

Run with: `tsx test-emails.ts`

## Next Steps

After successful testing:

1. Set up SendGrid webhooks (optional)
2. Configure email analytics
3. Set up monitoring/alerts
4. See `docs/EMAIL_MODULE.md` for module architecture and API reference

## Support

- SendGrid Documentation: https://docs.sendgrid.com/
- SendGrid Support: https://support.sendgrid.com/
- Check server logs for detailed error messages
- Review SendGrid Activity Feed for delivery issues






















