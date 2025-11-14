/**
 * Major Draw Test Controls (Development Only)
 *
 * Floating button that allows switching between test scenarios:
 * 1. Draw ending in 60 minutes (Active)
 * 2. Draw ending in 30 minutes (Frozen)
 * 3. Draw just ended (Gap Period)
 * 4. Next draw active (Post-Gap)
 */

"use client";

import React, { useState } from "react";
import { Beaker, ChevronDown, ChevronUp } from "lucide-react";

export default function MajorDrawTestControls() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string>("");

  // Only show in development
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const runTestScenario = async (scenario: number) => {
    setIsLoading(true);
    setLastResult("");

    try {
      const response = await fetch(`/api/dev/run-test-scenario?scenario=${scenario}`, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        setLastResult(`✅ Scenario ${scenario} loaded successfully!`);
        // Refresh the page to show updated data
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setLastResult(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setLastResult(`❌ Failed to load scenario ${scenario}`);
      console.error("Test scenario error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999]">
      {/* Floating Button */}
      <div className="flex flex-col items-end gap-3">
        {/* Expanded Menu */}
        {isOpen && (
          <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 p-4 w-80 animate-in slide-in-from-bottom-5 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <Beaker className="w-5 h-5 text-blue-400" />
                <h3 className="text-white font-bold text-sm">Major Draw Tests</h3>
              </div>
              <span className="text-xs text-gray-400">Dev Only</span>
            </div>

            {/* Last Result */}
            {lastResult && <div className="mb-3 text-xs text-gray-300 bg-gray-800 rounded-lg p-2">{lastResult}</div>}

            {/* Test Scenarios */}
            <div className="space-y-2">
              {/* Test 1 */}
              <button
                onClick={() => runTestScenario(1)}
                disabled={isLoading}
                className="w-full text-left bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-700 disabled:to-gray-800 text-white rounded-xl p-3 transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed"
              >
                <div className="font-semibold text-sm mb-1">Test 1: Active Draw</div>
                <div className="text-xs text-white/80">Ends in 60 mins, freeze in 30 mins</div>
              </button>

              {/* Test 2 */}
              <button
                onClick={() => runTestScenario(2)}
                disabled={isLoading}
                className="w-full text-left bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-700 disabled:to-gray-800 text-white rounded-xl p-3 transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed"
              >
                <div className="font-semibold text-sm mb-1">Test 2: Frozen Draw</div>
                <div className="text-xs text-white/80">Frozen, ends in 30 mins</div>
              </button>

              {/* Test 3 */}
              <button
                onClick={() => runTestScenario(3)}
                disabled={isLoading}
                className="w-full text-left bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 disabled:from-gray-700 disabled:to-gray-800 text-white rounded-xl p-3 transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed"
              >
                <div className="font-semibold text-sm mb-1">Test 3: Gap Period</div>
                <div className="text-xs text-white/80">Just ended, 4-hour gap</div>
              </button>

              {/* Test 4 */}
              <button
                onClick={() => runTestScenario(4)}
                disabled={isLoading}
                className="w-full text-left bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-gray-700 disabled:to-gray-800 text-white rounded-xl p-3 transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed"
              >
                <div className="font-semibold text-sm mb-1">Test 4: Next Active</div>
                <div className="text-xs text-white/80">Gap ended, next draw active</div>
              </button>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="mt-3 flex items-center justify-center gap-2 text-gray-400 text-xs">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                <span>Loading scenario...</span>
              </div>
            )}
          </div>
        )}

        {/* Toggle Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="bg-gray-900 hover:bg-gray-800 text-white rounded-full p-4 shadow-2xl border border-gray-700 transition-all duration-200 hover:scale-110 flex items-center gap-2"
          title="Major Draw Test Controls"
        >
          <Beaker className="w-6 h-6 text-blue-400" />
          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
        </button>
      </div>
    </div>
  );
}
