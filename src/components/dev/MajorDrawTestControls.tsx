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

import React, { useState, useEffect } from "react";
import { Beaker, ChevronDown, ChevronUp, ArrowLeft, RotateCcw } from "lucide-react";

interface DrawPair {
  currentDrawId: string;
  nextDrawId: string;
  currentDrawName: string;
  nextDrawName: string;
}

export default function MajorDrawTestControls() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string>("");
  const [currentScenario, setCurrentScenario] = useState<number | null>(null);
  const [scenarioHistory, setScenarioHistory] = useState<Array<{ scenario: number; drawPair: DrawPair }>>([]);
  const [currentDrawPair, setCurrentDrawPair] = useState<DrawPair | null>(null);

  // Only show in development
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  // Load current scenario and draw pair from localStorage on mount
  useEffect(() => {
    const savedScenario = localStorage.getItem("dev-current-scenario");
    const savedDrawPair = localStorage.getItem("dev-current-draw-pair");
    const savedHistory = localStorage.getItem("dev-scenario-history");
    
    if (savedScenario) {
      const scenario = parseInt(savedScenario);
      if (scenario >= 1 && scenario <= 4) {
        setCurrentScenario(scenario);
      }
    }
    
    if (savedDrawPair) {
      try {
        const drawPair = JSON.parse(savedDrawPair);
        setCurrentDrawPair(drawPair);
      } catch (e) {
        console.error("Failed to parse saved draw pair", e);
      }
    }
    
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory);
        setScenarioHistory(history);
      } catch (e) {
        console.error("Failed to parse saved history", e);
      }
    }
  }, []);

  const runTestScenario = async (scenario: number, useStoredDraws = false) => {
    setIsLoading(true);
    setLastResult("");

    try {
      // Build URL with optional draw IDs for restoration
      let url = `/api/dev/run-test-scenario?scenario=${scenario}`;
      
      if (useStoredDraws && currentDrawPair) {
        url += `&currentDrawId=${currentDrawPair.currentDrawId}&nextDrawId=${currentDrawPair.nextDrawId}`;
      }

      const response = await fetch(url, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        setLastResult(`✅ Scenario ${scenario} loaded successfully!`);
        setCurrentScenario(scenario);
        
        // Extract draw IDs from response
        const newDrawPair: DrawPair = {
          currentDrawId: data.draws.current.id,
          nextDrawId: data.draws.next.id,
          currentDrawName: data.draws.current.name,
          nextDrawName: data.draws.next.name,
        };
        
        setCurrentDrawPair(newDrawPair);
        
        // Save to localStorage
        localStorage.setItem("dev-current-scenario", scenario.toString());
        localStorage.setItem("dev-current-draw-pair", JSON.stringify(newDrawPair));
        
        // Add to history (keep last 10)
        setScenarioHistory((prev) => {
          const newHistory = [...prev, { scenario, drawPair: newDrawPair }];
          const trimmed = newHistory.slice(-10);
          localStorage.setItem("dev-scenario-history", JSON.stringify(trimmed));
          return trimmed;
        });
        
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

  const goToPreviousScenario = () => {
    if (scenarioHistory.length > 1) {
      // Get the second-to-last entry (previous one)
      const previousEntry = scenarioHistory[scenarioHistory.length - 2];
      
      // Restore the draw pair from history
      setCurrentDrawPair(previousEntry.drawPair);
      localStorage.setItem("dev-current-draw-pair", JSON.stringify(previousEntry.drawPair));
      
      // Run the previous scenario with the stored draw IDs
      runTestScenario(previousEntry.scenario, true);
    } else if (currentScenario && currentScenario > 1) {
      // If no history, just go back one scenario number with stored draws
      runTestScenario(currentScenario - 1, true);
    } else {
      // Default to scenario 1 (will auto-detect draws)
      runTestScenario(1, false);
    }
  };

  const resetToTest1 = () => {
    // Reset to Test 1 with stored draws if available, otherwise auto-detect
    runTestScenario(1, currentDrawPair !== null);
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

            {/* Current Draw Pair Info */}
            {currentDrawPair && (
              <div className="mb-3 text-xs text-gray-400 bg-gray-800/50 rounded-lg p-2 space-y-1">
                <div>Current: {currentDrawPair.currentDrawName}</div>
                <div>Next: {currentDrawPair.nextDrawName}</div>
              </div>
            )}

            {/* Current Scenario Indicator */}
            {currentScenario && (
              <div className="mb-3 text-xs text-gray-400 bg-gray-800/50 rounded-lg p-2">
                Scenario: Test {currentScenario}
              </div>
            )}

            {/* Last Result */}
            {lastResult && <div className="mb-3 text-xs text-gray-300 bg-gray-800 rounded-lg p-2">{lastResult}</div>}

            {/* Navigation Buttons */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={goToPreviousScenario}
                disabled={isLoading || scenarioHistory.length < 2}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/50 disabled:cursor-not-allowed text-white rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200"
                title="Go back to previous scenario with same draws"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <button
                onClick={resetToTest1}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/50 disabled:cursor-not-allowed text-white rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200"
                title="Reset to Test 1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Test 1
              </button>
            </div>

            {/* Test Scenarios */}
            <div className="space-y-2">
              {/* Test 1 */}
              <button
                onClick={() => runTestScenario(1, currentDrawPair !== null)}
                disabled={isLoading}
                className={`w-full text-left bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-700 disabled:to-gray-800 text-white rounded-xl p-3 transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed ${
                  currentScenario === 1 ? "ring-2 ring-green-400 ring-offset-2 ring-offset-gray-900" : ""
                }`}
              >
                <div className="font-semibold text-sm mb-1">Test 1: Active Draw</div>
                <div className="text-xs text-white/80">Ends in 60 mins, freeze in 30 mins</div>
              </button>

              {/* Test 2 */}
              <button
                onClick={() => runTestScenario(2, currentDrawPair !== null)}
                disabled={isLoading}
                className={`w-full text-left bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-700 disabled:to-gray-800 text-white rounded-xl p-3 transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed ${
                  currentScenario === 2 ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900" : ""
                }`}
              >
                <div className="font-semibold text-sm mb-1">Test 2: Frozen Draw</div>
                <div className="text-xs text-white/80">Frozen, ends in 30 mins</div>
              </button>

              {/* Test 3 */}
              <button
                onClick={() => runTestScenario(3, currentDrawPair !== null)}
                disabled={isLoading}
                className={`w-full text-left bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 disabled:from-gray-700 disabled:to-gray-800 text-white rounded-xl p-3 transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed ${
                  currentScenario === 3 ? "ring-2 ring-orange-400 ring-offset-2 ring-offset-gray-900" : ""
                }`}
              >
                <div className="font-semibold text-sm mb-1">Test 3: Gap Period</div>
                <div className="text-xs text-white/80">Just ended, 4-hour gap</div>
              </button>

              {/* Test 4 */}
              <button
                onClick={() => runTestScenario(4, currentDrawPair !== null)}
                disabled={isLoading}
                className={`w-full text-left bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-gray-700 disabled:to-gray-800 text-white rounded-xl p-3 transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed ${
                  currentScenario === 4 ? "ring-2 ring-purple-400 ring-offset-2 ring-offset-gray-900" : ""
                }`}
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
