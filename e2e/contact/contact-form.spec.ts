// e2e/contact/contact-form.spec.ts
//
// Submits the public contact form on /contact and verifies the API returned
// 201 + a ContactSubmission row was created in Mongo. Form requires 6 fields
// (firstName, lastName, email, phone, subject radio, message). Submit button
// is a MetallicButton — target by role/text.
import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { getDb } from "../fixtures/seed-helpers";

test.describe("contact form submission", () => {
  test("fills all fields, submits, and persists a ContactSubmission", async ({ page }) => {
    const unique = Date.now();
    const email = `e2e-contact-${unique}@example.com`;
    const subjectText = `E2E Contact Test ${unique}`;
    const messageText = "This is an end-to-end test message that is well over ten characters.";

    await page.goto("/contact");

    // Wait for hydrated form to be ready.
    await expect(page.locator(byTestId(testid.contactForm))).toBeVisible({ timeout: 5_000 });

    await page.locator(byTestId(testid.contactFirstName)).fill("E2E");
    await page.locator(byTestId(testid.contactLastName)).fill("Tester");
    await page.locator(byTestId(testid.contactEmail)).fill(email);
    await page.locator(byTestId(testid.contactPhone)).fill("0400000000");
    // Subject is a preset radio group; default "General Inquiry" is selected.
    // We override the form's submitted subject by sending a unique value via the
    // message body so we can verify by email below — but ContactSubmission keeps
    // the radio's chosen value in `subject`. Just confirm default subject
    // ("General Inquiry") survives by leaving radios untouched and assert against
    // our unique email above.
    void subjectText; // silence unused
    await page.locator(byTestId(testid.contactMessage)).fill(messageText);

    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/contact-submissions") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: /send message/i }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data?.id).toBeTruthy();

    // Verify row exists in Mongo.
    const { ContactSubmission } = await getDb();
    const row = await ContactSubmission.findOne({ email }).lean();
    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      firstName: "E2E",
      lastName: "Tester",
      email,
      phone: "0400000000",
      subject: "General Inquiry",
      message: messageText,
    });

    // Cleanup: remove the seeded row so repeated runs stay clean.
    await ContactSubmission.deleteOne({ email });
  });
});
