# 🔧 Environment Setup for Pixel Testing

## **📋 Required Environment Variables**

Create a `.env.local` file in your project root with these variables:

```bash
# Facebook Pixel & Conversions API
NEXT_PUBLIC_FACEBOOK_PIXEL_ID=794467123372847
FACEBOOK_ACCESS_TOKEN=your-facebook-access-token

# TikTok Pixel
NEXT_PUBLIC_TIKTOK_PIXEL_ID=D3NFN8RC77U1STIOI7F0

# Development Testing (optional)
NEXT_PUBLIC_ENABLE_PIXEL_TESTING=true
```

## **🔍 How to Get Your Pixel IDs:**

### **Facebook Pixel ID:**

1. Go to [Facebook Business Manager](https://business.facebook.com/)
2. Navigate to **Events Manager**
3. Select your pixel
4. Copy the **Pixel ID** (looks like: `123456789012345`)

### **TikTok Pixel ID:**

1. Go to [TikTok Ads Manager](https://ads.tiktok.com/)
2. Navigate to **Assets** → **Events**
3. Select your pixel
4. Copy the **Pixel ID** (looks like: `C1234567890ABCDEF`)

## **✅ Verification Steps:**

### **1. Check Environment Variables:**

```bash
# In your terminal, run:
echo $NEXT_PUBLIC_FACEBOOK_PIXEL_ID
echo $NEXT_PUBLIC_TIKTOK_PIXEL_ID
```

### **2. Check in Browser Console:**

```javascript
// Open browser console and run:
console.log("Facebook Pixel ID:", process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID);
console.log("TikTok Pixel ID:", process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID);
```

### **3. Check Network Tab:**

- Look for requests to `connect.facebook.net`
- Look for requests to `analytics.tiktok.com`

## **🚨 Common Issues:**

### **Issue 1: Pixels Not Loading**

**Solution:** Check if environment variables are set correctly

### **Issue 2: "Not loaded or not available"**

**Solution:**

1. Restart your development server
2. Clear browser cache
3. Check console for errors

### **Issue 3: No Network Requests**

**Solution:**

1. Check if ad blockers are enabled
2. Verify pixel IDs are correct
3. Ensure consent is granted

## **🧪 Development Testing Options:**

### **Option 1: Enable Pixel Testing (Recommended)**

```bash
# Add this to enable pixels in development
NEXT_PUBLIC_ENABLE_PIXEL_TESTING=true
```

### **Option 2: Use Test Pixel IDs**

If you don't have access to the client's pixel IDs:

```bash
# Test Facebook Pixel ID
NEXT_PUBLIC_FACEBOOK_PIXEL_ID=123456789012345

# Test TikTok Pixel ID
NEXT_PUBLIC_TIKTOK_PIXEL_ID=TEST1234567890ABCDEF

# Enable testing
NEXT_PUBLIC_ENABLE_PIXEL_TESTING=true
```

**Note:** Test IDs won't send real events, but they will load the pixel scripts and show in console logs.

### **Option 3: Production Mode**

```bash
# Set NODE_ENV to production (pixels always enabled)
NODE_ENV=production
```

## **🔄 Restart Required:**

After setting environment variables:

1. **Stop** your development server (Ctrl+C)
2. **Restart** with `npm run dev`
3. **Refresh** your browser
4. **Check** the test page for pixel status

## **📊 Expected Results:**

### **✅ Success Indicators:**

- Pixel Status shows "✅ Loaded and ready"
- Console shows pixel loading messages
- Network tab shows pixel script requests
- Test buttons show detailed console logs

### **❌ Failure Indicators:**

- Pixel Status shows "❌ Not loaded"
- Console shows "Not loaded or not available"
- No network requests to Facebook/TikTok
- Environment variables are undefined
