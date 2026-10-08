import type { Player } from "../types";
import { identifyPlayer } from "../ledger";
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
export async function penaltyCandidates(
  text: string,
  players: Player[],
  knownKeys: ReadonlySet<string> = new Set(),
) {
  const messages = await parseWhatsApp(text);
  const seen = new Set(knownKeys);
  const candidates = [];
  for (const m of messages) {
    if (seen.has(m.key)) continue;
    seen.add(m.key);
    if (
      /<Medien ausgeschlossen>|Bild weggelassen|Video weggelassen|image omitted|sticker omitted/i.test(
        m.text,
      )
    )
      continue;
    if (!/kasse|strafe|vergessen|zu spät|meckern/i.test(m.text)) continue;
    const match = identifyPlayer(m.text, players);
    const money = [
      ...m.text.matchAll(/(\d{1,6}(?:[,.]\d{1,2})?)\s*(?:€|Euro\b)/gi),
    ];
    const raw = money.length === 1 ? money[0][1].replace(",", ".") : null;
    const amountCents = raw ? Math.round(Number(raw) * 100) : null;
    candidates.push({
      key: m.key,
      date: m.date,
      sender: m.sender,
      excerpt: m.text.slice(0, 1000),
      playerId: match.playerId,
      amountCents,
      uncertain:
        !match.playerId ||
        !amountCents ||
        money.length !== 1 ||
        /\?|haha|😂|ironie|spaß|scherz/i.test(m.text) ||
        m.text.length > 1000,
      status: "proposed" as const,
      source: "whatsapp" as const,
    });
  }
  return candidates;
}
