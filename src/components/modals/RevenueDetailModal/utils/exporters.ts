/**
 * CSV / Excel export helpers for RevenueDetailModal.
 *
 * Pure functions: take revenue user rows + a category label, build the
 * file payload, and trigger a browser download via a synthesized
 * <a download> click. No React, no hooks, no business logic.
 */

import { format } from "date-fns";
import { formatDisplayName } from "@/utils/display-name";
import type { RevenueDetailUser } from "@/hooks/queries/useAdminQueries";

const HEADERS = [
  "Name",
  "Email",
  "Mobile",
  "Purchase Count",
  "Total Contributed",
  "First Purchase",
  "Last Purchase",
];

const escapeCSVCell = (val: string) => `"${String(val).replace(/"/g, '""')}"`;

interface UserRow {
  name: string;
  email: string;
  mobile: string;
  purchaseCount: string;
  totalContributed: string;
  firstPurchase: string;
  lastPurchase: string;
}

const buildRow = (user: RevenueDetailUser): UserRow => {
  const purchases = [...user.purchases].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const firstPurchase = purchases[0]?.timestamp
    ? format(new Date(purchases[0].timestamp), "yyyy-MM-dd HH:mm")
    : "";
  const lastPurchase = purchases[purchases.length - 1]?.timestamp
    ? format(new Date(purchases[purchases.length - 1].timestamp), "yyyy-MM-dd HH:mm")
    : "";

  return {
    name: formatDisplayName(user.userInfo.firstName, user.userInfo.lastName),
    email: user.userInfo.email,
    mobile: user.userInfo.mobile || "",
    purchaseCount: user.purchaseCount.toString(),
    totalContributed: user.totalContributed.toFixed(2),
    firstPurchase,
    lastPurchase,
  };
};

const triggerDownload = (blob: Blob, filename: string) => {
  if (typeof document === "undefined") return;
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportRevenueDetailsCSV = (
  users: RevenueDetailUser[],
  categoryLabel: string
): void => {
  // Create CSV content (UTF-8 BOM for Excel/Windows compatibility)
  const BOM = "﻿";
  const rows = users.map((user) => {
    const r = buildRow(user);
    return [
      escapeCSVCell(r.name),
      escapeCSVCell(r.email),
      escapeCSVCell(r.mobile),
      escapeCSVCell(r.purchaseCount),
      escapeCSVCell(r.totalContributed),
      escapeCSVCell(r.firstPurchase),
      escapeCSVCell(r.lastPurchase),
    ];
  });

  const csvContent = BOM + [HEADERS.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${categoryLabel}-details-${format(new Date(), "yyyy-MM-dd")}.csv`);
};

export const exportRevenueDetailsExcel = (
  users: RevenueDetailUser[],
  categoryLabel: string
): void => {
  // Excel-compatible CSV (tab-separated values with UTF-8 BOM for Excel)
  const rows = users.map((user) => {
    const r = buildRow(user);
    return [
      r.name,
      r.email,
      r.mobile,
      r.purchaseCount,
      r.totalContributed,
      r.firstPurchase,
      r.lastPurchase,
    ];
  });

  // Excel-compatible format: UTF-8 BOM + tab-separated values + CRLF
  const BOM = "﻿";
  const excelContent = BOM + [HEADERS.join("\t"), ...rows.map((row) => row.join("\t"))].join("\r\n");
  const blob = new Blob([excelContent], { type: "application/vnd.ms-excel;charset=utf-8;" });
  triggerDownload(blob, `${categoryLabel}-details-${format(new Date(), "yyyy-MM-dd")}.xls`);
};
