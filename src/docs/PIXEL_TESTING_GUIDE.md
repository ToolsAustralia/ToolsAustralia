# 🧪 Pixel Testing Guide for Development

## **🔍 How to Verify Pixel Events Are Working (Without Client Access)**

### **Method 1: Browser Console Logging** ⭐ **RECOMMENDED**

1. **Open Developer Tools** (F12)
2. **Go to Console tab**
3. **Click any test button** on `/test-pixels`
4. **Look for these logs:**

```javascript
// When you click a test button, you should see:
🎯 Tracking event: PageView {test: true}
📘 Sending to Facebook: PageView {test: true}
📘 Facebook Pixel: Sending PageView {test: true}
✅ Facebook Pixel: PageView sent successfully
📱 Sending to TikTok: PageView {test: true}
📱 TikTok Pixel: Sending PageView {test: true}
✅ TikTok Pixel: PageView sent successfully
```

### **Method 2: Network Tab Verification**

1. **Open Developer Tools** (F12)
2. **Go to Network tab**
3. **Click a test button**
4. **Look for these requests:**

#### **Facebook Pixel Requests:**

- `connect.facebook.net/en_US/fbevents.js` (Initial load)
- `www.facebook.com/tr` (Event tracking requests)

#### **TikTok Pixel Requests:**

- `analytics.tiktok.com/i18n/pixel/events.js` (Initial load)
- `analytics.tiktok.com/i18n/pixel/events.js` (Event tracking requests)

### **Method 3: Pixel Helper Extensions**

#### **Facebook Pixel Helper (Chrome Extension):**

1. Install "Facebook Pixel Helper" from Chrome Web Store
2. Visit your test page
3. Click test buttons
4. Extension will show:
   - ✅ Green: Events sent successfully
   - ⚠️ Yellow: Events sent with warnings
   - ❌ Red: Events failed

#### **TikTok Pixel Helper:**

1. Install "TikTok Pixel Helper" from Chrome Web Store
2. Same process as Facebook

### **Method 4: Manual Console Testing**

Open browser console and run:

```javascript
// Test Facebook Pixel
console.log("Facebook Pixel loaded:", typeof window.fbq);
window.fbq("track", "PageView", { test: true });

// Test TikTok Pixel
console.log("TikTok Pixel loaded:", typeof window.ttq);
window.ttq.track("PageView", { test: true });
```

## **🚫 What You WON'T See:**

### **❌ No API Requests to Your Server**

- Pixel events don't send requests to your domain
- They send directly to Facebook/TikTok servers
- You won't see them in Network tab as requests to `localhost:3000`

### **❌ No Database Changes**

- Pixel events don't affect your database
- They're purely for advertising platforms

## **✅ What You WILL See:**

### **✅ Console Logs**

- Detailed logging of every event sent
- Success/failure status
- Event parameters

### **✅ Network Requests**

- Direct requests to Facebook/TikTok servers
- Pixel script loading
- Event tracking requests

### **✅ Pixel Helper Extensions**

- Visual confirmation of events
- Event details and parameters
- Error detection

## **🔧 Development Testing Checklist:**

### **Before Testing:**

- [ ] Set up environment variables with your pixel IDs
- [ ] Ensure consent is granted (or test both states)
- [ ] Open browser Developer Tools

### **During Testing:**

- [ ] Check console for detailed logs
- [ ] Verify Network tab shows pixel requests
- [ ] Use Pixel Helper extensions
- [ ] Test both consent granted/denied states

### **What to Look For:**

- [ ] Console shows "✅ sent successfully" messages
- [ ] Network tab shows requests to Facebook/TikTok
- [ ] Pixel Helper shows green checkmarks
- [ ] No JavaScript errors in console

## **🎯 Testing Different Scenarios:**

### **1. Consent Granted:**

```javascript
// Should see all events being sent
🎯 Tracking event: PageView
📘 Sending to Facebook: PageView
✅ Facebook Pixel: PageView sent successfully
```

### **2. Consent Denied:**

```javascript
// Should see events being blocked
🚫 Pixel tracking disabled due to consent for event: PageView
```

### **3. Pixels Not Loaded:**

```javascript
// Should see warnings
❌ Facebook Pixel: Not loaded or not available
❌ TikTok Pixel: Not loaded or not available
```

## **🚀 Production Verification:**

### **When You Have Client Access:**

1. **Facebook Events Manager:**

   - Go to `business.facebook.com/events_manager`
   - Select your pixel
   - Check "Test Events" tab
   - Should see real-time events

2. **TikTok Events Manager:**
   - Go to `ads.tiktok.com`
   - Navigate to Events → Test Events
   - Should see real-time events

### **Without Client Access:**

- Use the development testing methods above
- Console logs and Network tab are sufficient
- Pixel Helper extensions provide visual confirmation

## **🐛 Troubleshooting:**

### **No Console Logs:**

- Check if consent is granted
- Verify pixel IDs are set in environment variables
- Ensure you're not in development mode (pixels disabled)

### **No Network Requests:**

- Check if ad blockers are blocking pixels
- Verify pixel scripts are loading
- Check browser console for errors

### **Events Not Appearing in Managers:**

- Wait 5-10 minutes for events to appear
- Check if you're using the correct pixel IDs
- Verify events are being sent to the right accounts

## **📊 Expected Results:**

### **Successful Event Tracking:**

```
🎯 Tracking event: Purchase {value: 45, currency: "AUD"}
📘 Sending to Facebook: Purchase {value: 45, currency: "AUD"}
📘 Facebook Pixel: Sending Purchase {value: 45, currency: "AUD"}
✅ Facebook Pixel: Purchase sent successfully
📱 Sending to TikTok: Purchase {value: 45, currency: "AUD"}
📱 TikTok Pixel: Sending Purchase {value: 45, currency: "AUD"}
✅ TikTok Pixel: Purchase sent successfully
```

### **Blocked Event (No Consent):**

```
🚫 Pixel tracking disabled due to consent for event: Purchase
```

This comprehensive logging system will show you exactly what's happening with your pixel events in development! 🎉
