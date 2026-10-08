import { parseEuros } from "../ledger";
export interface CatalogDraft {
  name: string;
  price: string;
  description: string;
  aliases: string;
  selected: boolean;
  id?: string;
}
export interface CatalogSheet {
  name: string;
  rows: string[][];
}
export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(hash)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
/** Check ZIP central directory before the XML parser allocates decompressed buffers. */
export function validateXlsxArchive(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50)
    throw new Error("Keine gültige XLSX-Datei.");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("Ungültiges XLSX-Archiv.");
  const entries = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true),
    total = 0;
  if (
    entries > 1000 ||
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0
  )
    throw new Error("XLSX-Archiv ist zu groß oder nicht unterstützt.");
  for (let i = 0; i < entries; i++) {
    if (
      offset + 46 > bytes.length ||
      view.getUint32(offset, true) !== 0x02014b50
    )
      throw new Error("Ungültiges XLSX-Verzeichnis.");
    const size = view.getUint32(offset + 24, true);
    total += size;
    if (
      size === 0xffffffff ||
      total > 20_000_000 ||
      view.getUint16(offset + 8, true) & 1
    )
      throw new Error("XLSX ist verschlüsselt oder entpackt größer als 20 MB.");
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
}
export function catalogRows(
  rows: string[][],
  columns: {
    name: number;
    price: number;
    description: number;
    aliases: number;
  },
  start: number,
): CatalogDraft[] {
  return rows
    .slice(start)
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => ({
      name: r[columns.name]?.trim() ?? "",
      price: r[columns.price]?.trim() ?? "",
      description: r[columns.description]?.trim() ?? "",
      aliases: r[columns.aliases]?.trim() ?? "",
      selected: true,
    }));
}
export function catalogAmount(price: string, unit: "euro" | "cent") {
  if (unit === "euro") return parseEuros(price.replace(/Euro/gi, ""));
  if (!/^\d{1,9}$/.test(price.trim()))
    throw new Error("Centbetrag muss eine ganze positive Zahl sein.");
  const amount = Number(price);
  if (amount < 1 || amount > 100_000_000)
    throw new Error("Centbetrag außerhalb des erlaubten Bereichs.");
  return amount;
}
export function pdfCatalogLines(lines: string[]): CatalogDraft[] {
  return lines.flatMap((line) => {
    const amounts = [
      ...line.matchAll(/(\d{1,7}(?:[,.]\d{1,2})?)\s*(?:€|EUR\b|Euro\b)/gi),
    ];
    if (!amounts.length) return [];
    const amount = amounts[0];
    return [
      {
        name: line
          .slice(0, amount.index)
          .replace(/^\s*\d+[.)]\s*/, "")
          .trim(),
        price: amounts.length === 1 ? amount[1] : "",
        description: line.slice(amount.index! + amount[0].length).trim(),
        aliases: "",
        selected: amounts.length === 1,
      },
    ];
  });
}
export async function readCatalogFile(
  file: File,
): Promise<{ hash: string; sheets: CatalogSheet[]; pdfRows: CatalogDraft[] }> {
  if (file.size > 5_000_000)
    throw new Error("Katalogdatei überschreitet 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await hashBytes(bytes);
  if (/\.xlsx$/i.test(file.name)) {
    if (
      file.type &&
      ![
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/octet-stream",
      ].includes(file.type)
    )
      throw new Error("Dateityp passt nicht zu XLSX.");
    validateXlsxArchive(bytes);
    const { default: read } = await import("read-excel-file/browser");
    const sheets = await read(file);
    if (
      sheets.length > 20 ||
      sheets.some(
        (s) => s.data.length > 2000 || s.data.some((r) => r.length > 50),
      )
    )
      throw new Error(
        "Maximal 20 Tabellenblätter, 2000 Zeilen und 50 Spalten erlaubt.",
      );
    return {
      hash,
      pdfRows: [],
      sheets: sheets.map((s) => ({
        name: s.sheet,
        rows: s.data.map((r) => r.map((v) => (v === null ? "" : String(v)))),
      })),
    };
  }
  if (
    !/\.pdf$/i.test(file.name) ||
    (file.type &&
      !["application/pdf", "application/octet-stream"].includes(file.type)) ||
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  )
    throw new Error(
      "Bitte eine echte PDF- oder XLSX-Datei auswählen. Alte XLS-Dateien bitte als XLSX speichern.",
    );
  const pdf = await import("pdfjs-dist");
  pdf.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdf.getDocument({
    data: bytes,
    useWorkerFetch: false,
  });
  try {
    const doc = await task.promise;
    if (doc.numPages > 20)
      throw new Error("PDF darf maximal 20 Seiten enthalten.");
    const lines: string[] = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      const rows: Array<{
        y: number;
        parts: Array<{ x: number; text: string }>;
      }> = [];
      for (const item of content.items)
        if ("str" in item) {
          const y = item.transform[5],
            x = item.transform[4];
          let row = rows.find((r) => Math.abs(r.y - y) < 3);
          if (!row) {
            row = { y, parts: [] };
            rows.push(row);
          }
          row.parts.push({ x, text: item.str });
        }
      lines.push(
        ...rows
          .sort((a, b) => b.y - a.y)
          .map((r) =>
            r.parts
              .sort((a, b) => a.x - b.x)
              .map((p) => p.text)
              .join(" "),
          ),
      );
      if (lines.length > 2000)
        throw new Error("PDF enthält zu viele Textzeilen.");
    }
    const pdfRows = pdfCatalogLines(lines);
    if (!pdfRows.length)
      throw new Error(
        "Kein Katalogtext mit Eurobeträgen erkannt. Gescanntes PDF bitte als XLSX oder PDF mit auswählbarem Text bereitstellen.",
      );
    return { hash, sheets: [], pdfRows };
  } finally {
    await task.destroy();
  }
}
