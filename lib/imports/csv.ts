import Papa from "papaparse";
import { identifyPlayer } from "../ledger";
import type { Player } from "../types";
export interface CsvMapping {
  id: string;
  amount: string;
  date: string;
  reference: string;
  name?: string;
  currency?: string;
  status?: string;
  completedValues?: string[];
  decimal: "," | ".";
}
export interface ImportCandidate {
  externalId: string;
  amountCents: number;
  date: string;
  reference: string;
  playerId: string | null;
  kind: "payment" | "refund";
  reviewRequired: true;
  duplicate: boolean;
  key: string;
}
export async function fingerprint(text: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function parseAmount(raw: string, decimal: "," | ".") {
  const clean = raw.trim().replace(/\s|€/g, "");
  const separator = decimal === "," ? "." : ",";
  const pattern =
    decimal === ","
      ? /^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/
      : /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;
  if (!pattern.test(clean))
    throw new Error("Ungültiger Geldbetrag oder Dezimaltrenner");
  const normalized = clean.split(separator).join("").replace(decimal, ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error("Ungültiger Geldbetrag");
  const negative = normalized.startsWith("-");
  const [whole, fraction = ""] = normalized.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000 || cents === 0)
    throw new Error("Ungültiger Geldbetrag");
  return negative ? -cents : cents;
}
export function importDate(value: string) {
  const raw = value.trim();
  const m = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/);
  const result = m
    ? `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
    : raw;
  const d = new Date(result + "T12:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    Number.isNaN(d.getTime()) ||
    d.toISOString().slice(0, 10) !== result
  )
    throw new Error("Ungültiges Datum");
  return result;
}
/** Pure preview only: callers must select relevant rows and confirm every import. No upload endpoint in v1. */
export async function previewCsv(
  text: string,
  source: "bank" | "paypal",
  mapping: CsvMapping,
  players: Player[],
  knownKeys: ReadonlySet<string> = new Set(),
) {
  if (new TextEncoder().encode(text).length > 2_000_000)
    throw new Error("CSV überschreitet 2 MB.");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });
  if (parsed.errors.length)
    throw new Error("CSV ist beschädigt oder enthält inkonsistente Spalten.");
  if (parsed.data.length > 10000) throw new Error("Maximal 10.000 Zeilen.");
  for (const key of [
    mapping.id,
    mapping.amount,
    mapping.date,
    mapping.reference,
    mapping.name,
    mapping.currency,
    mapping.status,
  ].filter(Boolean))
    if (!parsed.meta.fields?.includes(key!))
      throw new Error(`Spalte fehlt: ${key}`);
  const seen = new Set(knownKeys);
  const candidates: ImportCandidate[] = [];
  const warnings: string[] = [];
  for (const [i, row] of parsed.data.entries())
    try {
      if (
        mapping.currency &&
        row[mapping.currency].trim().toUpperCase() !== "EUR"
      ) {
        warnings.push(`Zeile ${i + 2}: Fremdwährung übersprungen.`);
        continue;
      }
      if (
        mapping.status &&
        !mapping.completedValues?.includes(row[mapping.status].trim())
      ) {
        warnings.push(`Zeile ${i + 2}: Status nicht freigegeben.`);
        continue;
      }
      const externalId = row[mapping.id].trim();
      if (!externalId || externalId.length > 200)
        throw new Error("Eindeutige Transaktions-ID fehlt");
      const reference = row[mapping.reference].trim();
      if (reference.length > 200) throw new Error("Verwendungszweck zu lang");
      const amountCents = parseAmount(row[mapping.amount], mapping.decimal);
      const date = importDate(row[mapping.date]);
      const key = await fingerprint(`${source}\u0000${externalId}`);
      const duplicate = seen.has(key);
      seen.add(key);
      const match = identifyPlayer(
        `${reference} ${mapping.name ? row[mapping.name] : ""}`,
        players,
      );
      candidates.push({
        externalId,
        amountCents,
        date,
        reference,
        playerId: match.playerId,
        kind: amountCents < 0 ? "refund" : "payment",
        reviewRequired: true,
        duplicate,
        key,
      });
    } catch (e) {
      warnings.push(
        `Zeile ${i + 2}: ${e instanceof Error ? e.message : "Ungültige Zeile"}.`,
      );
    }
  return { candidates, warnings };
}
