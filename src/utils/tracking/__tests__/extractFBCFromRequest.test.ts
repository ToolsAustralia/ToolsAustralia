import assert from "node:assert/strict";
import { extractFBCFromRequest } from "../facebook-helpers";

function makeRequest(opts: { url?: string; cookieValue?: string }) {
  return {
    url: opts.url,
    cookies: {
      get(name: string) {
        return opts.cookieValue && name === "_fbc" ? { value: opts.cookieValue } : undefined;
      },
    },
  };
}

function testReadsFbcCookieFirst() {
  const req = makeRequest({
    url: "https://example.com/checkout?fbclid=AbcXyz",
    cookieValue: "fb.1.1700000000.STABLE",
  });
  const fbc = extractFBCFromRequest(req);
  assert.equal(fbc, "fb.1.1700000000.STABLE");
}

function testFallsBackToFbclidWhenNoCookie() {
  const req = makeRequest({ url: "https://example.com/checkout?fbclid=AbcXyz" });
  const fbc = extractFBCFromRequest(req);
  assert.match(fbc ?? "", /^fb\.1\.\d+\.AbcXyz$/);
}

function testReturnsUndefinedWhenNoCookieAndNoFbclid() {
  const req = makeRequest({ url: "https://example.com/checkout" });
  assert.equal(extractFBCFromRequest(req), undefined);
}

function testTwoCallsWithCookieReturnSameValue() {
  const req = makeRequest({
    url: "https://example.com/checkout?fbclid=AbcXyz",
    cookieValue: "fb.1.1700000000.STABLE",
  });
  assert.equal(extractFBCFromRequest(req), extractFBCFromRequest(req));
}

function testFormattedFbcQueryParamPassesThrough() {
  const req = makeRequest({ url: "https://example.com/checkout?fbc=fb.1.999.YYY" });
  assert.equal(extractFBCFromRequest(req), "fb.1.999.YYY");
}

function run() {
  testReadsFbcCookieFirst();
  testFallsBackToFbclidWhenNoCookie();
  testReturnsUndefinedWhenNoCookieAndNoFbclid();
  testTwoCallsWithCookieReturnSameValue();
  testFormattedFbcQueryParamPassesThrough();
  console.log("extractFBCFromRequest tests passed");
}

run();
