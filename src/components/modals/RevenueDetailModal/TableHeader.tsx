"use client";

import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export type SortKey = "name" | "amount" | "count" | "date";
export type SortOrder = "asc" | "desc";

interface TableHeaderProps {
  sortBy: SortKey;
  sortOrder: SortOrder;
  onSort: (key: SortKey) => void;
}

const TableHeader: React.FC<TableHeaderProps> = ({ sortBy, sortOrder, onSort }) => {
  return (
    <div className="hidden lg:grid lg:grid-cols-12 gap-4 p-4 bg-gray-50 dark:bg-neutral-800/80 rounded-lg border border-gray-200 dark:border-neutral-700 mb-4 text-sm font-semibold text-gray-700 dark:text-neutral-200">
      <div
        className="col-span-3 cursor-pointer hover:text-gray-900 dark:hover:text-neutral-100 flex items-center gap-1"
        onClick={() => onSort("name")}
      >
        Name
        {sortBy === "name" && (sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
      </div>
      <div className="col-span-3">Email</div>
      <div
        className="col-span-1 cursor-pointer hover:text-gray-900 dark:hover:text-neutral-100 flex items-center justify-end gap-1"
        onClick={() => onSort("count")}
      >
        Purchases
        {sortBy === "count" && (sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
      </div>
      <div
        className="col-span-2 cursor-pointer hover:text-gray-900 dark:hover:text-neutral-100 flex items-center justify-end gap-1"
        onClick={() => onSort("amount")}
      >
        Total
        {sortBy === "amount" && (sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
      </div>
      <div
        className="col-span-2 cursor-pointer hover:text-gray-900 dark:hover:text-neutral-100 flex items-center gap-1"
        onClick={() => onSort("date")}
      >
        First Purchase
        {sortBy === "date" && (sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
      </div>
      <div className="col-span-1 text-center">View user</div>
    </div>
  );
};

export default TableHeader;
