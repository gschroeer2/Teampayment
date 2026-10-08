import { describe, expect, it } from "vitest";
import { createDemo } from "@/lib/demo";
import { penaltyCandidates } from "@/lib/imports/whatsapp";
import { applyCommand, playerBalance, visibleState } from "@/lib/ledger";
import { demoStorageSchema } from "@/lib/storage";
const demo = createDemo();
const category = { ...demo.penaltyTypes[4], amountCents: 350 };
const catalog = [...demo.penaltyTypes.slice(0, 4), category];
const chat = (message: string) => `08.10.26, 19:30 - Trainer: ${message}`;
const detect = (message: string, types = catalog, players = demo.players) =>
  penaltyCandidates(chat(message), players, new Set(), types);

describe("WhatsApp-Kurzformen und Katalogbeträge", () => {
  it("erkennt Jo Deckel ohne Geldbetrag oder Strafwort und nimmt den Katalogbetrag", async () => {
    const [c] = await detect("Jo Deckel");
    expect(c).toMatchObject({
      playerId: demo.players[0].id,
      typeId: category.id,
      amountCents: 350,
      reason: "Kronkorken fallen lassen",
      uncertain: false,
      status: "proposed",
      source: "whatsapp",
      excerpt: "Jo Deckel",
    });
    expect(c.matchedTerms).toContain("Deckel");
    for (const term of ["KRONKORKEN", "Bierdeckel", "Kronkorken fallen lassen"])
      expect((await detect(`MK-001: ${term}!`))[0].typeId).toBe(category.id);
  });
  it("nimmt bearbeitete teambezogene Synonyme und den aktuellen Betrag", async () => {
    const [c] = await detect("Jo Verschluss", [
      { ...category, aliases: ["Verschluss"], amountCents: 750 },
    ]);
    expect(c.amountCents).toBe(750);
    expect(
      await detect("Jo Deckel", [{ ...category, aliases: ["Verschluss"] }]),
    ).toEqual([]);
  });
  it("rät weder Teilwörter, Tippfehler noch deaktivierte Kategorien oder Spieler", async () => {
    expect(await detect("Johannes Deckelhalter")).toEqual([]);
    expect(await detect("Jo Dekel")).toEqual([]);
    expect(await detect("Jo Deckel", [{ ...category, active: false }])).toEqual(
      [],
    );
    expect(
      (
        await detect(
          "Jo Deckel",
          catalog,
          demo.players.map((p, i) => (i ? p : { ...p, active: false })),
        )
      )[0].playerId,
    ).toBeNull();
  });
  it("verwendet nicht den Absender als bestraften Spieler", async () => {
    const [c] = await penaltyCandidates(
      "[08.10.2026, 19:30:00] Jo: Deckel",
      demo.players,
      new Set(),
      catalog,
    );
    expect(c.playerId).toBeNull();
    expect(c.uncertain).toBe(true);
  });
  it("kennzeichnet doppelte Aliasse und mehrere genannte Spieler", async () => {
    expect((await detect("Jo und Leo Deckel"))[0].playerId).toBeNull();
    const [c] = await detect("Jo Deckel", catalog, [
      ...demo.players,
      { ...demo.players[1], id: crypto.randomUUID(), aliases: ["Jo"] },
    ]);
    expect(c.playerId).toBeNull();
    expect(c.uncertain).toBe(true);
  });
  it("entscheidet bei mehreren passenden Kategorien nicht anhand gleicher Beträge", async () => {
    const [c] = await detect("Jo Deckel", [
      category,
      {
        ...category,
        id: crypto.randomUUID(),
        name: "Andere Strafe",
        aliases: ["Deckel"],
      },
    ]);
    expect(c.typeId).toBeNull();
    expect(c.amountCents).toBeNull();
    expect(c.uncertain).toBe(true);
  });
  it("warnt vor abweichenden Beträgen, Verneinungen, Fragen und Scherzen", async () => {
    const [conflict] = await detect("Jo Deckel 10 €");
    expect(conflict.amountCents).toBe(350);
    expect(conflict.warnings.join(" ")).toContain("weicht");
    for (const message of [
      "Jo Deckel?",
      "Jo Deckel 😂",
      "Jo hat keinen Deckel fallen lassen",
      "Falls Jo Deckel fallen lässt",
    ])
      expect((await detect(message))[0].uncertain).toBe(true);
    expect((await detect("Jo Deckel 5 € oder 10 €"))[0].amountCents).toBeNull();
  });
  it("überspringt gespeicherte Nachrichten auch bei anderem Exportformat", async () => {
    const [c] = await detect("Jo Deckel");
    expect(
      await penaltyCandidates(
        "[08.10.2026, 19:30:00] Trainer: Jo Deckel",
        demo.players,
        new Set([c.key]),
        catalog,
      ),
    ).toEqual([]);
  });
  it("speichert nur einen Vorschlag, schützt vor Dubletten und verbucht erst nach Bestätigung", async () => {
    const [c] = await detect("Jo Deckel");
    const current = { ...createDemo(), penaltyTypes: catalog };
    const input = {
      type: "addWhatsAppProposal" as const,
      playerId: c.playerId!,
      typeId: c.typeId!,
      date: c.date,
      messageKey: c.key,
      excerpt: c.excerpt,
    };
    const before = playerBalance(current, input.playerId);
    let state = applyCommand(current, input);
    expect(playerBalance(state, input.playerId)).toEqual(before);
    expect(state.penalties.at(-1)).toMatchObject({
      amountCents: 350,
      status: "proposed",
      evidenceExcerpt: "Jo Deckel",
    });
    expect(() => applyCommand(state, input)).toThrow("bereits");
    expect(() => applyCommand({ ...current, role: "player" }, input)).toThrow(
      "Berechtigung",
    );
    const stored = demoStorageSchema.parse({ version: 1, state }).state;
    expect(() => applyCommand(stored, input)).toThrow("bereits");
    expect(
      visibleState(state, "player", input.playerId).penalties.at(-1)
        ?.evidenceExcerpt,
    ).toBeUndefined();
    const penalty = state.penalties.at(-1)!;
    state = applyCommand(state, {
      type: "setPenaltyStatus",
      id: penalty.id,
      status: "confirmed",
      note: "Beleg geprüft",
    });
    expect(playerBalance(state, input.playerId).charged).toBe(
      before.charged + 350,
    );
    state = applyCommand(state, {
      type: "anonymizePlayer",
      playerId: input.playerId,
      confirmation: "ANONYMISIEREN",
    });
    expect(state.penalties.at(-1)?.evidenceExcerpt).toBeUndefined();
  });
  it("übernimmt alte Demo-Daten ohne Erkennungsbegriffe", () => {
    const old = JSON.parse(JSON.stringify(demo));
    for (const type of old.penaltyTypes) delete type.aliases;
    expect(
      demoStorageSchema.parse({ version: 1, state: old }).state.penaltyTypes[0]
        .aliases,
    ).toEqual([]);
  });
});
