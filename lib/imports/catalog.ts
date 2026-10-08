import { parseEuros } from "../ledger";
import { catalogEntrySchema, commandSchema } from "../commands";
import type { PenaltyType } from "../types";
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
  if (unit === "euro") {
    let value = price
      .trim()
      .replace(/^(?:€|EUR\b|Euro\b)\s*/i, "")
      .replace(/\s*(?:€|EUR|Euro)$/i, "")
      .trim();
    // German thousands separators only with an explicit decimal comma; never guess "1.000".
    if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(value))
      value = value.replace(/\./g, "");
    return parseEuros(value);
  }
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

/** Resolve edited names against the current catalogue, then validate each selected row. */
export function catalogImportCommand(
  drafts: CatalogDraft[],
  types: PenaltyType[],
  fileHash: string,
  unit: "euro" | "cent",
) {
  const rows = [];
  const names = new Set<string>();
  for (const [index, draft] of drafts.entries()) {
    if (!draft.selected) continue;
    const name = draft.name.trim(),
      key = name.toLocaleLowerCase("de-DE");
    const prefix = `Zeile ${index + 1} (${name || "ohne Kategoriename"}): `;
    if (names.has(key))
      throw new Error(
        prefix +
          "Doppelter Kategoriename in der Auswahl. Nur eine Zeile auswählen oder den Namen korrigieren.",
      );
    names.add(key);
    const existing = types.find(
      (t) => t.name.trim().toLocaleLowerCase("de-DE") === key,
    );
    let amountCents: number;
    try {
      amountCents = catalogAmount(draft.price, unit);
    } catch (e) {
      throw new Error(
        prefix + (e instanceof Error ? e.message : "Betrag prüfen."),
        { cause: e },
      );
    }
    const entry = {
      ...(existing ? { id: existing.id } : {}),
      name,
      description: draft.description.trim(),
      aliases: draft.aliases
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      amountCents,
      active: existing?.active ?? true,
    };
    const parsed = catalogEntrySchema.safeParse(entry);
    if (!parsed.success) {
      const hints: Record<string, string> = {
        name: "Kategoriename muss 2–100 Zeichen lang sein.",
        description: "Beschreibung darf höchstens 500 Zeichen enthalten.",
        aliases:
          "Erkennungsbegriffe müssen jeweils 2–100 Zeichen lang sein, höchstens 30 Begriffe.",
        amountCents: "Betrag muss zwischen 0,01 und 1.000.000 Euro liegen.",
        id: "Kategorie-Zuordnung ungültig. Datei erneut einlesen.",
      };
      throw new Error(
        prefix +
          [
            ...new Set(
              parsed.error.issues.map(
                (issue) => hints[String(issue.path[0])] ?? "Eingaben prüfen.",
              ),
            ),
          ].join(" "),
      );
    }
    rows.push(parsed.data);
  }
  if (!rows.length)
    throw new Error(
      "Keine Kategorien ausgewählt. Bitte mindestens eine Zeile zur Übernahme auswählen.",
    );
  return commandSchema.parse({ type: "importPenaltyCatalog", fileHash, rows });
}
