// e2e/utils/intercept.ts
//
// Helpers to wait for and assert against backend API calls without
// duplicating page.waitForResponse() boilerplate in every spec.

import { Page, Response, expect } from "@playwright/test";

/**
 * Wait for the next request to a URL matching a substring AND return
 * its parsed JSON body. Throws if the response is not 2xx unless allowError.
 */
export async function waitForApi<T = unknown>(
  page: Page,
  urlSubstring: string,
  options: { method?: string; allowError?: boolean; timeoutMs?: number } = {},
): Promise<{ status: number; body: T; response: Response }> {
  const response = await page.waitForResponse(
    (r) =>
      r.url().includes(urlSubstring) &&
      (!options.method || r.request().method() === options.method),
    { timeout: options.timeoutMs ?? 15_000 },
  );
  const status = response.status();
  if (!options.allowError) {
    expect(status, `${response.url()} returned ${status}`).toBeLessThan(400);
  }
  let body: T = undefined as unknown as T;
  try {
    body = (await response.json()) as T;
  } catch {
    // Non-JSON response — body stays undefined
  }
  return { status, body, response };
}

/**
 * Assert a JSON response shape contains specific keys with expected values.
 * Use for shallow equality on sub-objects.
 */
export function assertJsonShape(
  actual: unknown,
  expected: Record<string, unknown>,
): void {
  expect(actual).toMatchObject(expected);
}
