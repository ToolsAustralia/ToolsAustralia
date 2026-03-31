"use client";

import React from "react";

/**
 * Invoice Preview Component
 *
 * Displays a preview of the Klaviyo invoice email template with mock data
 * for development purposes. Shows both paid and pending payment states.
 */
const InvoicePreview: React.FC = () => {
  // Embedded invoice template HTML (matches invoice-email-template.html)
  const invoiceTemplate = `<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <style>
      body, table, td, p { margin: 0; padding: 0; }
      body { background-color: #f2f3f5; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; }
      .wrapper { width: 100%; background-color: #f2f3f5; padding: 40px 10px; }
      .card { max-width: 640px; width: 100%; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb; }
      .header { background: linear-gradient(135deg, #0f172a 0%, #111827 30%, #1f2937 60%, #0b1220 100%); color: #fff; text-align: center; padding: 40px 20px 30px; position: relative; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(0, 0, 0, 0.5); }
      .header-logo { max-width: 160px; height: auto; margin: 0 auto 8px; }
      .header h1 { font-size: 26px; font-weight: bold; margin-bottom: 4px; color: #fff; }
      .header p { font-size: 14px; margin: 0; opacity: 0.9; color: #fff; }
      .content { padding: 30px; }
      .section { margin-bottom: 24px; }
      .section strong { display: inline-block; min-width: 140px; color: #111; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
      .divider { border-top: 1px solid #e6e6e6; margin: 24px 0; }
      .info-box { background-color: #fafbfc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.8; }
      .payment-details { border-collapse: collapse; width: 100%; margin-top: 16px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb; }
      .payment-details th { padding: 12px 14px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-bottom: 2px solid #e5e7eb; font-size: 12px; color: #1f2937; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; width: 40%; }
      .payment-details td { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #4b5563; background-color: #ffffff; word-break: break-word; }
      .payment-details tbody tr:last-child td { border-bottom: none; }
      .total-amount { font-weight: 700; color: #dc2626; font-size: 16px; }
      .entries-box { background: linear-gradient(135deg, #fff4f4 0%, #fff0f0 100%); border: 2px solid #dc2626; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
      .entries-label { font-size: 14px; font-weight: 600; color: #dc2626; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
      .entries-value { font-size: 28px; font-weight: 800; color: #dc2626; margin: 8px 0; }
      .cta-button { display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 32px; border-radius: 8px; text-align: center; margin: 12px 8px; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); transition: all 0.3s ease; text-transform: uppercase; letter-spacing: 0.5px; }
      .cta-button:hover { background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); box-shadow: 0 6px 16px rgba(220, 38, 38, 0.4); transform: translateY(-2px); }
      .cta-container { text-align: center; margin: 32px 0; }
      .footer { text-align: center; font-size: 12px; color: #6b7280; background-color: #f9fafb; padding: 24px 20px; border-top: 2px solid #e5e7eb; }
      .footer a { color: #6b7280; text-decoration: none; transition: color 0.2s; }
      .footer a:hover { color: #374151; }
      .support-email { font-weight: 700; color: #1f2937; }
      @media only screen and (max-width: 600px) {
        .content { padding: 20px; }
        .header h1 { font-size: 22px; }
        .section strong { display: block; margin-bottom: 8px; min-width: auto; }
        .card { border-radius: 0; }
        .payment-details { font-size: 11px; }
        .payment-details th, .payment-details td { padding: 10px 8px; }
        .entries-value { font-size: 24px; }
        .cta-button { display: block; margin: 8px 0; padding: 14px 24px; font-size: 14px; }
      }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <div class="header">
          <img src="https://toolsaustralia.com.au/images/Tools%20Australia%20Logo/White-Text%20Logo.png" alt="Tools Australia Logo" class="header-logo" />
          <h1>Invoice</h1>
          <p>Invoice #: PLACEHOLDER_INVOICE_NUMBER</p>
        </div>
        <div class="content">
          <div class="section"><strong>Invoice Date:</strong> PLACEHOLDER_INVOICE_DATE</div>
          <div class="divider"></div>
          <div class="section">
            <strong>Bill To:</strong>
            <div class="info-box" style="margin-top: 12px;">
              <div style="font-weight: 700; color: #1e293b; margin-bottom: 6px;">
                PLACEHOLDER_FULL_NAME
              </div>
              <div style="color: #475569; margin-bottom: 4px;">
                PLACEHOLDER_EMAIL
              </div>
              <div style="color: #475569;">
                PLACEHOLDER_PHONE
              </div>
            </div>
          </div>
          <div class="divider"></div>
          <div class="section">
            <strong>Order Summary:</strong>
            <table class="payment-details">
              <tbody>
                PLACEHOLDER_ITEMS_ROWS
                <tr>
                  <th>Total Amount</th>
                  <td class="total-amount">A$PLACEHOLDER_TOTAL_AMOUNT</td>
                </tr>
              </tbody>
            </table>
          </div>
          PLACEHOLDER_ENTRIES_BOX
          <div class="divider"></div>
          <div class="cta-container">
            <a href="https://toolsaustralia.com.au/my-account" class="cta-button">
              View My Account
            </a>
          </div>
        </div>
        <div class="footer">
          <p>Thank you for your purchase!</p>
          <p>For inquiries, contact <span class="support-email">support@toolsaustralia.com.au</span></p>
          <br />
          <a href="#">Unsubscribe</a>
        </div>
      </div>
    </div>
  </body>
</html>`;

  // Mock data for paid invoice (single item)
  const mockDataPaidSingle = {
    invoice_number: "INV-2025-001234",
    invoice_date: "January 15, 2025",
    items: [{ description: "Professional Membership", unit_price: "499.00" }],
    total_amount: "499.00",
    entries_gained: "500",
  };

  // Mock data for paid invoice (with upsell)
  const mockDataPaidWithUpsell = {
    invoice_number: "INV-2025-001236",
    invoice_date: "January 15, 2025",
    items: [
      { description: "Professional Membership", unit_price: "499.00" },
      { description: "Bonus Entry Pack", unit_price: "29.00" },
    ],
    total_amount: "528.00",
    entries_gained: "600",
  };

  const mockPersonPaid = {
    full_name: "John Smith",
    email: "john.smith@example.com",
    phone: "+61 400 123 456",
  };

  /**
   * Replace placeholders with mock data
   */
  const replacePlaceholders = (
    template: string,
    event: {
      invoice_number: string;
      invoice_date: string;
      items: Array<{ description: string; unit_price: string; quantity?: number }>;
      total_amount: string;
      entries_gained: string;
    },
    person: {
      full_name: string;
      email: string;
      phone: string;
    }
  ) => {
    // Generate items rows HTML
    const itemsRows = event.items
      .map(
        (item) => `
                <tr>
                  <th>Item</th>
                  <td>
                    ${item.description}
                    ${item.quantity && item.quantity > 1 ? `<span style="color: #64748b; font-size: 11px;">(Qty: ${item.quantity})</span>` : ""}
                  </td>
                </tr>
                <tr>
                  <th>Price</th>
                  <td>A$${item.unit_price}</td>
                </tr>`
      )
      .join("");

    // Generate entries box HTML if entries_gained exists
    const entriesBox = event.entries_gained
      ? `
          <div class="entries-box">
            <div class="entries-label">🎟️ Free Entries Earned</div>
            <div class="entries-value">${event.entries_gained}</div>
            <div style="font-size: 13px; color: #991b1b; margin-top: 8px; opacity: 0.9;">
              Entries have been added to your account
            </div>
          </div>`
      : "";

    return template
      .replace(/PLACEHOLDER_INVOICE_NUMBER/g, event.invoice_number)
      .replace(/PLACEHOLDER_INVOICE_DATE/g, event.invoice_date)
      .replace(/PLACEHOLDER_FULL_NAME/g, person.full_name)
      .replace(/PLACEHOLDER_EMAIL/g, person.email)
      .replace(/PLACEHOLDER_PHONE/g, person.phone)
      .replace(/PLACEHOLDER_ITEMS_ROWS/g, itemsRows)
      .replace(/PLACEHOLDER_TOTAL_AMOUNT/g, event.total_amount)
      .replace(/PLACEHOLDER_ENTRIES_BOX/g, entriesBox);
  };

  const htmlPaidSingle = replacePlaceholders(invoiceTemplate, mockDataPaidSingle, mockPersonPaid);
  const htmlPaidWithUpsell = replacePlaceholders(invoiceTemplate, mockDataPaidWithUpsell, mockPersonPaid);

  return (
    <div className="space-y-12">
      {/* Paid Invoice Preview (Single Item) */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">Paid Invoice - Single Item</h3>
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">Paid Status</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <iframe
            title="Paid Invoice Single Item Preview"
            srcDoc={htmlPaidSingle}
            className="h-[800px] w-full border-0"
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      {/* Paid Invoice Preview (With Upsell) */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">Paid Invoice - With Upsell</h3>
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
            Combined Items
          </span>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <iframe
            title="Paid Invoice With Upsell Preview"
            srcDoc={htmlPaidWithUpsell}
            className="h-[800px] w-full border-0"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
};

export default InvoicePreview;
