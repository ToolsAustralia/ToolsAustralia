"use client";

import React from "react";
import { CheckCircle, Trophy, User } from "lucide-react";
import { formatDisplayName } from "@/utils/display-name";
import type { UserSearchResult } from "./types";

const STATE_NAMES: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

const formatState = (state?: string) => (state ? STATE_NAMES[state] || state : "Not specified");

const formatDate = (date: Date | string) =>
  new Date(date).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });

interface WinnerPickerProps {
  selectedUser: UserSearchResult | null;
  onOpenSearch: () => void;
}

const WinnerPicker: React.FC<WinnerPickerProps> = ({ selectedUser, onOpenSearch }) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">Select Winner *</label>
      {selectedUser ? (
        <div className="p-4 border-2 border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/25 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-semibold">
                {selectedUser.firstName.charAt(0)}
                {selectedUser.lastName.charAt(0)}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-neutral-100">
                  {formatDisplayName(selectedUser.firstName, selectedUser.lastName)}
                </h3>
                <p className="text-sm text-gray-600 dark:text-neutral-400">{selectedUser.email}</p>
                {selectedUser.mobile && <p className="text-sm text-gray-600 dark:text-neutral-400">{selectedUser.mobile}</p>}
                {selectedUser.state && (
                  <p className="text-sm text-gray-600 dark:text-neutral-400">{formatState(selectedUser.state)}</p>
                )}
                <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1">Joined {formatDate(selectedUser.createdAt)}</p>
              </div>
            </div>
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
          </div>

          {selectedUser.currentDrawEntries && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Current Draw Entries</span>
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Total: <span className="font-semibold">{selectedUser.currentDrawEntries.totalEntries}</span>
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenSearch}
            className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
          >
            Change Winner
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenSearch}
          className="w-full p-4 border-2 border-dashed border-gray-300 dark:border-neutral-600 rounded-lg hover:border-gray-400 dark:hover:border-neutral-500 hover:bg-gray-50 dark:hover:bg-neutral-800/60 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <User className="w-6 h-6 text-gray-400 dark:text-neutral-500" />
            <div>
              <p className="font-medium text-gray-900 dark:text-neutral-100">Click to search and select winner</p>
              <p className="text-sm text-gray-500 dark:text-neutral-400">Search by name, email, mobile, or user ID</p>
            </div>
          </div>
        </button>
      )}
    </div>
  );
};

export default WinnerPicker;
