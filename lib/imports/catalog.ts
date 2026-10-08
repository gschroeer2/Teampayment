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
export { hashBytes, validateXlsxArchive } from "./table-file";
import { readTableFile } from "./table-file";
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
  const data = await readTableFile(file);
  if (data.sheets.length) return { ...data, pdfRows: [] };
  const pdfRows = pdfCatalogLines(
    data.pdfPages.flatMap((page) =>
      page.map((row) => row.parts.map((p) => p.text).join(" ")),
    ),
  );
  if (!pdfRows.length)
    throw new Error(
      "Kein Katalogtext mit Eurobeträgen erkannt. Gescanntes PDF bitte als XLSX oder PDF mit auswählbarem Text bereitstellen.",
    );
  return { ...data, pdfRows };
}
