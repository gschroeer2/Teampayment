import { describe, it, expect } from "vitest";
import { createDemo } from "@/lib/demo";
import {
  applyCommand,
  playerBalance,
  parseEuros,
  identifyPlayer,
  visibleState,
  penaltyPaid,
} from "@/lib/ledger";
import { authorize, commandSchema } from "@/lib/commands";
import type { AppState } from "@/lib/types";
function base(): AppState {
  const s = createDemo();
  s.penalties = [];
  s.transactions = [];
  s.allocations = [];
  s.auditLogs = [];
  return s;
}
const fine = (s: AppState, playerId: string, amountCents = 1000) =>
  applyCommand(s, {
    type: "addPenalty",
    playerId,
    typeId: null,
    amountCents,
    reason: "Test-Strafe",
    date: "2026-10-01",
    status: "confirmed",
  });
const pay = (
  s: AppState,
  splits: Array<{ playerId: string; amountCents: number }>,
  externalId: string | null = null,
) =>
  applyCommand(s, {
    type: "addPayment",
    amountCents: splits.reduce((n, s) => n + s.amountCents, 0),
    date: "2026-10-02",
    source: "bank",
    reference: "Test",
    externalId,
    splits,
  });
describe("Kontologik", () => {
  it("rechnet ausschließlich bestätigte Strafen", () => {
    let s = base();
    const id = s.players[0].id;
    s = fine(s, id);
    s = applyCommand(s, {
      type: "addPenalty",
      playerId: id,
      typeId: null,
      amountCents: 500,
      reason: "Vorschlag",
      date: "2026-10-01",
      status: "proposed",
    });
    expect(playerBalance(s, id)).toEqual({
      charged: 1000,
      paid: 0,
      open: 1000,
      credit: 0,
    });
  });
  it("berechnet Teilzahlungen ohne Fließkommafehler", () => {
    let s = base();
    const id = s.players[0].id;
    s = fine(s, id, 1033);
    s = pay(s, [{ playerId: id, amountCents: 501 }]);
    expect(playerBalance(s, id).open).toBe(532);
    expect(penaltyPaid(s.penalties[0], s.allocations)).toBe(501);
  });
  it("teilt Sammelzahlungen und priorisiert älteste Forderungen", () => {
    let s = base();
    const [a, b] = s.players;
    s = fine(s, a.id, 1000);
    s = fine(s, a.id, 500);
    s.penalties[1].date = "2026-10-02"; // Explicit chronology, independent of clock resolution.
    s = fine(s, b.id, 500);
    s = pay(s, [
      { playerId: a.id, amountCents: 1200 },
      { playerId: b.id, amountCents: 300 },
    ]);
    expect(s.allocations.map((a) => a.amountCents)).toEqual([1000, 200, 300]);
    expect(playerBalance(s, a.id).open).toBe(300);
    expect(playerBalance(s, b.id).open).toBe(200);
  });
  it("weist Überzahlungen als Guthaben aus und nimmt Rückbuchungen vollständig zurück", () => {
    let s = base();
    const id = s.players[0].id;
    s = fine(s, id);
    s = pay(s, [{ playerId: id, amountCents: 1500 }]);
    expect(playerBalance(s, id).credit).toBe(500);
    expect(s.allocations.find((a) => !a.penaltyId)?.amountCents).toBe(500);
    const tx = s.transactions[0];
    s = applyCommand(s, {
      type: "refundPayment",
      id: tx.id,
      date: "2026-10-03",
      note: "Rückerstattung",
    });
    expect(playerBalance(s, id)).toEqual({
      charged: 1000,
      paid: 0,
      open: 1000,
      credit: 0,
    });
    expect(s.transactions[0]).toEqual(tx);
    expect(() =>
      applyCommand(s, {
        type: "refundPayment",
        id: tx.id,
        date: "2026-10-03",
        note: "Nochmals",
      }),
    ).toThrow("bereits");
  });
  it("storniert bezahlte Forderungen zu Guthaben und kann die Zahlung danach rückbuchen", () => {
    let s = base();
    const id = s.players[0].id;
    s = fine(s, id);
    s = pay(s, [{ playerId: id, amountCents: 1000 }]);
    s = applyCommand(s, {
      type: "setPenaltyStatus",
      id: s.penalties[0].id,
      status: "cancelled",
      note: "Fehler korrigiert",
    });
    expect(playerBalance(s, id).credit).toBe(1000);
    expect(s.allocations[0].penaltyId).toBeNull();
    s = applyCommand(s, {
      type: "refundPayment",
      id: s.transactions[0].id,
      date: "2026-10-03",
      note: "Erstattung",
    });
    expect(playerBalance(s, id).credit).toBe(0);
  });
  it("verrechnet bestehendes Guthaben mit neuen bestätigten Forderungen und rückbucht korrekt", () => {
    let s = base();
    const id = s.players[0].id;
    s = pay(s, [{ playerId: id, amountCents: 1200 }]);
    expect(playerBalance(s, id).credit).toBe(1200);
    s = fine(s, id, 500);
    expect(penaltyPaid(s.penalties[0], s.allocations)).toBe(500);
    expect(playerBalance(s, id).credit).toBe(700);
    s = fine(s, id, 1000);
    expect(penaltyPaid(s.penalties[1], s.allocations)).toBe(700);
    expect(playerBalance(s, id).open).toBe(300);
    s = applyCommand(s, {
      type: "refundPayment",
      id: s.transactions[0].id,
      date: "2026-10-03",
      note: "Rückerstattung",
    });
    expect(playerBalance(s, id).open).toBe(1500);
    expect(s.penalties.map((p) => penaltyPaid(p, s.allocations))).toEqual([
      0, 0,
    ]);
  });
  it("verhindert Dubletten pro Kanal, ungültige Aufteilungen und doppelte Spieler", () => {
    let s = base();
    const id = s.players[0].id;
    s = pay(s, [{ playerId: id, amountCents: 1000 }], "BANK-001");
    expect(() =>
      pay(s, [{ playerId: id, amountCents: 1000 }], "BANK-001"),
    ).toThrow("bereits");
    expect(() =>
      applyCommand(s, {
        type: "addPayment",
        amountCents: 999,
        date: "2026-10-02",
        source: "cash",
        reference: "",
        externalId: null,
        splits: [{ playerId: id, amountCents: 1000 }],
      }),
    ).toThrow("exakt");
    expect(() =>
      pay(s, [
        { playerId: id, amountCents: 100 },
        { playerId: id, amountCents: 100 },
      ]),
    ).toThrow("einmal");
  });
  it("anonymisiert persönliche Texte, entzieht Spielerzugriff und erhält Kontostände", () => {
    let s = base();
    const p = s.players[0];
    s = fine(s, p.id);
    s = pay(s, [{ playerId: p.id, amountCents: 500 }]);
    s.memberships.push({
      userId: crypto.randomUUID(),
      role: "player",
      playerId: p.id,
    });
    const balance = playerBalance(s, p.id);
    s = applyCommand(s, {
      type: "anonymizePlayer",
      playerId: p.id,
      confirmation: "ANONYMISIEREN",
    });
    expect(s.players[0].name).toBe("Anonymisierter Spieler");
    expect(s.players[0].active).toBe(false);
    expect(s.players[0].aliases).toEqual([]);
    expect(s.penalties[0].reason).toBe("Grund anonymisiert");
    expect(s.transactions[0].reference).toBe("Verwendungszweck anonymisiert");
    expect(s.memberships.some((m) => m.playerId === p.id)).toBe(false);
    expect(playerBalance(s, p.id)).toEqual(balance);
  });
  it("schützt Ursprungsdaten bei fehlgeschlagenen Änderungen", () => {
    const s = base();
    const copy = structuredClone(s);
    expect(() =>
      pay(s, [{ playerId: crypto.randomUUID(), amountCents: 100 }]),
    ).toThrow();
    expect(s).toEqual(copy);
  });
  it("validiert Centbeträge, Daten und Übergänge", () => {
    expect(parseEuros("5,01")).toBe(501);
    expect(parseEuros("0.10")).toBe(10);
    for (const x of ["-5", "1,234", "NaN", "0", "1.000,00"])
      expect(() => parseEuros(x)).toThrow();
    const s = fine(base(), base().players[0].id);
    expect(() =>
      applyCommand(s, {
        type: "setPenaltyStatus",
        id: s.penalties[0].id,
        status: "confirmed",
        note: "Schon bestätigt",
      }),
    ).toThrow();
    expect(
      commandSchema.safeParse({
        type: "addPenalty",
        playerId: s.players[0].id,
        typeId: null,
        amountCents: 5,
        reason: "Test",
        date: "2026-02-30",
        status: "confirmed",
      }).success,
    ).toBe(false);
  });
});
describe("Rollen und Identifikation", () => {
  it("verbietet Spielern alle Änderungen und Kassierern Administrationsaktionen", () => {
    const c = { type: "updateSettings" as const, retentionDays: 90 };
    expect(() => authorize("player", c)).toThrow();
    expect(() => authorize("cashier", c)).toThrow();
    expect(() => authorize("admin", c)).not.toThrow();
    expect(() =>
      authorize("cashier", {
        type: "addPenalty",
        playerId: crypto.randomUUID(),
        typeId: null,
        amountCents: 500,
        reason: "Test",
        date: "2026-10-01",
        status: "confirmed",
      }),
    ).not.toThrow();
  });
  it("versteckt fremde Konten und den Betrag einer Sammelzahlung vor Spielern", () => {
    let s = base();
    const [a, b] = s.players;
    s = pay(s, [
      { playerId: a.id, amountCents: 1000 },
      { playerId: b.id, amountCents: 300 },
    ]);
    const v = visibleState(s, "player", a.id);
    expect(v.players).toHaveLength(1);
    expect(v.transactions[0].amountCents).toBe(1000);
    expect(v.transactions[0].reference).toBe("Eigener Zahlungsanteil");
    expect(v.auditLogs).toEqual([]);
    expect(v.memberships).toEqual([]);
  });
  it("ordnet nur eindeutige Namen oder IDs zu", () => {
    const s = base();
    expect(identifyPlayer("MK-003 Mannschaftskasse", s.players).playerId).toBe(
      s.players[2].id,
    );
    const ambiguous = [
      ...s.players,
      { ...s.players[0], id: crypto.randomUUID(), aliases: ["Max"] },
    ];
    expect(identifyPlayer("Max hat vergessen", ambiguous)).toEqual({
      playerId: null,
      ambiguous: true,
    });
    expect(identifyPlayer("Maximilian", s.players).playerId).toBeNull();
  });
});
