import type { PenaltyType, Player } from "../types";
import { identifyPlayer, normalizeName } from "../ledger";
import { fingerprint, importDate } from "./csv";
export interface ChatMessage {
  date: string;
  time: string;
  sender: string;
  text: string;
  key: string;
}
export async function parseWhatsApp(text: string): Promise<ChatMessage[]> {
  if (new TextEncoder().encode(text).length > 2_000_000)
    throw new Error("TXT überschreitet 2 MB.");
  const rows: Array<Omit<ChatMessage, "key">> = [];
  for (const line of text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .split("\n")) {
    const match = line.match(
      /^(?:\[)?(\d{1,2}[./]\d{1,2}[./](?:\d{4}|\d{2})),?\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\]\s*|\s+-\s+)([^:]+):\s?(.*)$/,
    );
    if (match) {
      const time = match[2].split(":").map((v) => v.padStart(2, "0"));
      if (
        Number(time[0]) > 23 ||
        Number(time[1]) > 59 ||
        (time[2] && Number(time[2]) > 59)
      )
        continue;
      try {
        rows.push({
          date: importDate(match[1]),
          time: `${time[0]}:${time[1]}:${time[2] ?? "00"}`,
          sender: match[3].trim(),
          text: match[4],
        });
      } catch {
        continue;
      }
    } else if (
      !/^(?:\[)?\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(line) &&
      rows.length
    )
      rows[rows.length - 1].text += "\n" + line;
  }
  return Promise.all(
    rows.map(async (m) => ({
      ...m,
      text: m.text.trim(),
      key: await fingerprint(
        `${m.date}|${m.time}|${m.sender}|${m.text.trim()}`,
      ),
    })),
  );
}
export interface PenaltyCandidate {
  key: string;
  date: string;
  sender: string;
  excerpt: string;
  playerId: string | null;
  typeId: string | null;
  amountCents: number | null;
  reason: string | null;
  matchedTerms: string[];
  warnings: string[];
  uncertain: boolean;
  status: "proposed";
  source: "whatsapp";
}

/** Exact normalized words/phrases only: no guessed players, amounts or fuzzy matches. */
export async function penaltyCandidates(
  text: string,
  players: Player[],
  knownKeys: ReadonlySet<string> = new Set(),
  catalog: PenaltyType[] = [],
): Promise<PenaltyCandidate[]> {
  const messages = await parseWhatsApp(text);
  const seen = new Set(knownKeys);
  const candidates: PenaltyCandidate[] = [];
  for (const m of messages) {
    if (seen.has(m.key)) continue;
    seen.add(m.key);
    if (
      /<Medien ausgeschlossen>|Bild weggelassen|Video weggelassen|image omitted|sticker omitted/i.test(
        m.text,
      )
    )
      continue;
    const normalized = ` ${normalizeName(m.text)} `;
    const categories = catalog
      .filter((c) => c.active)
      .map((category) => ({
        category,
        terms: [category.name, ...(category.aliases ?? [])].filter((term) => {
          const value = normalizeName(term);
          return value.length >= 2 && normalized.includes(` ${value} `);
        }),
      }))
      .filter((c) => c.terms.length > 0);
    if (
      !categories.length &&
      !/kasse|strafe|vergessen|zu spät|meckern/i.test(m.text)
    )
      continue;
    const match = identifyPlayer(
      m.text,
      players.filter((p) => p.active),
    );
    const money = [
      ...m.text.matchAll(/(\d{1,6}(?:[,.]\d{1,2})?)\s*(?:€|Euro\b)/gi),
    ];
    const explicitAmount =
      money.length === 1
        ? Math.round(Number(money[0][1].replace(",", ".")) * 100)
        : null;
    const category = categories.length === 1 ? categories[0].category : null;
    // Multiple categories or monetary figures stay unresolved, even if their amounts coincide.
    const amountCents =
      categories.length > 1 || money.length > 1
        ? null
        : (category?.amountCents ?? explicitAmount);
    const warnings: string[] = [];
    if (!match.playerId)
      warnings.push(
        match.ambiguous
          ? "Mehrere Spieler passen zur Nachricht."
          : "Kein eindeutiger aktiver Spieler erkannt.",
      );
    if (categories.length > 1)
      warnings.push("Mehrere Strafenkategorien passen zur Nachricht.");
    if (!category) warnings.push("Strafenkategorie bitte auswählen.");
    if (!amountCents) warnings.push("Kein eindeutiger Betrag belegt.");
    if (money.length > 1)
      warnings.push("Mehrere Geldbeträge in der Nachricht.");
    if (
      category &&
      explicitAmount !== null &&
      explicitAmount !== category.amountCents
    )
      warnings.push(
        "Nachrichtenbetrag weicht vom Katalog ab; Übernahme verwendet den Katalogbetrag.",
      );
    if (/\?|haha|😂|🤣|😉|ironie|spaß|scherz/i.test(m.text))
      warnings.push("Möglicherweise ironisch oder als Frage gemeint.");
    if (
      /\b(?:nicht|kein|keine|keinen|nie|niemals|vielleicht|falls|wenn|würde|hätte|sollte)\b/i.test(
        m.text,
      )
    )
      warnings.push("Verneinung oder hypothetische Aussage bitte prüfen.");
    if (m.text.length > 1000)
      warnings.push("Lange Nachricht: Beleg wird auf 1000 Zeichen begrenzt.");
    candidates.push({
      key: m.key,
      date: m.date,
      sender: m.sender,
      excerpt: m.text.slice(0, 1000),
      playerId: match.playerId,
      typeId: category?.id ?? null,
      amountCents,
      reason: category?.name ?? null,
      matchedTerms: [...new Set(categories.flatMap((c) => c.terms))],
      warnings,
      uncertain: warnings.length > 0,
      status: "proposed",
      source: "whatsapp",
    });
  }
  return candidates;
}
