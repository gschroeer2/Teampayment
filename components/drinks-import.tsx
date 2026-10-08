"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { AppState } from "@/lib/types";
import { commandSchema, type Command } from "@/lib/commands";
import { euros, identifyPlayer, parseEuros } from "@/lib/ledger";
import { drinkDrafts, imageType, type DrinkDraft } from "@/lib/imports/drinks";
import { hashBytes } from "@/lib/imports/catalog";
const blank = (): DrinkDraft => ({
  name: "",
  playerId: "",
  date: "",
  count: "",
  selected: true,
  warning: "Manuell ergänzte Zelle – bitte prüfen.",
});
export function DrinksImport({
  state,
  busy,
  error,
  onSubmit,
}: {
  state: AppState;
  busy: boolean;
  error: string;
  onSubmit: (c: Command) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState(""),
    [hash, setHash] = useState<string | null>(null),
    [reading, setReading] = useState(false);
  const [capability, setCapability] = useState({
    available: false,
    reason: "Verfügbarkeit der Fotoerkennung wird geprüft …",
  });
  const [consent, setConsent] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [list, setList] = useState(""),
    [price, setPrice] = useState("");
  const [year, setYear] = useState(() => new Date().getFullYear()),
    [drafts, setDrafts] = useState<DrinkDraft[]>([]),
    [notes, setNotes] = useState<string[]>([]),
    [failure, setFailure] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/drinks/analyze", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((r) =>
        setCapability({
          available: !!r.available,
          reason: r.reason || r.error || "Fotoerkennung nicht verfügbar.",
        }),
      )
      .catch(() => {
        if (!controller.signal.aborted)
          setCapability({
            available: false,
            reason:
              "Fotoerkennung derzeit nicht erreichbar. Manuelle Prüfung ist möglich.",
          });
      });
    return () => controller.abort();
  }, []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  function duplicate(r: DrinkDraft) {
    return state.drinkConsumptions.some(
      (d) =>
        d.playerId === r.playerId &&
        d.date === r.date &&
        (d.listKey === list.trim().toLocaleLowerCase("de-DE") ||
          (hash !== null && d.imageHash === hash)),
    );
  }
  function edit(i: number, patch: Partial<DrinkDraft>) {
    setReviewed(false);
    setDrafts((rows) => rows.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  }
  async function photo(next?: File) {
    if (!next) return;
    setReading(true);
    setFailure("");
    setConsent(false);
    setReviewed(false);
    setDrafts([]);
    setNotes([]);
    setFile(null);
    setUrl("");
    setHash(null);
    try {
      if (next.size > 5_000_000) throw new Error("Foto überschreitet 5 MB.");
      const bytes = new Uint8Array(await next.arrayBuffer());
      const mime = imageType(bytes);
      if (next.type && next.type !== mime)
        throw new Error("Bildinhalt und Dateityp stimmen nicht überein.");
      setHash(await hashBytes(bytes));
      setFile(next);
      setUrl(URL.createObjectURL(next));
    } catch (e) {
      setFailure(
        e instanceof Error ? e.message : "Foto konnte nicht geladen werden.",
      );
    } finally {
      setReading(false);
    }
  }
  async function recognize() {
    if (!file || !consent || !capability.available) return;
    setReading(true);
    setFailure("");
    setReviewed(false);
    setDrafts([]);
    setNotes([]);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Foto konnte nicht gelesen werden."));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/drinks/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, image: data }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Fotoerkennung fehlgeschlagen.");
      setDrafts(drinkDrafts(result, state.players, year));
      setNotes(result.notes ?? []);
    } catch (e) {
      setFailure(
        e instanceof Error ? e.message : "Fotoerkennung fehlgeschlagen.",
      );
    } finally {
      setReading(false);
    }
  }
  const selected = drafts.filter(
    (r) => r.selected && r.count.trim() !== "0" && !duplicate(r),
  );
  let total: string = "Preis und Mengen prüfen";
  try {
    const unit = parseEuros(price);
    const counts = selected.map((r) => Number(r.count));
    if (counts.every((n) => Number.isInteger(n) && n > 0))
      total = euros(counts.reduce((a, n) => a + n, 0) * unit);
  } catch {
    /* No invented price. */
  }
  async function save() {
    setFailure("");
    try {
      if (!reviewed)
        throw new Error(
          "Bitte Mengen, Personen, Datum und Preis ausdrücklich bestätigen.",
        );
      const parsed = commandSchema.safeParse({
        type: "recordDrinks",
        listKey: list,
        imageHash: hash,
        unitPriceCents: parseEuros(price),
        cells: selected.map((r) => ({
          playerId: r.playerId,
          date: r.date,
          count: Number(r.count),
        })),
      });
      if (!parsed.success)
        throw new Error(parsed.error.issues.map((i) => i.message).join(" · "));
      await onSubmit(parsed.data);
      setReviewed(false);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Getränkezellen prüfen.");
    }
  }
  return (
    <section className="panel import-section" aria-label="Getränkeliste prüfen">
      <h2>Getränkeliste per Foto</h2>
      <p>
        Personen stehen in den Zeilen, Tage in den Spalten. Ein Strich zählt als
        ein Getränk. Foto möglichst gerade und nur mit dem benötigten
        Tabellenausschnitt aufnehmen.
      </p>
      <div className="import-mapping">
        <label>
          Listenkennung
          <input
            value={list}
            maxLength={100}
            placeholder="z. B. training-oktober-2026"
            onChange={(e) => {
              setList(e.target.value);
              setReviewed(false);
            }}
          />
        </label>
        <label>
          Preis pro Getränk in Euro
          <input
            inputMode="decimal"
            value={price}
            placeholder="Vereinbarten Preis eingeben"
            onChange={(e) => {
              setPrice(e.target.value);
              setReviewed(false);
            }}
          />
        </label>
        <label>
          Jahr der Datumsüberschriften
          <input
            type="number"
            min={1900}
            max={2100}
            value={year}
            disabled={reading}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setDrafts([]);
              setReviewed(false);
            }}
          />
        </label>
        <label>
          Getränkefoto auswählen
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={reading || busy}
            onChange={(e) => {
              void photo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="form-hint">
        JPEG, PNG oder WebP, maximal 5 MB. Für dieselbe physische Liste dieselbe
        Kennung verwenden – auch bei einem neuen Foto. Personen ohne
        Spielerkonto vorher unter „Spieler“ als Teammitglied hinzufügen.
      </p>
      {url && (
        <Image
          className="drink-photo"
          src={url}
          alt="Hochgeladene Getränketabelle zur manuellen Prüfung"
          width={1200}
          height={800}
          unoptimized
        />
      )}
      <p>{capability.reason}</p>
      {file && capability.available && (
        <>
          <label className="import-check">
            <input
              type="checkbox"
              checked={consent}
              disabled={reading}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Ich gebe dieses Foto zur Erkennung durch OpenAI frei. Die App
            speichert das Foto nicht dauerhaft.
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={
              !consent ||
              reading ||
              busy ||
              !Number.isInteger(year) ||
              year < 1900 ||
              year > 2100
            }
            onClick={() => void recognize()}
          >
            Foto automatisch erkennen
          </button>
        </>
      )}
      {reading && <p role="status">Foto wird verarbeitet …</p>}
      {notes.map((n, i) => (
        <p className="form-hint" key={i}>
          {n}
        </p>
      ))}
      {(failure || error) && (
        <p className="form-error" role="alert">
          {failure || error}
        </p>
      )}
      {drafts.map((r, i) => {
        const exists = duplicate(r);
        return (
          <div className="drink-cell" key={i}>
            <label className="import-check">
              <input
                type="checkbox"
                checked={r.selected && !exists}
                disabled={exists}
                onChange={(e) => edit(i, { selected: e.target.checked })}
              />
              {exists
                ? "Bereits erfasst – wird übersprungen"
                : "Verbrauchszelle übernehmen"}
            </label>
            <p className="form-hint">{r.warning}</p>
            <div className="import-mapping">
              <label>
                Name aus der Liste {i + 1}
                <input
                  value={r.name}
                  maxLength={100}
                  onChange={(e) => {
                    const name = e.target.value;
                    edit(i, {
                      name,
                      playerId:
                        identifyPlayer(
                          name,
                          state.players.filter((p) => p.active),
                        ).playerId ?? "",
                    });
                  }}
                />
              </label>
              <label>
                Getränke Teammitglied {i + 1}
                <select
                  value={r.playerId}
                  onChange={(e) => edit(i, { playerId: e.target.value })}
                >
                  <option value="">Bitte zuordnen</option>
                  {state.players
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.code}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Getränkedatum {i + 1}
                <input
                  type="date"
                  value={r.date}
                  onChange={(e) => edit(i, { date: e.target.value })}
                />
              </label>
              <label>
                Anzahl Getränke {i + 1}
                <input
                  type="number"
                  min={0}
                  max={500}
                  step={1}
                  value={r.count}
                  onChange={(e) => edit(i, { count: e.target.value })}
                />
              </label>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="button secondary"
        disabled={busy || reading || drafts.length >= 200}
        onClick={() => {
          setDrafts([...drafts, blank()]);
          setReviewed(false);
        }}
      >
        Verbrauchszelle manuell ergänzen
      </button>
      {drafts.length > 0 && (
        <>
          <p>
            {selected.length} ausgewählte Zellen · Gesamtbetrag:{" "}
            <strong>{total}</strong>
          </p>
          <p className="form-hint">
            Bis zu 50 Zellen pro Übernahme. Unsichere Werte korrigieren und
            nicht benötigte Zellen abwählen. Leere Zellen mit null Getränken
            werden nicht gebucht. Getränkeforderungen sind nach deiner Freigabe
            verbindlich und werden im Konto mit den übrigen Forderungen
            verrechnet.
          </p>
          <label className="import-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            Ich habe Personen, Datum, Mengen und Getränkepreis geprüft.
          </label>
          <button
            type="button"
            className="button primary"
            disabled={
              busy ||
              reading ||
              !reviewed ||
              selected.length < 1 ||
              selected.length > 50
            }
            onClick={() => void save()}
          >
            Geprüfte Getränkeforderungen übernehmen
          </button>
        </>
      )}
    </section>
  );
}
