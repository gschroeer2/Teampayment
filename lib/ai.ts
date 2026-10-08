import { z } from "zod";
/** Contract for a later server-only OpenAI adapter. No API calls or key requirement in v1. */
export const suggestionSchema = z.object({
  playerId: z.uuid().nullable(),
  amountCents: z.number().int().positive().max(100000000).nullable(),
  reason: z.string().min(3).max(500),
  uncertain: z.boolean(),
});
export interface PenaltyAnalysisProvider {
  analyze(input: {
    excerpt: string;
    players: Array<{ id: string; names: string[] }>;
    catalog: Array<{ id: string; name: string; amountCents: number }>;
  }): Promise<z.infer<typeof suggestionSchema>>;
}
export function validateSuggestion(
  input: unknown,
  context: {
    knownPlayerIds: string[];
    explicitAmounts: number[];
    catalogAmounts: number[];
  },
) {
  const suggestion = suggestionSchema.parse(input);
  if (
    suggestion.playerId &&
    !context.knownPlayerIds.includes(suggestion.playerId)
  )
    throw new Error("KI hat einen unbekannten Spieler genannt.");
  if (
    suggestion.amountCents &&
    ![...context.explicitAmounts, ...context.catalogAmounts].includes(
      suggestion.amountCents,
    )
  )
    throw new Error("KI-Betrag ist nicht durch Nachricht oder Katalog belegt.");
  return {
    ...suggestion,
    uncertain:
      suggestion.uncertain || !suggestion.playerId || !suggestion.amountCents,
    status: "proposed" as const,
    requiresHumanConfirmation: true as const,
  };
}
