import assert from "node:assert/strict";
import { normalizeUtmToPlatform } from "../normalizePlatform";

assert.equal(normalizeUtmToPlatform("Facebook"), "meta");
assert.equal(normalizeUtmToPlatform("fb"), "meta");
assert.equal(normalizeUtmToPlatform("instagram"), "meta");
assert.equal(normalizeUtmToPlatform("ig"), "meta");
assert.equal(normalizeUtmToPlatform("meta"), "meta");
assert.equal(normalizeUtmToPlatform("TikTok"), "tiktok");
assert.equal(normalizeUtmToPlatform("snap"), "snapchat");
assert.equal(normalizeUtmToPlatform("google"), "google");
assert.equal(normalizeUtmToPlatform("adwords"), "google");
assert.equal(normalizeUtmToPlatform("Klaviyo", "email"), "klaviyo_email");
assert.equal(normalizeUtmToPlatform("klaviyo", "sms"), "klaviyo_sms");
assert.equal(normalizeUtmToPlatform("klaviyo", "whatsapp"), "other");
assert.equal(normalizeUtmToPlatform("klaviyo"), "other");
assert.equal(normalizeUtmToPlatform("newsletter"), "other");
assert.equal(normalizeUtmToPlatform(undefined), null);
assert.equal(normalizeUtmToPlatform(""), null);

// Domain/referrer forms real ad traffic carries (the facebook.com=7,300-row miss + variants)
assert.equal(normalizeUtmToPlatform("facebook.com"), "meta");
assert.equal(normalizeUtmToPlatform("FACEBOOK.COM"), "meta"); // case-insensitive
assert.equal(normalizeUtmToPlatform("m.facebook.com"), "meta");
assert.equal(normalizeUtmToPlatform("l.facebook.com"), "meta");
assert.equal(normalizeUtmToPlatform("fb.com"), "meta");
assert.equal(normalizeUtmToPlatform("instagram.com"), "meta");
assert.equal(normalizeUtmToPlatform("tiktok.com"), "tiktok");
assert.equal(normalizeUtmToPlatform("snapchat.com"), "snapchat");
assert.equal(normalizeUtmToPlatform("googleadservices.com"), "google");
// Organic google.com is deliberately NOT the paid Google channel
assert.equal(normalizeUtmToPlatform("google.com"), "other");
// A genuinely unknown domain still falls to "other"
assert.equal(normalizeUtmToPlatform("somerandomsite.com"), "other");

console.log("normalizePlatform: all assertions passed");
