"use client";

import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useState, useEffect } from "react";
import { hasPixelConsent, revokePixelConsent } from "@/components/PixelTracker";

export default function TestPixelsPage() {
  const {
    trackEvent,
    trackPurchase,
    trackAddToCart,
    trackInitiateCheckout,
    trackViewContent,
    trackSearch,
    trackCompleteRegistration,
    trackLead,
    trackSubscribe,
    trackCustomEvent,
  } = usePixelTracking();

  const [testResults, setTestResults] = useState<string[]>([]);
  const [hasConsent, setHasConsent] = useState(true); // Always true in auto-accept mode
  const [buttonStates, setButtonStates] = useState<Record<string, "idle" | "loading" | "success" | "error">>({});
  const [pixelStatus, setPixelStatus] = useState<{
    facebook: boolean;
    tiktok: boolean;
  }>({ facebook: false, tiktok: false });

  // Check consent status and pixel loading on mount
  useEffect(() => {
    const consent = hasPixelConsent();
    setHasConsent(consent);

    // ✅ AUTO-ACCEPT MODE: No modal needed - consent is always granted
    console.log("📊 Auto-accept mode: Pixel consent automatically granted");

    // Check pixel loading status
    const checkPixelStatus = () => {
      setPixelStatus({
        facebook: typeof window !== "undefined" && typeof window.fbq === "function",
        tiktok: typeof window !== "undefined" && typeof window.ttq === "object",
      });
    };

    // Check immediately and after a delay
    checkPixelStatus();
    const timer = setTimeout(checkPixelStatus, 2000);

    return () => clearTimeout(timer);
  }, []);

  const addResult = (message: string) => {
    setTestResults((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const setButtonState = (buttonId: string, state: "idle" | "loading" | "success" | "error") => {
    setButtonStates((prev) => ({ ...prev, [buttonId]: state }));
  };

  const simulateAsyncOperation = async (buttonId: string, operation: () => void) => {
    setButtonState(buttonId, "loading");

    try {
      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 500));
      operation();
      setButtonState(buttonId, "success");

      // Reset to idle after 2 seconds
      setTimeout(() => setButtonState(buttonId, "idle"), 2000);
    } catch {
      setButtonState(buttonId, "error");
      setTimeout(() => setButtonState(buttonId, "idle"), 2000);
    }
  };

  // ✅ REMOVED: Consent handlers no longer needed in auto-accept mode

  const handleClearConsent = () => {
    // ✅ DISABLED: Cannot clear consent in auto-accept mode
    addResult("⚠️ Consent clearing disabled - auto-accept mode enabled");
  };

  const testPageView = () =>
    simulateAsyncOperation("pageView", () => {
      trackEvent("PageView", { test: true });
      addResult("✅ PageView event fired");
    });

  const testMiniDrawView = () =>
    simulateAsyncOperation("miniDrawView", () => {
      trackViewContent({
        value: 2500,
        currency: "AUD",
        productId: "test-mini-draw-1",
        content_category: "mini_draw",
        content_type: "mini_draw",
      });
      addResult("✅ Mini Draw View event fired");
    });

  const testTicketAddToCart = () =>
    simulateAsyncOperation("ticketAddToCart", () => {
      trackAddToCart({
        value: 45,
        currency: "AUD",
        productId: "test-mini-draw-1",
        content_category: "mini_draw_tickets",
        content_type: "ticket",
        num_items: 3,
      });
      addResult("✅ Ticket Add to Cart event fired");
    });

  const testMembershipPurchase = () =>
    simulateAsyncOperation("membershipPurchase", () => {
      trackSubscribe({
        value: 40,
        currency: "AUD",
        subscription_type: "membership",
        package_name: "Foreman",
        package_type: "subscription",
      });
      addResult("✅ Membership Subscription event fired");
    });

  const testTicketPurchase = () =>
    simulateAsyncOperation("ticketPurchase", () => {
      trackPurchase({
        value: 45,
        currency: "AUD",
        orderId: "test-order-123",
        content_type: "ticket",
        content_ids: ["test-mini-draw-1"],
        num_items: 3,
      });
      addResult("✅ Ticket Purchase event fired");
    });

  const testMajorDrawEntry = () =>
    simulateAsyncOperation("majorDrawEntry", () => {
      trackCustomEvent("MajorDrawEntryAdded", {
        major_draw_id: "test-major-draw-1",
        major_draw_name: "Test Major Draw",
        entries_added: 15,
        entry_source: "membership",
        currency: "AUD",
        content_type: "major_draw_entry",
      });
      addResult("✅ Major Draw Entry event fired");
    });

  const testUpsellPurchase = () =>
    simulateAsyncOperation("upsellPurchase", () => {
      trackPurchase({
        value: 25,
        currency: "AUD",
        orderId: "upsell-test-123",
        content_type: "upsell_package",
        upsell_id: "test-upsell-1",
        upsell_title: "Test Upsell Package",
        entries_added: 5,
      });
      addResult("✅ Upsell Purchase event fired");
    });

  const testUserRegistration = () =>
    simulateAsyncOperation("userRegistration", () => {
      trackCompleteRegistration({
        method: "email",
        platform: "tools-australia",
        user_type: "tool_enthusiast",
      });
      addResult("✅ User Registration event fired");
    });

  const testContactForm = () =>
    simulateAsyncOperation("contactForm", () => {
      trackLead({
        value: 0,
        currency: "AUD",
        lead_source: "contact_form",
        platform: "tools-australia",
      });
      addResult("✅ Contact Form Lead event fired");
    });

  const testSearch = () =>
    simulateAsyncOperation("search", () => {
      trackSearch("DeWalt drill");
      addResult("✅ Search event fired");
    });

  const testCheckoutInitiation = () =>
    simulateAsyncOperation("checkoutInitiation", () => {
      trackInitiateCheckout({
        value: 45,
        currency: "AUD",
        numItems: 3,
        content_type: "ticket",
      });
      addResult("✅ Checkout Initiation event fired");
    });

  const clearResults = () => {
    setTestResults([]);
  };

  const getButtonClass = (buttonId: string, baseClass: string) => {
    const state = buttonStates[buttonId] || "idle";
    const stateClasses = {
      idle: "",
      loading: "opacity-75 cursor-not-allowed",
      success: "bg-green-600 hover:bg-green-700",
      error: "bg-red-600 hover:bg-red-700",
    };
    return `${baseClass} ${stateClasses[state]} transition-all duration-200`;
  };

  const getButtonContent = (buttonId: string, defaultText: string) => {
    const state = buttonStates[buttonId] || "idle";
    switch (state) {
      case "loading":
        return (
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Loading...</span>
          </div>
        );
      case "success":
        return "✅ Success!";
      case "error":
        return "❌ Error";
      default:
        return defaultText;
    }
  };

  return (
    <div className="min-h-screen-svh bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Pixel Integration Test Page</h1>

        {/* Auto-Accept Status Banner */}
        <div className="bg-green-50 border border-green-200 rounded-lg shadow-md p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <div>
                <h3 className="font-semibold text-green-800">Pixel Tracking: Auto-Enabled</h3>
                <p className="text-sm text-green-600">
                  ✅ All users automatically consent to pixel tracking - no popup required
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleClearConsent}
                className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                disabled
                title="Disabled in auto-accept mode"
              >
                Clear Consent (Disabled)
              </button>
            </div>
          </div>
        </div>

        {/* Pixel Status Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-800 mb-3">Pixel Loading Status:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${pixelStatus.facebook ? "bg-green-500" : "bg-red-500"}`}></div>
              <div>
                <h4 className="font-medium text-blue-800">Facebook Pixel</h4>
                <p className="text-sm text-blue-600">
                  {pixelStatus.facebook ? "✅ Loaded and ready" : "❌ Not loaded"}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${pixelStatus.tiktok ? "bg-green-500" : "bg-red-500"}`}></div>
              <div>
                <h4 className="font-medium text-blue-800">TikTok Pixel</h4>
                <p className="text-sm text-blue-600">{pixelStatus.tiktok ? "✅ Loaded and ready" : "❌ Not loaded"}</p>
              </div>
            </div>
          </div>
          <div className="mt-3 p-3 bg-blue-100 rounded text-sm text-blue-700">
            <strong>💡 Tip:</strong> Open browser console (F12) to see detailed pixel event logs when you click test
            buttons.
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Test Instructions:</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Open browser Developer Tools (F12)</li>
            <li>Go to Network tab and refresh page</li>
            <li>Look for Facebook and TikTok pixel requests</li>
            <li>Click the test buttons below (now with loading states!)</li>
            <li>Check Events Manager for real-time events</li>
            <li>Use Facebook Pixel Helper extension for validation</li>
          </ol>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <button
            onClick={testPageView}
            disabled={buttonStates.pageView === "loading"}
            className={getButtonClass(
              "pageView",
              "bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            )}
          >
            {getButtonContent("pageView", "Test Page View")}
          </button>

          <button
            onClick={testMiniDrawView}
            disabled={buttonStates.miniDrawView === "loading"}
            className={getButtonClass(
              "miniDrawView",
              "bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
            )}
          >
            {getButtonContent("miniDrawView", "Test Mini Draw View")}
          </button>

          <button
            onClick={testTicketAddToCart}
            disabled={buttonStates.ticketAddToCart === "loading"}
            className={getButtonClass(
              "ticketAddToCart",
              "bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 disabled:opacity-50"
            )}
          >
            {getButtonContent("ticketAddToCart", "Test Add Tickets to Cart")}
          </button>

          <button
            onClick={testMembershipPurchase}
            disabled={buttonStates.membershipPurchase === "loading"}
            className={getButtonClass(
              "membershipPurchase",
              "bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
            )}
          >
            {getButtonContent("membershipPurchase", "Test Membership Purchase")}
          </button>

          <button
            onClick={testTicketPurchase}
            disabled={buttonStates.ticketPurchase === "loading"}
            className={getButtonClass(
              "ticketPurchase",
              "bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
            )}
          >
            {getButtonContent("ticketPurchase", "Test Ticket Purchase")}
          </button>

          <button
            onClick={testMajorDrawEntry}
            disabled={buttonStates.majorDrawEntry === "loading"}
            className={getButtonClass(
              "majorDrawEntry",
              "bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
            )}
          >
            {getButtonContent("majorDrawEntry", "Test Major Draw Entry")}
          </button>

          <button
            onClick={testUpsellPurchase}
            disabled={buttonStates.upsellPurchase === "loading"}
            className={getButtonClass(
              "upsellPurchase",
              "bg-pink-600 text-white px-4 py-2 rounded hover:bg-pink-700 disabled:opacity-50"
            )}
          >
            {getButtonContent("upsellPurchase", "Test Upsell Purchase")}
          </button>

          <button
            onClick={testUserRegistration}
            disabled={buttonStates.userRegistration === "loading"}
            className={getButtonClass(
              "userRegistration",
              "bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700 disabled:opacity-50"
            )}
          >
            {getButtonContent("userRegistration", "Test User Registration")}
          </button>

          <button
            onClick={testContactForm}
            disabled={buttonStates.contactForm === "loading"}
            className={getButtonClass(
              "contactForm",
              "bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
            )}
          >
            {getButtonContent("contactForm", "Test Contact Form")}
          </button>

          <button
            onClick={testSearch}
            disabled={buttonStates.search === "loading"}
            className={getButtonClass(
              "search",
              "bg-cyan-600 text-white px-4 py-2 rounded hover:bg-cyan-700 disabled:opacity-50"
            )}
          >
            {getButtonContent("search", "Test Search")}
          </button>

          <button
            onClick={testCheckoutInitiation}
            disabled={buttonStates.checkoutInitiation === "loading"}
            className={getButtonClass(
              "checkoutInitiation",
              "bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 disabled:opacity-50"
            )}
          >
            {getButtonContent("checkoutInitiation", "Test Checkout Initiation")}
          </button>

          <button onClick={clearResults} className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
            Clear Results
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Test Results:</h2>
          <div className="bg-gray-100 rounded p-4 max-h-96 overflow-y-auto">
            {testResults.length === 0 ? (
              <p className="text-gray-500">No tests run yet. Click the buttons above to test pixel events.</p>
            ) : (
              <div className="space-y-1">
                {testResults.map((result, index) => (
                  <div key={index} className="text-sm font-mono text-gray-800">
                    {result}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-semibold text-yellow-800 mb-2">🔍 How to Verify Events:</h3>
          <ul className="text-yellow-700 space-y-1 text-sm">
            <li>
              <strong>Facebook:</strong> Go to Events Manager → Test Events tab
            </li>
            <li>
              <strong>TikTok:</strong> Go to Ads Manager → Events → Test Events
            </li>
            <li>
              <strong>Browser:</strong> Check Network tab for pixel requests
            </li>
            <li>
              <strong>Console:</strong> Look for pixel loading confirmations
            </li>
          </ul>
        </div>

        {/* Pixel Consent Modal - REMOVED: Auto-accept mode enabled */}
      </div>
    </div>
  );
}
