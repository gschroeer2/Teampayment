/** Spreadsheet-safe, UTF-8 CSV with German separator. */
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^\s*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function makeCsv(rows: unknown[][]) {
  return "\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}
export function downloadFile(
  name: string,
  content: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
