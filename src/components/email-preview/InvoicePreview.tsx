"use client";

import React from "react";

/**
 * Invoice Preview Component
 *
 * Displays a preview of the Klaviyo invoice email template with mock data
 * for development purposes. Shows both paid and pending payment states.
 */
const InvoicePreview: React.FC = () => {
  // Embedded invoice template HTML (matches InvoiceEmailTemplate.html)
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
      .section strong { display: inline-block; min-width: 140px; color: #111; }
      .divider { border-top: 1px solid #e6e6e6; margin: 24px 0; }
      .info-box { background-color: #fafbfc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.8; }
      .invoice-summary { border-collapse: collapse; width: 100%; margin-top: 10px; border-radius: 8px; overflow: hidden; }
      .invoice-summary th { padding: 14px 12px; background-color: #f8fafc; border-bottom: 2px solid #e5e7eb; font-size: 14px; color: #1f2937; font-weight: 600; }
      .invoice-summary td { padding: 14px 12px; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #4b5563; }
      .invoice-summary tbody tr:hover { background-color: #fafbfc; }
      .invoice-summary tfoot td { font-weight: bold; color: #111827; background-color: #f9fafb; border-top: 2px solid #e5e7eb; }
      .footer { text-align: center; font-size: 12px; color: #6b7280; background-color: #f9fafb; padding: 24px 20px; border-top: 2px solid #e5e7eb; }
      .footer a { color: #6b7280; text-decoration: none; transition: color 0.2s; }
      .footer a:hover { color: #374151; }
      @media only screen and (max-width: 600px) {
        .content { padding: 20px; }
        .header h1 { font-size: 22px; }
        .section strong { display: block; margin-bottom: 3px; }
        .card { border-radius: 0; }
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
          <div class="section"><strong>Date:</strong> PLACEHOLDER_INVOICE_DATE</div>
          <div class="divider"></div>
          <div class="section">
            <strong>Bill To:</strong>
            <div class="info-box">
              PLACEHOLDER_FULL_NAME<br />
              PLACEHOLDER_EMAIL<br />
              PLACEHOLDER_PHONE
            </div>
          </div>
          <div class="divider"></div>
          <div class="section">
            <strong>Order Summary:</strong>
            <table class="invoice-summary">
              <thead>
                <tr>
                  <th width="70%" align="left">Item</th>
                  <th width="30%" align="right">Price</th>
                </tr>
              </thead>
              <tbody>
                PLACEHOLDER_ITEMS_ROWS
              </tbody>
              <tfoot>
                <tr>
                  <td width="70%" align="right"><strong>Total</strong></td>
                  <td width="30%" align="right"><strong>$PLACEHOLDER_TOTAL_AMOUNT</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style="margin: 32px 0;"></div>
          <div class="info-box" style="background: linear-gradient(135deg, #fff4f4 0%, #fff0f0 100%); border: 2px solid #dc2626; border-radius: 12px; color: #dc2626; font-size: 24px; text-align: center; font-weight: 900; padding: 24px 20px; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.15); text-transform: uppercase; letter-spacing: 0.5px;">
            🎟️ PLACEHOLDER_ENTRIES_GAINED Free Entries Earned!
          </div>
          <div style="margin: 32px 0;"></div>
          <div class="section">
            <strong>Payment Status:</strong><br />
            PLACEHOLDER_PAYMENT_STATUS
            <div style="font-size: 12px; color: #666; margin-top: 8px">
              Transaction ID: PLACEHOLDER_PAYMENT_INTENT_ID
            </div>
          </div>
        </div>
        <div class="footer">
          <p>Thank you for your purchase!</p>
          <p>For inquiries, contact <strong>hello@toolsaustralia.com.au</strong></p>
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
    payment_status: '<span style="color: green; font-weight: bold">✅ Paid</span>',
    payment_intent_id: "pi_3Qkz8j2eZvKYlo2C1xyz4567",
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
    payment_status: '<span style="color: green; font-weight: bold">✅ Paid</span>',
    payment_intent_id: "pi_3Qkz8j2eZvKYlo2C1xyz4568",
  };

  const mockPersonPaid = {
    full_name: "John Smith",
    email: "john.smith@example.com",
    phone: "+61 400 123 456",
  };

  // Mock data for pending invoice
  const mockDataPending = {
    invoice_number: "INV-2025-001235",
    invoice_date: "January 15, 2025",
    items: [{ description: "Basic Membership", unit_price: "49.90" }],
    total_amount: "49.90",
    entries_gained: "100",
    payment_status: '<span style="color: #cc0000; font-weight: bold">⏳ Pending</span>',
    payment_intent_id: "pi_3Qkz8j2eZvKYlo2C1xyz7890",
  };

  const mockPersonPending = {
    full_name: "Sarah Johnson",
    email: "sarah.johnson@example.com",
    phone: "+61 400 789 012",
  };

  /**
   * Replace placeholders with mock data
   */
  const replacePlaceholders = (
    template: string,
    event: {
      invoice_number: string;
      invoice_date: string;
      items: Array<{ description: string; unit_price: string }>;
      total_amount: string;
      entries_gained: string;
      payment_status: string;
      payment_intent_id: string;
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
                  <td width="70%">${item.description}</td>
                  <td width="30%" align="right">$${item.unit_price}</td>
                </tr>`
      )
      .join("");

    return template
      .replace(/PLACEHOLDER_INVOICE_NUMBER/g, event.invoice_number)
      .replace(/PLACEHOLDER_INVOICE_DATE/g, event.invoice_date)
      .replace(/PLACEHOLDER_FULL_NAME/g, person.full_name)
      .replace(/PLACEHOLDER_EMAIL/g, person.email)
      .replace(/PLACEHOLDER_PHONE/g, person.phone)
      .replace(/PLACEHOLDER_ITEMS_ROWS/g, itemsRows)
      .replace(/PLACEHOLDER_TOTAL_AMOUNT/g, event.total_amount)
      .replace(/PLACEHOLDER_ENTRIES_GAINED/g, event.entries_gained)
      .replace(/PLACEHOLDER_PAYMENT_STATUS/g, event.payment_status)
      .replace(/PLACEHOLDER_PAYMENT_INTENT_ID/g, event.payment_intent_id);
  };

  const htmlPaidSingle = replacePlaceholders(invoiceTemplate, mockDataPaidSingle, mockPersonPaid);
  const htmlPaidWithUpsell = replacePlaceholders(invoiceTemplate, mockDataPaidWithUpsell, mockPersonPaid);
  const htmlPending = replacePlaceholders(invoiceTemplate, mockDataPending, mockPersonPending);

  return (
    <div className="space-y-12">
      {/* Paid Invoice Preview (Single Item) */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-800">Paid Invoice - Single Item</h3>
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
          <h3 className="text-xl font-bold text-gray-800">Paid Invoice - With Upsell</h3>
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

      {/* Pending Invoice Preview */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-800">Pending Invoice</h3>
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-800">
            Pending Status
          </span>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <iframe
            title="Pending Invoice Preview"
            srcDoc={htmlPending}
            className="h-[800px] w-full border-0"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
};

export default InvoicePreview;
