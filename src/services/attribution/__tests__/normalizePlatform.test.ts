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

console.log("normalizePlatform: all assertions passed");
