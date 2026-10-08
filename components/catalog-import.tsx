"use client";
import { useEffect, useRef, useState } from "react";
import type { AppState } from "@/lib/types";
import type { Command } from "@/lib/commands";
import {
  catalogImportCommand,
  catalogRows,
  readCatalogFile,
  type CatalogDraft,
  type CatalogSheet,
} from "@/lib/imports/catalog";
export function CatalogImport({
  state,
  busy,
  onSubmit,
}: {
  state: AppState;
  busy: boolean;
  onSubmit: (c: Command) => Promise<void>;
}) {
  const [sheets, setSheets] = useState<CatalogSheet[]>([]),
    [sheet, setSheet] = useState(0),
    [header, setHeader] = useState(1);
  const [columns, setColumns] = useState({
    name: 0,
    price: 1,
    description: -1,
    aliases: -1,
  });
  const [unit, setUnit] = useState<"euro" | "cent">("euro"),
    [drafts, setDrafts] = useState<CatalogDraft[]>([]),
    [hash, setHash] = useState("");
  const [reading, setReading] = useState(false),
    [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const locked = busy || reading || saving;
  const selectedCount = drafts.filter((row) => row.selected).length;
  useEffect(() => {
    if (failure) {
      feedbackRef.current?.scrollIntoView({ block: "nearest" });
      feedbackRef.current?.focus({ preventScroll: true });
    }
  }, [failure]);
  const imported = state.imports.some(
    (r) => r.source === "catalog" && r.hash === hash,
  );
  function prepare(rows: CatalogDraft[]) {
    if (rows.length > 50)
      throw new Error(
        "Maximal 50 Kategorien pro Datei. Bitte den Katalog aufteilen.",
      );
    setDrafts(
      rows.map((r) => {
        const existing = state.penaltyTypes.find(
          (t) =>
            t.name.trim().toLocaleLowerCase("de-DE") ===
            r.name.trim().toLocaleLowerCase("de-DE"),
        );
        return existing
          ? {
              ...r,
              id: existing.id,
              aliases: r.aliases || existing.aliases.join(", "),
              description: r.description || existing.description,
              selected: false,
            }
          : r;
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
    setUnit("euro");
    try {
      const data = await readCatalogFile(file);
      setHash(data.hash);
      setSheet(0);
      setHeader(1);
      if (data.sheets.length) {
        setSheets(data.sheets);
        const titles = data.sheets[0].rows[0] ?? [];
        const find = (re: RegExp, fallback: number) => {
          const i = titles.findIndex((s) => re.test(s));
          return i < 0 ? fallback : i;
        };
        const mapping = {
          name: find(/strafe|kategorie|vergehen|name/i, 0),
          price: find(/betrag|preis|euro|cent/i, 1),
          description: find(/beschreibung|hinweis/i, -1),
          aliases: find(/alias|synonym|erkennung/i, -1),
        };
        setColumns(mapping);
        setUnit(/cent/i.test(titles[mapping.price] ?? "") ? "cent" : "euro");
        prepare(catalogRows(data.sheets[0].rows, mapping, 1));
      } else prepare(data.pdfRows);
    } catch (e) {
      setFailure(
        e instanceof Error ? e.message : "Datei konnte nicht gelesen werden.",
      );
    } finally {
      setReading(false);
    }
  }
  function update(i: number, key: keyof CatalogDraft, value: string | boolean) {
    setDrafts((rows) =>
      rows.map((r, j) => (i === j ? { ...r, [key]: value } : r)),
    );
  }
  async function save() {
    if (locked) return;
    setFailure("");
    setSaving(true);
    try {
      const command = catalogImportCommand(
        drafts,
        state.penaltyTypes,
        hash,
        unit,
      );
      await onSubmit(command);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Bitte Vorschau prüfen.");
    } finally {
      setSaving(false);
    }
  }
  const titles = sheets[sheet]?.rows[Math.max(0, header - 1)] ?? [];
  return (
    <section
      className="panel import-section"
      aria-label="Strafenkatalog importieren"
    >
      <h2>Strafenkatalog aus PDF oder Excel</h2>
      <p>
        Bis zu 50 Kategorien pro Datei, maximal 5 MB. XLSX und PDF mit
        auswählbarem Text werden lokal verarbeitet. Beträge und Zuordnung vor
        der Übernahme prüfen.
      </p>
      <label>
        Katalogdatei auswählen
        <input
          type="file"
          accept=".xlsx,.pdf"
          disabled={locked}
          onChange={(e) => {
            void read(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {reading && <p role="status">Katalog wird gelesen …</p>}
      {sheets.length > 0 && (
        <fieldset disabled={locked} className="import-mapping">
          <label>
            Tabellenblatt
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
          <label>
            Überschriftenzeile (0 = keine)
            <input
              type="number"
              min={0}
              max={100}
              value={header}
              onChange={(e) => {
                setHeader(Number(e.target.value));
                setDrafts([]);
              }}
            />
          </label>
          {(["name", "price", "description", "aliases"] as const).map((key) => (
            <label key={key}>
              {
                {
                  name: "Spalte Kategorie",
                  price: "Spalte Betrag",
                  description: "Spalte Beschreibung",
                  aliases: "Spalte Erkennungsbegriffe",
                }[key]
              }
              <select
                value={columns[key]}
                onChange={(e) => {
                  setColumns({ ...columns, [key]: Number(e.target.value) });
                  setDrafts([]);
                }}
              >
                {!["name", "price"].includes(key) && (
                  <option value={-1}>Nicht vorhanden</option>
                )}
                {titles.map((title, i) => (
                  <option key={i} value={i}>
                    {i + 1}: {title || "Ohne Überschrift"}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setFailure("");
              try {
                if (columns.name === columns.price)
                  throw new Error(
                    "Kategorie und Betrag müssen unterschiedliche Spalten sein.",
                  );
                prepare(catalogRows(sheets[sheet].rows, columns, header));
              } catch (e) {
                setFailure(e instanceof Error ? e.message : "Spalten prüfen.");
              }
            }}
          >
            Spaltenzuordnung anwenden
          </button>
        </fieldset>
      )}
      {hash && (
        <label>
          Betragseinheit
          <select
            disabled={locked}
            value={unit}
            onChange={(e) => setUnit(e.target.value as "euro" | "cent")}
          >
            <option value="euro">Euro</option>
            <option value="cent">Cent</option>
          </select>
        </label>
      )}
      {imported ? (
        <p role="status">Diese Katalogdatei wurde bereits übernommen.</p>
      ) : (
        drafts.length > 0 && (
          <>
            <p>
              Bestehende Kategorien sind zunächst abgewählt. Eine Auswahl
              erlaubt deren Aktualisierung; vorhandene Forderungen behalten
              ihren bisherigen Betrag.
            </p>
            <fieldset disabled={locked} className="catalog-import-rows">
              {drafts.map((r, i) => (
                <div className="catalog-import-row" key={i}>
                  <label>
                    <input
                      type="checkbox"
                      checked={r.selected}
                      onChange={(e) => update(i, "selected", e.target.checked)}
                    />
                    {r.id
                      ? "Bestehende Kategorie aktualisieren"
                      : "Neue Kategorie übernehmen"}
                  </label>
                  <label>
                    Kategorie {i + 1}
                    <input
                      value={r.name}
                      maxLength={100}
                      onChange={(e) => update(i, "name", e.target.value)}
                    />
                  </label>
                  <label>
                    Betrag {i + 1}
                    <input
                      inputMode="decimal"
                      value={r.price}
                      onChange={(e) => update(i, "price", e.target.value)}
                    />
                  </label>
                  <label>
                    Beschreibung {i + 1}
                    <input
                      value={r.description}
                      maxLength={500}
                      onChange={(e) => update(i, "description", e.target.value)}
                    />
                  </label>
                  <label>
                    Erkennungsbegriffe {i + 1}
                    <input
                      value={r.aliases}
                      onChange={(e) => update(i, "aliases", e.target.value)}
                    />
                  </label>
                </div>
              ))}
            </fieldset>
            <p role="status">
              {selectedCount} von {drafts.length} Kategorien ausgewählt.
              {selectedCount === 0 &&
                " Bitte mindestens eine Kategorie auswählen; vorhandene Kategorien sind zunächst abgewählt."}
            </p>
            <button
              type="button"
              className="button primary"
              disabled={locked || selectedCount === 0}
              onClick={() => void save()}
            >
              {saving || busy
                ? "Kategorien werden übernommen …"
                : "Geprüfte Kategorien übernehmen"}
            </button>
          </>
        )
      )}
      <div ref={feedbackRef} tabIndex={-1}>
        {failure && (
          <p className="error" role="alert">
            {failure}
          </p>
        )}
      </div>
    </section>
  );
}
