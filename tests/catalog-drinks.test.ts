import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  catalogAmount,
  catalogRows,
  pdfCatalogLines,
  validateXlsxArchive,
} from "@/lib/imports/catalog";
import { drinkDrafts, imageType } from "@/lib/imports/drinks";
import { recognizeDrinkSheet } from "@/lib/ai/drinks";
import { createDemo } from "@/lib/demo";
import { applyCommand, playerBalance, visibleState } from "@/lib/ledger";
import { commandSchema } from "@/lib/commands";
import { demoStorageSchema } from "@/lib/storage";
const demo = createDemo();
const catalog = {
  type: "importPenaltyCatalog" as const,
  fileHash: "c".repeat(64),
  rows: [
    {
      name: "Testvergehen",
      description: "Fiktiver Test",
      aliases: ["Testkurz"],
      amountCents: 350,
      active: true,
    },
  ],
};
const drinks = {
  type: "recordDrinks" as const,
  listKey: "training-oktober-2026",
  imageHash: "d".repeat(64),
  unitPriceCents: 150,
  cells: [
    { playerId: demo.players[0].id, date: "2026-10-08", count: 3 },
    { playerId: demo.players[1].id, date: "2026-10-08", count: 2 },
  ],
};
describe("Katalogimport", () => {
  it("liest Spaltenzuordnung und interpretiert Euro und Cent eindeutig", () => {
    expect(
      catalogRows(
        [
          ["Betrag", "Name"],
          ["3,50", "Testvergehen"],
        ],
        { name: 1, price: 0, description: -1, aliases: -1 },
        1,
      )[0].name,
    ).toBe("Testvergehen");
    expect(catalogAmount("3,50 €", "euro")).toBe(350);
    expect(catalogAmount("350", "cent")).toBe(350);
    expect(() => catalogAmount("3.5", "cent")).toThrow();
    expect(() => catalogAmount("0", "euro")).toThrow();
  });
  it("erkennt PDF-Textzeilen und lässt mehrere Beträge zur Prüfung offen", () => {
    const rows = pdfCatalogLines([
      "Kategorie Betrag",
      "1. Testvergehen 3,50 EUR Beschreibung",
      "Andere Kategorie 5 € oder 10 €",
    ]);
    expect(rows[0]).toMatchObject({
      name: "Testvergehen",
      price: "3,50",
      selected: true,
    });
    expect(rows[1].price).toBe("");
    expect(rows[1].selected).toBe(false);
  });
  it("prüft XLSX-ZIP-Metadaten und weist verschlüsselte oder übergroße Archive zurück", async () => {
    const bytes = new Uint8Array(
      await readFile(new URL("./fixtures/catalog.xlsx", import.meta.url)),
    );
    expect(() => validateXlsxArchive(bytes)).not.toThrow();
    const malicious = bytes.slice();
    const view = new DataView(malicious.buffer);
    let entry = -1;
    for (let i = 0; i < malicious.length - 4; i++)
      if (view.getUint32(i, true) === 0x02014b50) {
        entry = i;
        break;
      }
    view.setUint32(entry + 24, 30_000_000, true);
    expect(() => validateXlsxArchive(malicious)).toThrow("20 MB");
    expect(() => validateXlsxArchive(new Uint8Array([1, 2]))).toThrow();
  });
  it("importiert atomar, sperrt Wiederholungen und erlaubt ausschließlich Admins", () => {
    const state = applyCommand(demo, catalog);
    expect(state.penaltyTypes.at(-1)?.amountCents).toBe(350);
    expect(() => applyCommand(state, catalog)).toThrow("bereits");
    expect(() => applyCommand({ ...demo, role: "cashier" }, catalog)).toThrow(
      "Berechtigung",
    );
    expect(() =>
      applyCommand(demo, {
        ...catalog,
        rows: [...catalog.rows, ...catalog.rows],
      }),
    ).toThrow("Doppelte");
    expect(demo.penaltyTypes).toHaveLength(5);
  });
  it("bewahrt alte Forderungen bei Aktualisierung und verlangt eindeutige Kategorien", () => {
    const existing = demo.penaltyTypes[0];
    const before = demo.penalties[0].amountCents;
    const state = applyCommand(demo, {
      ...catalog,
      rows: [{ ...existing, amountCents: 750 }],
    });
    expect(state.penalties[0].amountCents).toBe(before);
    expect(state.penaltyTypes[0].amountCents).toBe(750);
    expect(() =>
      applyCommand(demo, {
        ...catalog,
        rows: [{ ...catalog.rows[0], name: existing.name.toUpperCase() }],
      }),
    ).toThrow("existiert");
  });
});
describe("Getränkezellen", () => {
  it("ordnet nur bekannte Namen zu, ergänzt das gewählte Jahr nachvollziehbar und erfindet keine Mengen", () => {
    const rows = drinkDrafts(
      {
        rows: [
          {
            name: "Jo",
            cells: [
              { date: "08.10.", count: 3, uncertain: false },
              { date: "09.10.2026", count: 0, uncertain: false },
            ],
          },
          {
            name: "Unbekannte Person",
            cells: [{ date: "nicht lesbar", count: null, uncertain: true }],
          },
        ],
        notes: [],
      },
      demo.players,
      2026,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      playerId: demo.players[0].id,
      date: "2026-10-08",
      count: "3",
    });
    expect(rows[0].warning).toContain("Jahr");
    expect(rows[1]).toMatchObject({
      playerId: "",
      date: "",
      count: "",
      selected: false,
    });
  });
  it("kennzeichnet mehrdeutige Namen und ungültige Datumszellen", () => {
    const [row] = drinkDrafts(
      {
        rows: [
          {
            name: "Jo und Leo",
            cells: [{ date: "31.02.2026", count: 2, uncertain: true }],
          },
        ],
        notes: [],
      },
      demo.players,
      2026,
    );
    expect(row.playerId).toBe("");
    expect(row.date).toBe("");
    expect(row.warning).toContain("Unsichere");
  });
  it("lehnt ungültige Bildsignaturen und erfundene/negative Mengen ab", async () => {
    expect(
      imageType(
        new Uint8Array(
          await readFile(new URL("./fixtures/drinks.png", import.meta.url)),
        ),
      ),
    ).toBe("image/png");
    expect(() => imageType(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() =>
      drinkDrafts(
        {
          rows: [
            {
              name: "Jo",
              cells: [{ date: "2026-10-08", count: -1, uncertain: false }],
            },
          ],
          notes: [],
        },
        demo.players,
        2026,
      ),
    ).toThrow();
  });
  it("berechnet Mengen zum konfigurierten Preis und hält Personen-/Datumszellen getrennt", () => {
    const before = playerBalance(demo, demo.players[0].id);
    const state = applyCommand(demo, drinks);
    expect(playerBalance(state, demo.players[0].id).charged).toBe(
      before.charged + 450,
    );
    expect(state.penalties.at(-1)?.amountCents).toBe(300);
    expect(state.drinkConsumptions).toHaveLength(2);
    expect(state.penalties.at(-1)?.source).toBe("drinks");
    const stored = demoStorageSchema.parse({ version: 1, state }).state;
    expect(() => applyCommand(stored, drinks)).toThrow("bereits");
    expect(
      visibleState(state, "player", demo.players[0].id).drinkConsumptions,
    ).toHaveLength(1);
  });
  it("verhindert Doppelbuchung bei einem neuen Foto sowie gleicher Datei unter anderer Kennung", () => {
    const state = applyCommand(demo, drinks);
    expect(() =>
      applyCommand(state, { ...drinks, imageHash: "e".repeat(64) }),
    ).toThrow("bereits");
    expect(() =>
      applyCommand(state, { ...drinks, listKey: "andere-liste" }),
    ).toThrow("bereits");
    expect(() =>
      applyCommand(demo, {
        ...drinks,
        cells: [drinks.cells[0], drinks.cells[0]],
      }),
    ).toThrow("bereits");
    expect(demo.drinkConsumptions).toEqual([]);
  });
  it("verbucht null Getränke nicht und verweigert Spielern eigene Buchungen", () => {
    expect(
      commandSchema.safeParse({
        ...drinks,
        cells: [{ ...drinks.cells[0], count: 0 }],
      }).success,
    ).toBe(false);
    expect(() => applyCommand({ ...demo, role: "player" }, drinks)).toThrow(
      "Berechtigung",
    );
  });
  it("erlaubt weitere Zellen derselben Liste und storniert die Forderung nachvollziehbar", () => {
    const state = applyCommand(applyCommand(demo, drinks), {
      ...drinks,
      cells: [{ ...drinks.cells[0], date: "2026-10-09" }],
    });
    expect(state.drinkConsumptions).toHaveLength(3);
    const last = state.penalties.at(-1)!;
    const corrected = applyCommand(state, {
      type: "setPenaltyStatus",
      id: last.id,
      status: "cancelled",
      note: "Zählfehler berichtigt",
    });
    expect(playerBalance(corrected, last.playerId).charged).toBe(
      playerBalance(state, last.playerId).charged - 450,
    );
  });
});
describe("Optionale Fotoerkennung", () => {
  it("sendet ausschließlich das freigegebene Bild mit strukturiertem Vertrag und ohne Speicherung", async () => {
    const sheet = {
      rows: [
        {
          name: "Jo",
          cells: [{ date: "08.10.2026", count: 3, uncertain: false }],
        },
      ],
      notes: [],
    };
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                content: [{ type: "output_text", text: JSON.stringify(sheet) }],
              },
            ],
          }),
          { status: 200 },
        ),
      );
    expect(
      await recognizeDrinkSheet(
        "data:image/png;base64,TEST",
        "test-key",
        "gpt-4.1",
        request,
      ),
    ).toEqual(sheet);
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(JSON.stringify(body)).not.toContain(demo.players[0].name);
  });
  it("kennzeichnet unvollständige oder ungültige Anbieterantworten als Fehler", async () => {
    await expect(
      recognizeDrinkSheet(
        "image",
        "test",
        undefined,
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ status: "incomplete" }), {
              status: 200,
            }),
          ),
      ),
    ).rejects.toThrow("unvollständig");
    await expect(
      recognizeDrinkSheet(
        "image",
        "test",
        undefined,
        vi.fn().mockResolvedValue(new Response("", { status: 429 })),
      ),
    ).rejects.toThrow("ausgelastet");
  });
});
