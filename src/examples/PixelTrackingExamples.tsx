"use client";

import { useEffect, useState } from "react";
import { usePixelTracking } from "@/hooks/usePixelTracking";

/**
 * Example 1: Mini Draw View Tracking
 * This shows how to track when a user views a mini draw page
 */
export function MiniDrawViewExample({
  miniDrawId,
  prizeName,
  prizeValue,
  currency = "AUD",
}: {
  miniDrawId: string;
  prizeName: string;
  prizeValue: number;
  currency?: string;
}) {
  const { trackViewContent } = usePixelTracking();

  useEffect(() => {
    // Track mini draw view when component mounts
    trackViewContent({
      value: prizeValue,
      currency,
      productId: miniDrawId,
      content_category: "mini_draw",
      content_type: "mini_draw",
    });
  }, [miniDrawId, prizeValue, currency, trackViewContent]);

  return (
    <div>
      <h1>Mini Draw Page</h1>
      <p>Prize: {prizeName}</p>
      <p>
        Value: {currency} {prizeValue}
      </p>
      <p>Draw ID: {miniDrawId}</p>
    </div>
  );
}

/**
 * Example 2: Mini Draw Ticket Add to Cart Tracking
 * This shows how to track when a user adds mini draw tickets to cart
 */
export function MiniDrawTicketAddToCartExample({
  miniDrawId,
  ticketPrice,
  quantity,
  currency = "AUD",
}: {
  miniDrawId: string;
  ticketPrice: number;
  quantity: number;
  currency?: string;
}) {
  const { trackAddToCart } = usePixelTracking();

  const handleAddTicketsToCart = () => {
    // Track add to cart event for mini draw tickets
    trackAddToCart({
      value: ticketPrice * quantity,
      currency,
      productId: miniDrawId,
      content_category: "mini_draw_tickets",
      content_type: "ticket",
      num_items: quantity,
    });

    console.log("Adding mini draw tickets to cart:", miniDrawId, quantity);
  };

  return (
    <button onClick={handleAddTicketsToCart} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
      Add {quantity} Ticket{quantity > 1 ? "s" : ""} to Cart
    </button>
  );
}

/**
 * Example 3: Mini Draw Ticket Purchase Success Tracking
 * This shows how to track completed mini draw ticket purchases
 */
export function MiniDrawTicketPurchaseSuccessExample({
  orderId,
  totalAmount,
  currency = "AUD",
  tickets,
}: {
  orderId: string;
  totalAmount: number;
  currency?: string;
  tickets: Array<{ miniDrawId: string; quantity: number; price: number }>;
}) {
  const { trackPurchase } = usePixelTracking();

  useEffect(() => {
    // Track purchase when component mounts (success page)
    trackPurchase({
      value: totalAmount,
      currency,
      orderId,
      content_type: "ticket",
      content_ids: tickets.map((ticket) => ticket.miniDrawId),
      num_items: tickets.reduce((sum, ticket) => sum + ticket.quantity, 0),
    });
  }, [orderId, totalAmount, currency, tickets, trackPurchase]);

  return (
    <div className="text-center p-8">
      <h1 className="text-2xl font-bold text-green-600 mb-4">Ticket Purchase Successful!</h1>
      <p>Order ID: {orderId}</p>
      <p>
        Total: {currency} {totalAmount}
      </p>
      <p>Total Tickets: {tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)}</p>
    </div>
  );
}

/**
 * Example 4: Ticket/Product Checkout Initiation Tracking
 * This shows how to track when a user starts checkout for tickets or products
 */
export function TicketCheckoutInitiationExample({
  cartValue,
  itemCount,
  currency = "AUD",
  cartType = "mixed",
}: {
  cartValue: number;
  itemCount: number;
  currency?: string;
  cartType?: "tickets" | "products" | "mixed";
}) {
  const { trackInitiateCheckout } = usePixelTracking();

  const handleCheckout = () => {
    // Track checkout initiation for tickets/products
    trackInitiateCheckout({
      value: cartValue,
      currency,
      numItems: itemCount,
      content_type: cartType === "tickets" ? "ticket" : cartType === "products" ? "product" : "mixed",
    });

    console.log("Starting checkout process for:", cartType);
  };

  return (
    <button onClick={handleCheckout} className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700">
      Proceed to Checkout ({currency} {cartValue})
    </button>
  );
}

/**
 * Example 6: Tools Australia User Registration Tracking
 * This shows how to track user registration for the tools platform
 */
export function ToolsAustraliaRegistrationExample({ registrationMethod = "email" }: { registrationMethod?: string }) {
  const { trackCompleteRegistration } = usePixelTracking();

  useEffect(() => {
    // Track registration completion for Tools Australia
    trackCompleteRegistration({
      method: registrationMethod,
      platform: "tools-australia",
      user_type: "tool_enthusiast",
    });
  }, [registrationMethod, trackCompleteRegistration]);

  return (
    <div className="text-center p-8">
      <h1 className="text-2xl font-bold text-green-600 mb-4">Welcome to Tools Australia!</h1>
      <p>Your account has been created successfully</p>
    </div>
  );
}

/**
 * Example 5: Tools Australia Contact Form Tracking
 * This shows how to track contact form submissions
 */
export function ToolsAustraliaContactExample() {
  const { trackLead } = usePixelTracking();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Track lead generation for Tools Australia
    trackLead({
      value: 0,
      currency: "AUD",
      lead_source: "contact_form",
      platform: "tools-australia",
    });

    console.log("Tools Australia contact form submitted");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <input type="text" placeholder="Your Name" className="w-full px-3 py-2 border rounded" required />
      </div>
      <div>
        <input type="email" placeholder="Your Email" className="w-full px-3 py-2 border rounded" required />
      </div>
      <div>
        <textarea placeholder="Your Message" className="w-full px-3 py-2 border rounded" rows={4} required />
      </div>
      <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
        Send Message
      </button>
    </form>
  );
}

/**
 * Example 5: Tools Australia Membership Package Tracking
 * This shows how to track membership package subscriptions (Tradie, Foreman, Boss)
 */
export function ToolsAustraliaMembershipExample({
  packageName,
  packagePrice,
  packageType,
}: {
  packageName: "Tradie" | "Foreman" | "Boss";
  packagePrice: number;
  packageType: "subscription" | "one-time";
}) {
  const { trackSubscribe, trackPurchase } = usePixelTracking();

  const handleMembershipPurchase = () => {
    if (packageType === "subscription") {
      // Track subscription membership
      trackSubscribe({
        value: packagePrice,
        currency: "AUD",
        subscription_type: "membership",
        package_name: packageName,
        package_type: packageType,
      });
    } else {
      // Track one-time package purchase
      trackPurchase({
        value: packagePrice,
        currency: "AUD",
        content_type: "membership_package",
        package_name: packageName,
        package_type: packageType,
      });
    }

    console.log(`Purchasing ${packageName} ${packageType} package`);
  };

  return (
    <button
      onClick={handleMembershipPurchase}
      className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
    >
      {packageType === "subscription" ? "Subscribe to" : "Purchase"} {packageName} - ${packagePrice}
      {packageType === "subscription" ? "/month" : ""}
    </button>
  );
}

/**
 * Example 6: Major Draw Entry Tracking
 * This shows how to track when users gain entries to major draws through membership packages
 */
export function MajorDrawEntryTrackingExample({
  majorDrawId,
  majorDrawName,
  entriesAdded,
  source,
}: {
  majorDrawId: string;
  majorDrawName: string;
  entriesAdded: number;
  source: "membership" | "one-time-package" | "upsell" | "mini-draw";
}) {
  const { trackCustomEvent } = usePixelTracking();

  const handleEntryAdded = () => {
    // Track major draw entry addition
    trackCustomEvent("MajorDrawEntryAdded", {
      major_draw_id: majorDrawId,
      major_draw_name: majorDrawName,
      entries_added: entriesAdded,
      entry_source: source,
      currency: "AUD",
      content_type: "major_draw_entry",
    });

    console.log(`Added ${entriesAdded} entries to ${majorDrawName} from ${source}`);
  };

  return (
    <button onClick={handleEntryAdded} className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700">
      Add {entriesAdded} Entries to {majorDrawName}
    </button>
  );
}

/**
 * Example 8: Tools Australia Partner Discount Tracking
 * This shows how to track when users access partner discounts for tools
 */
export function ToolsAustraliaPartnerDiscountExample({
  partnerName,
  discountPercent,
  productCategory,
}: {
  partnerName: string;
  discountPercent: number;
  productCategory: string;
}) {
  const { trackCustomEvent } = usePixelTracking();

  const handleAccessDiscount = () => {
    // Track partner discount access
    trackCustomEvent("AccessPartnerDiscount", {
      partner_name: partnerName,
      discount_percent: discountPercent,
      product_category: productCategory,
      content_type: "partner_discount",
      currency: "AUD",
    });

    console.log(`Accessing ${partnerName} discount for ${productCategory}`);
  };

  return (
    <button onClick={handleAccessDiscount} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
      Access {partnerName} Discount ({discountPercent}% off {productCategory})
    </button>
  );
}

/**
 * Example 9: Tools Australia Search Tracking
 * This shows how to track tool searches
 */
export function ToolsAustraliaSearchExample() {
  const { trackSearch } = usePixelTracking();
  const [searchQuery, setSearchQuery] = useState("");

  const handleToolSearch = (e: React.FormEvent) => {
    e.preventDefault();

    if (searchQuery.trim()) {
      // Track tool search
      trackSearch(searchQuery.trim());

      console.log("Searching for tools:", searchQuery);
    }
  };

  return (
    <form onSubmit={handleToolSearch} className="flex gap-2">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search for tools..."
        className="flex-1 px-3 py-2 border rounded"
      />
      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
        Search Tools
      </button>
    </form>
  );
}

/**
 * Example 7: Upsell Package Purchase Tracking
 * This shows how to track upsell package purchases
 */
export function UpsellPackagePurchaseExample({
  upsellId,
  upsellTitle,
  entriesAdded,
  price,
}: {
  upsellId: string;
  upsellTitle: string;
  entriesAdded: number;
  price: number;
}) {
  const { trackPurchase } = usePixelTracking();

  const handleUpsellPurchase = () => {
    // Track upsell package purchase
    trackPurchase({
      value: price,
      currency: "AUD",
      orderId: `upsell-${upsellId}`,
      content_type: "upsell_package",
      upsell_id: upsellId,
      upsell_title: upsellTitle,
      entries_added: entriesAdded,
    });

    console.log(`Purchasing upsell: ${upsellTitle}`);
  };

  return (
    <button onClick={handleUpsellPurchase} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
      Buy {upsellTitle} - ${price} ({entriesAdded} entries)
    </button>
  );
}
