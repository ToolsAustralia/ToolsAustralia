export interface CsvImportResult {
  userIds: string[];
  invalidRows: Array<{ row: number; value: string; reason: string }>;
}

function normalizeValue(value: string): string {
  return value.trim().replace(/^"|"$/g, "");
}

export class CsvImportService {
  static parseUserIdentifiers(csvText: string): CsvImportResult {
    const lines = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const invalidRows: Array<{ row: number; value: string; reason: string }> = [];
    const userIds = new Set<string>();

    lines.forEach((line, idx) => {
      const [firstColumn = ""] = line.split(",");
      const value = normalizeValue(firstColumn);

      if (!value) {
        invalidRows.push({ row: idx + 1, value: line, reason: "Empty identifier" });
        return;
      }

      userIds.add(value);
    });

    return {
      userIds: Array.from(userIds),
      invalidRows,
    };
  }
}
