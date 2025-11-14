/**
 * Invoice Component for Klaviyo Email Templates
 *
 * This component generates a professional invoice that can be used in Klaviyo email templates.
 * It's designed to be email-client compatible and responsive.
 *
 * @module components/invoice/InvoiceComponent
 */

import React from "react";

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface InvoiceData {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  package_type: string;
  package_id: string;
  package_name: string;
  package_tier?: string;
  total_amount: number;
  payment_intent_id: string;
  billing_reason?: string;
  items: string; // JSON string from Klaviyo
  payment_status: string;
  created_at: string;
}

interface CustomerData {
  email: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
}

interface InvoiceComponentProps {
  invoiceData: InvoiceData;
  customerData: CustomerData;
  companyData?: {
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    logo?: string;
  };
}

/**
 * Main Invoice Component
 * Renders a complete invoice with header, customer info, items, and totals
 */
export const InvoiceComponent: React.FC<InvoiceComponentProps> = ({
  invoiceData,
  customerData,
  companyData = {
    name: "Tools Australia",
    address: "Australia",
    phone: "+61 2 1234 5678",
    email: "hello@toolsaustralia.com.au",
    website: "www.toolsaustralia.com.au",
    logo: "/images/logo.png",
  },
}) => {
  // Parse items from JSON string
  const items: InvoiceItem[] = JSON.parse(invoiceData.items || "[]");

  // Format currency (AUD)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
    }).format(amount / 100); // Convert cents to dollars
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div style={styles.container}>
      {/* Invoice Header */}
      <InvoiceHeader
        invoiceNumber={invoiceData.invoice_number}
        invoiceDate={formatDate(invoiceData.invoice_date)}
        companyData={companyData}
      />

      {/* Customer Information */}
      <InvoiceCustomer customerData={customerData} />

      {/* Invoice Items */}
      <InvoiceItems items={items} packageType={invoiceData.package_type} packageTier={invoiceData.package_tier} />

      {/* Invoice Totals */}
      <InvoiceTotals totalAmount={invoiceData.total_amount} formatCurrency={formatCurrency} />

      {/* Payment Status */}
      <InvoicePaymentStatus
        paymentStatus={invoiceData.payment_status}
        paymentIntentId={invoiceData.payment_intent_id}
      />

      {/* Invoice Footer */}
      <InvoiceFooter companyData={companyData} />
    </div>
  );
};

/**
 * Invoice Header Component
 * Contains company logo, name, and invoice details
 */
const InvoiceHeader: React.FC<{
  invoiceNumber: string;
  invoiceDate: string;
  companyData: {
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    logo?: string;
  };
}> = ({ invoiceNumber, invoiceDate, companyData }) => (
  <div style={styles.header}>
    <div style={styles.headerLeft}>
      <h1 style={styles.companyName}>{companyData.name}</h1>
      <div style={styles.companyDetails}>
        <p style={styles.companyDetail}>{companyData.address}</p>
        <p style={styles.companyDetail}>Phone: {companyData.phone}</p>
        <p style={styles.companyDetail}>Email: {companyData.email}</p>
        <p style={styles.companyDetail}>Web: {companyData.website}</p>
      </div>
    </div>
    <div style={styles.headerRight}>
      <h2 style={styles.invoiceTitle}>INVOICE</h2>
      <div style={styles.invoiceDetails}>
        <p style={styles.invoiceDetail}>
          <strong>Invoice #:</strong> {invoiceNumber}
        </p>
        <p style={styles.invoiceDetail}>
          <strong>Date:</strong> {invoiceDate}
        </p>
      </div>
    </div>
  </div>
);

/**
 * Customer Information Component
 */
const InvoiceCustomer: React.FC<{ customerData: CustomerData }> = ({ customerData }) => (
  <div style={styles.customerSection}>
    <h3 style={styles.sectionTitle}>Bill To:</h3>
    <div style={styles.customerInfo}>
      <p style={styles.customerName}>
        {customerData.first_name} {customerData.last_name}
      </p>
      <p style={styles.customerDetail}>{customerData.email}</p>
      {customerData.phone_number && <p style={styles.customerDetail}>{customerData.phone_number}</p>}
    </div>
  </div>
);

/**
 * Invoice Items Component
 */
const InvoiceItems: React.FC<{
  items: InvoiceItem[];
  packageType: string;
  packageTier?: string;
}> = ({ items, packageType, packageTier }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
    }).format(amount / 100);
  };

  return (
    <div style={styles.itemsSection}>
      <h3 style={styles.sectionTitle}>Invoice Details</h3>
      <table style={styles.itemsTable}>
        <thead>
          <tr style={styles.tableHeader}>
            <th style={styles.tableHeaderCell}>Description</th>
            <th style={styles.tableHeaderCell}>Quantity</th>
            <th style={styles.tableHeaderCell}>Unit Price</th>
            <th style={styles.tableHeaderCell}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} style={styles.tableRow}>
              <td style={styles.tableCell}>
                <div>
                  <div style={styles.itemDescription}>{item.description}</div>
                  {packageTier && <div style={styles.itemTier}>Tier: {packageTier}</div>}
                  <div style={styles.itemType}>Type: {packageType}</div>
                </div>
              </td>
              <td style={styles.tableCell}>{item.quantity}</td>
              <td style={styles.tableCell}>{formatCurrency(item.unit_price)}</td>
              <td style={styles.tableCell}>{formatCurrency(item.total_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Invoice Totals Component
 */
const InvoiceTotals: React.FC<{
  totalAmount: number;
  formatCurrency: (amount: number) => string;
}> = ({ totalAmount, formatCurrency }) => (
  <div style={styles.totalsSection}>
    <div style={styles.totalsContainer}>
      <div style={styles.totalRow}>
        <span style={styles.totalLabel}>Subtotal:</span>
        <span style={styles.totalAmount}>{formatCurrency(totalAmount)}</span>
      </div>
      <div style={styles.totalRow}>
        <span style={styles.totalLabel}>Tax (GST):</span>
        <span style={styles.totalAmount}>$0.00</span>
      </div>
      <div style={styles.totalRowFinal}>
        <span style={styles.totalLabelFinal}>Total:</span>
        <span style={styles.totalAmountFinal}>{formatCurrency(totalAmount)}</span>
      </div>
    </div>
  </div>
);

/**
 * Payment Status Component
 */
const InvoicePaymentStatus: React.FC<{
  paymentStatus: string;
  paymentIntentId: string;
}> = ({ paymentStatus, paymentIntentId }) => (
  <div style={styles.paymentSection}>
    <div style={styles.paymentStatus}>
      <span style={styles.paymentStatusLabel}>Payment Status:</span>
      <span style={styles.paymentStatusValue}>{paymentStatus === "paid" ? "✅ Paid" : "⏳ Pending"}</span>
    </div>
    <div style={styles.paymentId}>
      <span style={styles.paymentIdLabel}>Transaction ID:</span>
      <span style={styles.paymentIdValue}>{paymentIntentId}</span>
    </div>
  </div>
);

/**
 * Invoice Footer Component
 */
const InvoiceFooter: React.FC<{
  companyData: {
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    logo?: string;
  };
}> = ({ companyData }) => (
  <div style={styles.footer}>
    <div style={styles.footerContent}>
      <p style={styles.footerText}>
        Thank you for your business! If you have any questions about this invoice, please contact us at{" "}
        {companyData.email} or call {companyData.phone}.
      </p>
      <p style={styles.footerText}>This invoice was generated automatically. No further action is required.</p>
    </div>
  </div>
);

/**
 * Styles for email compatibility
 * Using inline styles for maximum email client support
 */
const styles = {
  container: {
    maxWidth: "800px",
    margin: "0 auto",
    fontFamily: "Arial, sans-serif",
    backgroundColor: "#ffffff",
    color: "#333333",
    lineHeight: "1.6",
  },

  // Header Styles
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "20px",
    borderBottom: "2px solid #e0e0e0",
    marginBottom: "20px",
  },
  headerLeft: {
    flex: "1",
  },
  headerRight: {
    textAlign: "right" as const,
  },
  companyName: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#ee0000",
    margin: "0 0 10px 0",
  },
  companyDetails: {
    margin: "0",
  },
  companyDetail: {
    margin: "2px 0",
    fontSize: "14px",
    color: "#666666",
  },
  invoiceTitle: {
    fontSize: "28px",
    fontWeight: "bold",
    color: "#ee0000",
    margin: "0 0 10px 0",
  },
  invoiceDetails: {
    margin: "0",
  },
  invoiceDetail: {
    margin: "2px 0",
    fontSize: "14px",
  },

  // Customer Section
  customerSection: {
    padding: "0 20px",
    marginBottom: "20px",
  },
  sectionTitle: {
    fontSize: "16px",
    fontWeight: "bold",
    color: "#171717",
    margin: "0 0 10px 0",
  },
  customerInfo: {
    backgroundColor: "#f8f9fa",
    padding: "15px",
    borderRadius: "5px",
  },
  customerName: {
    fontSize: "16px",
    fontWeight: "bold",
    margin: "0 0 5px 0",
  },
  customerDetail: {
    margin: "2px 0",
    fontSize: "14px",
    color: "#666666",
  },

  // Items Section
  itemsSection: {
    padding: "0 20px",
    marginBottom: "20px",
  },
  itemsTable: {
    width: "100%",
    borderCollapse: "collapse" as const,
    marginTop: "10px",
  },
  tableHeader: {
    backgroundColor: "#ee0000",
    color: "#ffffff",
  },
  tableHeaderCell: {
    padding: "12px",
    textAlign: "left" as const,
    fontSize: "14px",
    fontWeight: "bold",
    border: "1px solid #ee0000",
  },
  tableRow: {
    backgroundColor: "#ffffff",
  },
  tableCell: {
    padding: "12px",
    fontSize: "14px",
    border: "1px solid #e0e0e0",
    verticalAlign: "top" as const,
  },
  itemDescription: {
    fontWeight: "bold",
    marginBottom: "5px",
  },
  itemTier: {
    fontSize: "12px",
    color: "#7f8c8d",
    marginBottom: "2px",
  },
  itemType: {
    fontSize: "12px",
    color: "#7f8c8d",
  },

  // Totals Section
  totalsSection: {
    padding: "0 20px",
    marginBottom: "20px",
  },
  totalsContainer: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-end",
    maxWidth: "300px",
    marginLeft: "auto",
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    padding: "8px 0",
    borderBottom: "1px solid #e0e0e0",
  },
  totalRowFinal: {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    padding: "12px 0",
    borderTop: "2px solid #ee0000",
    borderBottom: "2px solid #ee0000",
    marginTop: "5px",
  },
  totalLabel: {
    fontSize: "14px",
    color: "#666666",
  },
  totalLabelFinal: {
    fontSize: "16px",
    fontWeight: "bold",
    color: "#171717",
  },
  totalAmount: {
    fontSize: "14px",
    fontWeight: "bold",
  },
  totalAmountFinal: {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#ee0000",
  },

  // Payment Section
  paymentSection: {
    padding: "15px 20px",
    marginBottom: "20px",
    backgroundColor: "#f8f9fa",
    borderRadius: "5px",
  },
  paymentStatus: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "10px",
  },
  paymentStatusLabel: {
    fontSize: "14px",
    fontWeight: "bold",
  },
  paymentStatusValue: {
    fontSize: "14px",
    color: "#059669",
    fontWeight: "bold",
  },
  paymentId: {
    display: "flex",
    justifyContent: "space-between",
  },
  paymentIdLabel: {
    fontSize: "12px",
    color: "#666666",
  },
  paymentIdValue: {
    fontSize: "12px",
    fontFamily: "monospace",
    color: "#666666",
  },

  // Footer
  footer: {
    padding: "20px",
    borderTop: "2px solid #e0e0e0",
    marginTop: "20px",
    backgroundColor: "#f8f9fa",
  },
  footerContent: {
    textAlign: "center" as const,
  },
  footerText: {
    fontSize: "12px",
    color: "#666666",
    margin: "5px 0",
  },
};

export default InvoiceComponent;
