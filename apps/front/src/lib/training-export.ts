/** Small browser-only helpers for training JSON/CSV downloads and imports. */

export function exportDateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function downloadFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown): void {
  downloadFile(
    filename,
    JSON.stringify(data, null, 2),
    "application/json;charset=utf-8",
  );
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadCsv(
  filename: string,
  rows: (string | number | null | undefined)[][],
): void {
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadFile(filename, `\ufeff${content}`, "text/csv;charset=utf-8");
}

export async function readJsonFile(file: File): Promise<unknown> {
  return JSON.parse(await file.text()) as unknown;
}

export function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "training"
  );
}
