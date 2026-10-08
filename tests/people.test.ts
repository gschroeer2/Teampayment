import { describe, expect, it } from "vitest";
import {
  peopleColumns,
  peopleRows,
  parsePersonCategory,
  pdfPeopleRows,
  existingPeople,
} from "@/lib/imports/people";
import { createDemo } from "@/lib/demo";
import { applyCommand, playerBalance, visibleState } from "@/lib/ledger";
import { commandSchema } from "@/lib/commands";
import { demoStorageSchema } from "@/lib/storage";
const demo = createDemo();
const batch = {
  type: "importPeople" as const,
  fileHash: "a".repeat(64),
  rows: [
    { firstName: "Anna", lastName: "von Test", category: "coach" as const },
    { firstName: "Sam", lastName: "Demo", category: "staff" as const },
  ],
};
describe("Personenimport", () => {
  it("ordnet anders angeordnete Excel-Spalten zu und lässt unbekannte Kategorien offen", () => {
    const table = [
      ["Kategorie", "Nachname", "Vorname"],
      ["Trainer", "von Test", "Anna"],
      ["Unklar", "Demo", "Sam"],
    ];
    const rows = peopleRows(table, peopleColumns(table[0]), 1);
    expect(rows[0]).toMatchObject({
      firstName: "Anna",
      lastName: "von Test",
      category: "coach",
    });
    expect(rows[1].category).toBe("");
    expect(parsePersonCategory(" BETREUER ")).toBe("staff");
    expect(parsePersonCategory("Spieler")).toBe("player");
    expect(parsePersonCategory("Staff")).toBe("staff");
    expect(() =>
      peopleRows(table, { firstName: 0, lastName: 0, category: 2 }, 1),
    ).toThrow();
  });
  it("erhält mehrteilige Nachnamen im PDF auch auf Folgeseiten ohne Überschrift", () => {
    const row = (y: number, values: Array<[number, string]>) => ({
      y,
      parts: values.map(([x, text]) => ({ x, text })),
    });
    const result = pdfPeopleRows([
      [
        row(700, [
          [40, "Vorname"],
          [180, "Nachname"],
          [360, "Kategorie"],
        ]),
        row(680, [
          [40, "Anna"],
          [180, "von"],
          [204, "Test"],
          [360, "Trainer"],
        ]),
      ],
      [
        row(700, [
          [40, "Sam"],
          [180, "Demo"],
          [360, "Betreuer"],
        ]),
      ],
    ]);
    expect(result[1]).toEqual(["Anna", "von Test", "Trainer"]);
    expect(result[2]).toEqual(["Sam", "Demo", "Betreuer"]);
    expect(() =>
      pdfPeopleRows([[row(700, [[40, "Unstrukturierter Text"]])]]),
    ).toThrow(/Spalten/);
  });
  it("vergibt eindeutige MK-IDs und getrennte Namen ohne Benutzerrechte zu erzeugen", () => {
    const state = applyCommand(demo, batch);
    expect(state.players.slice(-2).map((p) => p.code)).toEqual([
      "MK-009",
      "MK-010",
    ]);
    expect(state.players.at(-2)).toMatchObject({
      firstName: "Anna",
      lastName: "von Test",
      name: "Anna von Test",
      category: "coach",
    });
    expect(state.memberships).toEqual(demo.memberships);
    expect(state.role).toBe(demo.role);
  });
  it("verhindert Datei- und dateiübergreifende Dubletten", () => {
    const state = applyCommand(demo, batch);
    expect(() => applyCommand(state, batch)).toThrow(/bereits importiert/);
    expect(() =>
      applyCommand(state, { ...batch, fileHash: "b".repeat(64) }),
    ).toThrow(/existiert bereits/);
    expect(() =>
      applyCommand(demo, { ...batch, rows: [batch.rows[0], batch.rows[0]] }),
    ).toThrow(/Doppelte Namen/);
    expect(demo.players).toHaveLength(8);
  });
  it("erhält bei expliziter Zuordnung Identität, Kontostand, Spitznamen und Aktivstatus", () => {
    const p = demo.players[0];
    const state = applyCommand(demo, {
      ...batch,
      rows: [
        { id: p.id, firstName: "Jonas", lastName: "Weber", category: "coach" },
      ],
    });
    expect(state.players[0]).toMatchObject({
      id: p.id,
      code: p.code,
      aliases: p.aliases,
      active: p.active,
      category: "coach",
    });
    expect(playerBalance(state, p.id)).toEqual(playerBalance(demo, p.id));
    expect(() =>
      applyCommand(demo, {
        ...batch,
        rows: [
          {
            id: p.id,
            firstName: "Falscher",
            lastName: "Name",
            category: "coach",
          },
        ],
      }),
    ).toThrow(/stimmt nicht/);
  });
  it("markiert namensgleiche vorhandene Personen als mehrdeutig", () => {
    const p = demo.players[0];
    expect(
      existingPeople({ firstName: "Jonas", lastName: "Weber" }, [
        p,
        { ...p, id: crypto.randomUUID(), code: "MK-099" },
      ]),
    ).toHaveLength(2);
  });
  it("sichert Rollen, Teamgrenzen und komplette Übernahme ab", () => {
    expect(() => applyCommand({ ...demo, role: "player" }, batch)).toThrow(
      /Berechtigung/,
    );
    expect(
      applyCommand({ ...demo, role: "cashier" }, batch).players,
    ).toHaveLength(10);
    expect(
      visibleState(applyCommand(demo, batch), "player", demo.players[0].id)
        .players,
    ).toHaveLength(1);
    expect(() =>
      applyCommand(demo, {
        ...batch,
        rows: [batch.rows[0], { ...batch.rows[1], id: crypto.randomUUID() }],
      }),
    ).toThrow(/nicht gefunden/);
    expect(demo.imports).toHaveLength(0);
    expect(
      commandSchema.safeParse({
        ...batch,
        rows: [{ ...batch.rows[0], category: "admin" }],
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        ...batch,
        rows: Array(201).fill(batch.rows[0]),
      }).success,
    ).toBe(false);
  });
  it("liest ältere Demo-Daten weiter und persistiert neue Namen und Kategorien", () => {
    const old = structuredClone(demo);
    old.players.forEach((p) => {
      delete p.category;
      delete p.firstName;
      delete p.lastName;
    });
    expect(
      demoStorageSchema.parse({ version: 1, state: old }).state.players[0]
        .category,
    ).toBe("player");
    const state = applyCommand(demo, batch);
    expect(
      demoStorageSchema.parse({ version: 1, state }).state.players.at(-2)
        ?.lastName,
    ).toBe("von Test");
  });
  it("schwärzt getrennte Namen bei der Anonymisierung und verwirft sie nach manueller Umbenennung", () => {
    const state = applyCommand(demo, batch),
      p = state.players.at(-2)!;
    const anonymized = applyCommand(state, {
      type: "anonymizePlayer",
      playerId: p.id,
      confirmation: "ANONYMISIEREN",
    });
    expect(
      anonymized.players.find((row) => row.id === p.id)?.firstName,
    ).toBeUndefined();
    expect(
      anonymized.players.find((row) => row.id === p.id)?.lastName,
    ).toBeUndefined();
    const changed = applyCommand(state, {
      type: "savePlayer",
      id: p.id,
      name: "Anna Neu",
      code: p.code,
      aliases: [],
      active: true,
    });
    expect(changed.players.find((row) => row.id === p.id)).toMatchObject({
      category: "coach",
      name: "Anna Neu",
    });
    expect(
      changed.players.find((row) => row.id === p.id)?.lastName,
    ).toBeUndefined();
  });
});
