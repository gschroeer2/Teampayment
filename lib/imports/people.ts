import type { PersonCategory, Player } from "../types";
import { readTableFile, type PdfRow } from "./table-file";
export interface PeopleColumns {
  firstName: number;
  lastName: number;
  category: number;
}
export interface PersonDraft {
  firstName: string;
  lastName: string;
  category: PersonCategory | "";
  selected: boolean;
  id?: string;
}
export const personNameKey = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
export function parsePersonCategory(value: string): PersonCategory | "" {
  const key = value.trim().toLocaleLowerCase("de-DE");
  return (
    (
      {
        spieler: "player",
        trainer: "coach",
        betreuer: "staff",
        staff: "staff",
      } as Record<string, PersonCategory>
    )[key] ?? ""
  );
}
export function peopleColumns(titles: string[]): PeopleColumns {
  const find = (re: RegExp, fallback: number) => {
    const i = titles.findIndex((s) => re.test(s.trim()));
    return i < 0 ? fallback : i;
  };
  return {
    firstName: find(/^vorname$/i, 0),
    lastName: find(/^(nachname|familienname)$/i, 1),
    category: find(/^kategorie$/i, 2),
  };
}
export function peopleRows(
  rows: string[][],
  columns: PeopleColumns,
  start: number,
): PersonDraft[] {
  if (
    new Set(Object.values(columns)).size !== 3 ||
    Object.values(columns).some((i) => i < 0)
  )
    throw new Error("Bitte drei unterschiedliche Spalten zuordnen.");
  const data = rows.slice(start).filter((r) => r.some((v) => v.trim()));
  if (data.length > 200)
    throw new Error("Maximal 200 Personen pro Datei. Bitte Liste aufteilen.");
  return data.map((r) => ({
    firstName: r[columns.firstName]?.trim() ?? "",
    lastName: r[columns.lastName]?.trim() ?? "",
    category: parsePersonCategory(r[columns.category] ?? ""),
    selected: true,
  }));
}
export function existingPeople(
  row: Pick<PersonDraft, "firstName" | "lastName">,
  players: Player[],
) {
  return players.filter(
    (p) =>
      personNameKey(p.name) ===
      personNameKey(`${row.firstName} ${row.lastName}`),
  );
}
/** Header coordinates define columns; multi-word names stay within their cells. */
export function pdfPeopleRows(pages: PdfRow[][]): string[][] {
  let anchors: number[] | undefined;
  const output: string[][] = [["Vorname", "Nachname", "Kategorie"]];
  for (const page of pages) {
    const headerIndex = page.findIndex((row) =>
      ["vorname", "nachname", "kategorie"].every((label) =>
        row.parts.some(
          (p) => p.text.trim().toLocaleLowerCase("de-DE") === label,
        ),
      ),
    );
    if (headerIndex >= 0)
      anchors = ["vorname", "nachname", "kategorie"].map(
        (label) =>
          page[headerIndex].parts.find(
            (p) => p.text.trim().toLocaleLowerCase("de-DE") === label,
          )!.x,
      );
    if (!anchors || !(anchors[0] < anchors[1] && anchors[1] < anchors[2]))
      throw new Error(
        "PDF-Spalten nicht eindeutig erkannt. Bitte eine Text-Tabelle mit Vorname, Nachname und Kategorie oder eine XLSX-Datei verwenden.",
      );
    for (const row of page.slice(headerIndex >= 0 ? headerIndex + 1 : 0)) {
      const cells = ["", "", ""];
      for (const part of row.parts) {
        const i =
          part.x >= anchors[2] - 3 ? 2 : part.x >= anchors[1] - 3 ? 1 : 0;
        cells[i] += (cells[i] ? " " : "") + part.text.trim();
      }
      // Non-table text remains visible for review and is never silently accepted.
      if (cells.some((s) => s.trim())) output.push(cells);
    }
  }
  return output;
}
export async function readPeopleFile(file: File) {
  const data = await readTableFile(file);
  return {
    hash: data.hash,
    sheets: data.sheets.length
      ? data.sheets
      : [{ name: "PDF-Tabelle", rows: pdfPeopleRows(data.pdfPages) }],
  };
}
