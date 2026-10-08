"use client";
import { useState } from "react";
import { commandSchema, type Command } from "@/lib/commands";
import {
  personCategoryLabels,
  type AppState,
  type PersonCategory,
} from "@/lib/types";
import {
  existingPeople,
  peopleColumns,
  peopleRows,
  personNameKey,
  readPeopleFile,
  type PeopleColumns,
  type PersonDraft,
} from "@/lib/imports/people";
import type { TableSheet } from "@/lib/imports/table-file";
export function PeopleImport({
  state,
  busy,
  error,
  onSubmit,
}: {
  state: AppState;
  busy: boolean;
  error: string;
  onSubmit: (command: Command) => Promise<void>;
}) {
  const [sheets, setSheets] = useState<TableSheet[]>([]),
    [sheet, setSheet] = useState(0),
    [header, setHeader] = useState(true);
  const [columns, setColumns] = useState<PeopleColumns>({
    firstName: 0,
    lastName: 1,
    category: 2,
  });
  const [drafts, setDrafts] = useState<PersonDraft[]>([]),
    [hash, setHash] = useState("");
  const [reading, setReading] = useState(false),
    [failure, setFailure] = useState("");
  const imported = state.imports.some(
    (r) => r.source === "people" && r.hash === hash,
  );
  function prepare(rows: string[][], mapping: PeopleColumns, skip: boolean) {
    const seen = new Set<string>();
    setDrafts(
      peopleRows(rows, mapping, skip ? 1 : 0).map((r) => {
        const matches = existingPeople(r, state.players),
          key = personNameKey(`${r.firstName} ${r.lastName}`),
          duplicate = seen.has(key);
        seen.add(key);
        return {
          ...r,
          id: matches.length === 1 ? matches[0].id : undefined,
          selected:
            !matches.length &&
            !duplicate &&
            !!r.firstName &&
            !!r.lastName &&
            !!r.category,
        };
      }),
    );
  }
  async function read(file?: File) {
    if (!file) return;
    setReading(true);
    setFailure("");
    setDrafts([]);
    setSheets([]);
    setHash("");
    try {
      const data = await readPeopleFile(file),
        mapping = peopleColumns(data.sheets[0]?.rows[0] ?? []);
      setHash(data.hash);
      setSheets(data.sheets);
      setSheet(0);
      setHeader(true);
      setColumns(mapping);
      prepare(data.sheets[0]?.rows ?? [], mapping, true);
    } catch (e) {
      setFailure(
        e instanceof Error ? e.message : "Datei konnte nicht gelesen werden.",
      );
    } finally {
      setReading(false);
    }
  }
  function update(i: number, patch: Partial<PersonDraft>) {
    setDrafts((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  async function save() {
    setFailure("");
    try {
      const names = new Set<string>();
      const rows = drafts
        .filter((r) => r.selected)
        .map((r) => {
          const matches = existingPeople(r, state.players),
            key = personNameKey(`${r.firstName} ${r.lastName}`);
          if (names.has(key))
            throw new Error(
              "Doppelte Namen in der Auswahl. Bitte nur eine Zeile auswählen.",
            );
          names.add(key);
          const id =
            matches.length === 1
              ? matches[0].id
              : matches.find((p) => p.id === r.id)?.id;
          if (matches.length > 1 && !id)
            throw new Error(
              "Namensgleiche Personen bitte anhand ihrer Spieler-ID zuordnen.",
            );
          return {
            firstName: r.firstName,
            lastName: r.lastName,
            category: r.category,
            ...(id ? { id } : {}),
          };
        });
      const result = commandSchema.safeParse({
        type: "importPeople",
        fileHash: hash,
        rows,
      });
      if (!result.success)
        throw new Error(
          "Bitte Vorname, Nachname, Kategorie und Auswahl prüfen (höchstens 200 Personen, vollständiger Name höchstens 100 Zeichen).",
        );
      await onSubmit(result.data);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Bitte Vorschau prüfen.");
    }
  }
  const titles = sheets[sheet]?.rows[0] ?? [];
  return (
    <section
      className="panel import-section"
      aria-label="Personenliste importieren"
    >
      <h2>Spieler, Trainer & Betreuer importieren</h2>
      <p>
        Excel (.xlsx) oder PDF mit auswählbarem Text: Vorname, Nachname und
        Kategorie (Spieler, Trainer, Betreuer). Maximal 200 Personen und 5 MB.
        Die Datei wird lokal gelesen; nur bestätigte Zeilen werden gespeichert.
      </p>
      <p>
        Bestehende Personen sind zunächst abgewählt. Bei Auswahl werden nur
        Kategorie und getrennte Namen ergänzt; Konten, IDs, Spitznamen und
        Aktivstatus bleiben erhalten. Kategorien vergeben keine Benutzerrechte.
      </p>
      <label>
        Personenliste auswählen
        <input
          type="file"
          accept=".xlsx,.pdf"
          disabled={busy || reading}
          onChange={(e) => {
            void read(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {reading && <p role="status">Personenliste wird gelesen …</p>}
      {!!sheets.length && (
        <fieldset
          disabled={busy || reading || imported}
          className="import-mapping"
        >
          <label>
            Personen-Tabellenblatt
            <select
              value={sheet}
              onChange={(e) => {
                setSheet(Number(e.target.value));
                setDrafts([]);
              }}
            >
              {sheets.map((s, i) => (
                <option key={i} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={header}
              onChange={(e) => {
                setHeader(e.target.checked);
                setDrafts([]);
              }}
            />{" "}
            Erste Zeile enthält Überschriften
          </label>
          {(["firstName", "lastName", "category"] as const).map((key) => (
            <label key={key}>
              {
                {
                  firstName: "Vorname-Spalte",
                  lastName: "Nachname-Spalte",
                  category: "Kategorie-Spalte",
                }[key]
              }
              <select
                value={columns[key]}
                onChange={(e) => {
                  setColumns({ ...columns, [key]: Number(e.target.value) });
                  setDrafts([]);
                }}
              >
                {Array.from(
                  {
                    length: Math.max(
                      3,
                      ...(sheets[sheet]?.rows.map((r) => r.length) ?? [3]),
                    ),
                  },
                  (_, i) => (
                    <option key={i} value={i}>
                      {i + 1}: {titles[i] || "Ohne Überschrift"}
                    </option>
                  ),
                )}
              </select>
            </label>
          ))}
          <button
            className="button secondary"
            onClick={() => {
              setFailure("");
              try {
                prepare(sheets[sheet].rows, columns, header);
              } catch (e) {
                setFailure(
                  e instanceof Error ? e.message : "Zuordnung prüfen.",
                );
              }
            }}
          >
            Personenvorschau erstellen
          </button>
        </fieldset>
      )}
      {!!drafts.length && (
        <fieldset disabled={busy || imported}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Übernehmen</th>
                  <th>Vorname</th>
                  <th>Nachname</th>
                  <th>Kategorie</th>
                  <th>Abgleich</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((r, i) => {
                  const matches = existingPeople(r, state.players);
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Person ${i + 1} übernehmen`}
                          checked={r.selected}
                          onChange={(e) =>
                            update(i, { selected: e.target.checked })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Vorname ${i + 1}`}
                          value={r.firstName}
                          maxLength={80}
                          onChange={(e) =>
                            update(i, {
                              firstName: e.target.value,
                              id: undefined,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Nachname ${i + 1}`}
                          value={r.lastName}
                          maxLength={80}
                          onChange={(e) =>
                            update(i, {
                              lastName: e.target.value,
                              id: undefined,
                            })
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Personenkategorie ${i + 1}`}
                          value={r.category}
                          onChange={(e) =>
                            update(i, {
                              category: e.target.value as PersonCategory,
                            })
                          }
                        >
                          <option value="">Bitte prüfen</option>
                          {Object.entries(personCategoryLabels).map(
                            ([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </td>
                      <td>
                        {matches.length > 1 ? (
                          <label>
                            Mehrdeutig: Person wählen
                            <select
                              aria-label={`Bestehende Person ${i + 1}`}
                              value={r.id ?? ""}
                              onChange={(e) =>
                                update(i, { id: e.target.value || undefined })
                              }
                            >
                              <option value="">Bitte zuordnen</option>
                              {matches.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} · {p.code}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : matches.length === 1 ? (
                          <span>Bereits vorhanden · {matches[0].code}</span>
                        ) : (
                          <span>Neue Person · eigene MK-ID</span>
                        )}
                        {drafts.filter(
                          (other) =>
                            personNameKey(
                              `${other.firstName} ${other.lastName}`,
                            ) === personNameKey(`${r.firstName} ${r.lastName}`),
                        ).length > 1 && (
                          <small>
                            Doppelter Name in der Datei – bitte nur eine Zeile
                            übernehmen. Namensgleiche Personen können einzeln
                            angelegt werden.
                          </small>
                        )}
                        {!r.category && (
                          <small>
                            Kategorie nicht erkannt – bitte auswählen.
                          </small>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            className="button primary"
            disabled={!drafts.some((r) => r.selected)}
            onClick={() => void save()}
          >
            Ausgewählte Personen übernehmen
          </button>
        </fieldset>
      )}
      {(failure || error) && (
        <p role="alert" className="error">
          {failure || error}
        </p>
      )}
      {imported && (
        <p role="status">
          Personenliste wurde bereits übernommen. Weitere Änderungen können über
          die Spielerverwaltung erfolgen.
        </p>
      )}
    </section>
  );
}
