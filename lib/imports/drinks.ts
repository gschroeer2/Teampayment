import { z } from "zod";
import { dateSchema } from "../commands";
import { identifyPlayer } from "../ledger";
import { importDate } from "./csv";
import type { Player } from "../types";
export const drinkSheetSchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        cells: z
          .array(
            z.object({
              date: z.string().max(50),
              count: z.number().int().min(0).max(500).nullable(),
              uncertain: z.boolean(),
            }),
          )
          .max(60),
      }),
    )
    .max(100),
  notes: z.array(z.string().max(300)).max(20),
});
export type DrinkSheet = z.infer<typeof drinkSheetSchema>;
export interface DrinkDraft {
  name: string;
  playerId: string;
  date: string;
  count: string;
  selected: boolean;
  warning: string;
}
export function drinkDrafts(
  input: unknown,
  players: Player[],
  year: number,
): DrinkDraft[] {
  const result = drinkSheetSchema.parse(input);
  const drafts = result.rows.flatMap((row) =>
    row.cells
      .filter((c) => c.count !== 0)
      .map((cell) => {
        const match = identifyPlayer(
          row.name,
          players.filter((p) => p.active),
        );
        let date = "",
          inferredYear = false;
        try {
          let raw = cell.date.trim();
          if (/^\d{1,2}[./]\d{1,2}\.?$/.test(raw)) {
            raw = raw.replace(/\.$/, "") + "." + year;
            inferredYear = true;
          }
          date = importDate(raw);
          if (!dateSchema.safeParse(date).success) date = "";
        } catch {
          /* Leave date unresolved instead of guessing. */
        }
        const warnings = [
          !match.playerId ? "Person bitte zuordnen." : "",
          !date ? "Datum bitte prüfen." : "",
          inferredYear ? "Jahr wurde aus deiner Angabe ergänzt." : "",
          cell.count === null
            ? "Striche konnten nicht eindeutig gezählt werden."
            : "",
          cell.uncertain ? "Unsichere Bilderkennung – Zelle prüfen." : "",
        ].filter(Boolean);
        return {
          name: row.name,
          playerId: match.playerId ?? "",
          date,
          count: cell.count === null ? "" : String(cell.count),
          selected: !!match.playerId && !!date && cell.count !== null,
          warning: warnings.join(" "),
        };
      }),
  );
  if (drafts.length > 200)
    throw new Error(
      "Mehr als 200 belegte Zellen. Bitte einen kleineren Tabellenausschnitt fotografieren.",
    );
  return drafts;
}
export function imageType(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n))
    return "image/png";
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  throw new Error("Bitte ein echtes JPEG-, PNG- oder WebP-Foto wählen.");
}
