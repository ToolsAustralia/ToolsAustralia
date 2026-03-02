/**
 * User Export Formats Service
 * 
 * Service handling different export formats:
 * - CSV generation using csv-stringify
 * - Excel generation using exceljs
 * - Column width optimization
 * - Styling for Excel files
 */

import { stringify } from "csv-stringify/sync";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import type { TransformedUserData } from "./userExportTransformation";
import { getDisplayName } from "./userExportFields";

/**
 * Generate CSV file from transformed user data
 * 
 * @param data - Array of transformed user data objects
 * @param selectedFields - Array of field keys in order
 * @param filename - Base filename (without extension)
 * @returns NextResponse with CSV file
 */
export function generateCSVResponse(
  data: TransformedUserData[],
  selectedFields: string[],
  filename: string
): NextResponse {
  // Generate headers from field display names
  const headers = selectedFields.map((fieldKey) => getDisplayName(fieldKey));

  // Convert data to CSV rows
  const csvData = data.map((row) => selectedFields.map((fieldKey) => row[fieldKey] ?? ""));

  // Generate CSV string
  const csv = stringify([headers, ...csvData], {
    quoted: true,
    quoted_empty: true,
  });

  // Return CSV response with proper headers
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Generate Excel file from transformed user data
 * 
 * @param data - Array of transformed user data objects
 * @param selectedFields - Array of field keys in order
 * @param filename - Base filename (without extension)
 * @returns Promise resolving to NextResponse with Excel file
 */
export async function generateExcelResponse(
  data: TransformedUserData[],
  selectedFields: string[],
  filename: string
): Promise<NextResponse> {
  // Create workbook and worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Users Export");

  // Set column definitions with optimal widths
  worksheet.columns = selectedFields.map((fieldKey) => {
    const displayName = getDisplayName(fieldKey);
    // Calculate max width based on all values in this column
    const maxValueLength = Math.max(
      displayName.length,
      ...data.map((row) => String(row[fieldKey] ?? "").length),
      10 // Minimum width
    );
    return {
      header: displayName,
      key: fieldKey,
      width: maxValueLength * 1.2 + 2, // Add padding
    };
  });

  // Style the header row
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9D9D9" }, // Light gray background
  };
  worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  worksheet.getRow(1).border = {
    bottom: { style: "thin" },
    top: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  };

  // Add data rows
  data.forEach((row) => {
    const worksheetRow = worksheet.addRow(row);
    
    // Set cell alignment based on data type
    worksheetRow.eachCell((cell, colNumber) => {
      const fieldKey = selectedFields[colNumber - 1];
      const value = row[fieldKey];
      
      // Align numbers and currency to the right
      if (typeof value === "string" && (value.startsWith("$") || /^\d+(\.\d+)?$/.test(value))) {
        cell.alignment = { horizontal: "right" };
      } else if (typeof value === "number") {
        cell.alignment = { horizontal: "right" };
      } else {
        cell.alignment = { horizontal: "left" };
      }
      
      // Add borders to all cells
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9D9D9" } },
        bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
        left: { style: "thin", color: { argb: "FFD9D9D9" } },
        right: { style: "thin", color: { argb: "FFD9D9D9" } },
      };
    });
  });

  // Freeze header row
  worksheet.views = [
    {
      state: "frozen",
      ySplit: 1, // Freeze first row
    },
  ];

  // Add summary information at the bottom
  const summaryRowNum = data.length + 3;
  worksheet.getCell(`A${summaryRowNum}`).value = "Total Users:";
  worksheet.getCell(`A${summaryRowNum}`).font = { bold: true };
  worksheet.getCell(`B${summaryRowNum}`).value = data.length;

  worksheet.getCell(`A${summaryRowNum + 1}`).value = "Exported At:";
  worksheet.getCell(`A${summaryRowNum + 1}`).font = { bold: true };
  worksheet.getCell(`B${summaryRowNum + 1}`).value = new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
  });

  // Generate Excel buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // Return Excel response with proper headers
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Cache-Control": "no-cache",
    },
  });
}

