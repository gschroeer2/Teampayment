import { describe, it, expect } from "vitest";
import { previewCsv } from "@/lib/imports/csv";
import { parseWhatsApp, penaltyCandidates } from "@/lib/imports/whatsapp";
import { makeCsv } from "@/lib/csv";
import { createDemo } from "@/lib/demo";
import { validateSuggestion } from "@/lib/ai";
const players = createDemo().players;
const mapping = {
  id: "ID",
  amount: "Betrag",
  date: "Datum",
  reference: "Zweck",
  currency: "Währung",
  decimal: "," as const,
};
describe("Importvorschau", () => {
  it("erkennt CSV-Dubletten innerhalb und über wiederholte Exporte", async () => {
    const text =
      "ID;Betrag;Datum;Zweck;Währung\nABC;5,00;01.10.2026;MK-003;EUR\nABC;5,00;01.10.2026;MK-003;EUR";
    const a = await previewCsv(text, "paypal", mapping, players);
    expect(a.candidates.map((c) => c.duplicate)).toEqual([false, true]);
    expect(a.candidates[0].playerId).toBe(players[2].id);
    const b = await previewCsv(
      text,
      "paypal",
      mapping,
      players,
      new Set(a.candidates.map((c) => c.key)),
    );
    expect(b.candidates.every((c) => c.duplicate)).toBe(true);
  });
  it("erkennt negative Rückerstattungen und überspringt Fremdwährung", async () => {
    const text =
      "ID;Betrag;Datum;Zweck;Währung\nREF;-2,50;02.10.2026;MK-003;EUR\nUSD;5,00;02.10.2026;MK-001;USD";
    const p = await previewCsv(text, "bank", mapping, players);
    expect(p.candidates[0].kind).toBe("refund");
    expect(p.candidates[0].amountCents).toBe(-250);
    expect(p.candidates).toHaveLength(1);
    expect(p.warnings).toHaveLength(1);
  });
  it("weist fehlende Spalten, fehlende IDs und unmögliche Daten zurück", async () => {
    await expect(
      previewCsv("a;b\n1;2", "bank", mapping, players),
    ).rejects.toThrow("Spalte");
    const p = await previewCsv(
      "ID;Betrag;Datum;Zweck;Währung\n;5,00;01.10.2026;Max;EUR\nX;5,00;31.02.2026;Max;EUR",
      "bank",
      mapping,
      players,
    );
    expect(p.candidates).toEqual([]);
    expect(p.warnings).toHaveLength(2);
  });
  it("erkennt beide WhatsApp-Formate und mehrzeilige Nachrichten", async () => {
    const text =
      "01.10.26, 19:30 - Trainer: Max hat Schuhe vergessen, 5 € in die Kasse.\nBitte nächstes Mal mitbringen.\n[02.10.2026, 09:12:10] Leon: MK-002 zu spät, 5 Euro.";
    const msgs = await parseWhatsApp(text);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].text).toContain("\nBitte");
    expect(msgs[0].time).toBe("19:30:00");
    const a = await penaltyCandidates(text, players);
    expect(a).toHaveLength(2);
    expect(a[0].playerId).toBe(players[2].id);
    expect(a[0].amountCents).toBe(500);
    expect(a[0].status).toBe("proposed");
    expect(
      await penaltyCandidates(text, players, new Set(a.map((c) => c.key))),
    ).toEqual([]);
  });
  it("kennzeichnet unklare und ironische Nachrichten und erfindet keine Beträge", async () => {
    const result = await penaltyCandidates(
      "[02.10.26, 19:20] Trainer: Irgendwer hat Schuhe vergessen 😂\n[02.10.26, 19:21] Trainer: Max: 5 € oder 10 € Strafe?",
      [
        ...players,
        { ...players[1], id: crypto.randomUUID(), aliases: ["Max"] },
      ],
    );
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.uncertain)).toBe(true);
    expect(result[0].amountCents).toBeNull();
    expect(result[1].playerId).toBeNull();
    expect(result[1].amountCents).toBeNull();
  });
  it("verhindert CSV-Formelinjektionen", () => {
    const csv = makeCsv([['=HYPERLINK("evil")', "+123", "@SUM(A1)", "Normal"]]);
    expect(csv).toContain("\"'=HYPERLINK");
    expect(csv).toContain('"\'+123"');
    expect(csv).toContain('"Normal"');
  });
  it("begrenzt KI-Vorschläge auf bekannte Fakten und fordert menschliche Freigabe", () => {
    const context = {
      knownPlayerIds: [players[0].id],
      explicitAmounts: [500],
      catalogAmounts: [1000],
    };
    const raw = {
      playerId: players[0].id,
      amountCents: 500,
      reason: "Schuhe vergessen",
      uncertain: false,
    };
    expect(validateSuggestion(raw, context).requiresHumanConfirmation).toBe(
      true,
    );
    expect(() =>
      validateSuggestion({ ...raw, playerId: players[1].id }, context),
    ).toThrow("unbekannten");
    expect(() =>
      validateSuggestion({ ...raw, amountCents: 100 }, context),
    ).toThrow("belegt");
  });
});
