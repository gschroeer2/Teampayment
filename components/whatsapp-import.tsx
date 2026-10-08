"use client";
import { useState } from "react";
import { FileUp } from "lucide-react";
import type { AppState } from "@/lib/types";
import type { Command } from "@/lib/commands";
import { euros } from "@/lib/ledger";
import {
  penaltyCandidates,
  type PenaltyCandidate,
} from "@/lib/imports/whatsapp";

export function WhatsAppImport({
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
  const [candidates, setCandidates] = useState<PenaltyCandidate[]>([]);
  const [reading, setReading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [fileError, setFileError] = useState("");
  const known = new Set(
    state.penalties.flatMap((p) => (p.sourceHash ? [p.sourceHash] : [])),
  );
  const remaining = candidates.filter((c) => !known.has(c.key));
  async function read(file?: File) {
    if (!file) return;
    setCandidates([]);
    setFileError("");
    setFeedback("");
    setReading(true);
    try {
      if (
        !/\.txt$/i.test(file.name) ||
        (file.type &&
          !["text/plain", "application/octet-stream"].includes(file.type))
      )
        throw new Error(
          "Bitte einen WhatsApp-Export als TXT ohne Medien wählen. ZIP wird noch nicht unterstützt.",
        );
      if (file.size > 2_000_000) throw new Error("TXT überschreitet 2 MB.");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (text.includes("\0"))
        throw new Error("Datei enthält keine gültigen Textdaten.");
      const result = await penaltyCandidates(
        text,
        state.players,
        known,
        state.penaltyTypes,
      );
      setCandidates(result.slice(0, 500));
      setFeedback(
        result.length
          ? `${result.length} neue mögliche Strafmeldungen erkannt.${result.length > 500 ? " Es werden die ersten 500 angezeigt; bitte kleinere Exporte verwenden." : ""}`
          : "Keine neuen möglichen Strafmeldungen gefunden. Bereits übernommene Nachrichten werden übersprungen.",
      );
    } catch (e) {
      setFileError(
        e instanceof Error ? e.message : "Datei konnte nicht gelesen werden.",
      );
    } finally {
      setReading(false);
    }
  }
  return (
    <section className="panel whatsapp-panel">
      <div className="panel-heading">
        <div>
          <h2>WhatsApp-Chat prüfen</h2>
          <p>TXT-Export auswählen, Vorschläge prüfen und einzeln übernehmen.</p>
        </div>
        <FileUp size={24} />
      </div>
      <p>
        Kurze Meldungen wie „Jo Deckel“ werden über Spielernamen, Spitznamen und
        die Erkennungsbegriffe im Strafenkatalog erkannt. Beträge stammen aus
        dem Katalog. Verbindliche Strafen entstehen erst nach Bestätigung unter
        „Strafen“.
      </p>
      <label className="whatsapp-upload">
        WhatsApp-TXT auswählen
        <input
          type="file"
          accept=".txt,text/plain"
          disabled={busy || reading}
          onChange={(e) => {
            void read(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <p className="form-hint">
        Maximal 2 MB, UTF-8. Der Chat wird lokal im Browser verarbeitet und
        nicht vollständig gespeichert. Nur der Beleg eines übernommenen
        Vorschlags wird gespeichert.
      </p>
      {reading && <p role="status">Nachrichten werden geprüft …</p>}
      {feedback && <p role="status">{feedback}</p>}
      {(fileError || error) && (
        <p className="form-error" role="alert">
          {fileError || error}
        </p>
      )}
      {remaining.map((candidate) => (
        <CandidateReview
          key={candidate.key}
          candidate={candidate}
          state={state}
          busy={busy}
          onSubmit={onSubmit}
        />
      ))}
      {candidates.length > 0 && remaining.length === 0 && (
        <p role="status">Alle angezeigten Vorschläge wurden übernommen.</p>
      )}
      {candidates.length > 0 && (
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setCandidates([]);
            setFeedback("");
          }}
        >
          Vorschau verwerfen
        </button>
      )}
    </section>
  );
}
function CandidateReview({
  candidate,
  state,
  busy,
  onSubmit,
}: {
  candidate: PenaltyCandidate;
  state: AppState;
  busy: boolean;
  onSubmit: (command: Command) => Promise<void>;
}) {
  const [playerId, setPlayerId] = useState(candidate.playerId ?? "");
  const [typeId, setTypeId] = useState(candidate.typeId ?? "");
  const category = state.penaltyTypes.find((t) => t.id === typeId && t.active);
  return (
    <form
      className="whatsapp-candidate"
      aria-label={`Strafenvorschlag: ${candidate.excerpt}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!playerId || !category || busy) return;
        void onSubmit({
          type: "addWhatsAppProposal",
          playerId,
          typeId,
          date: candidate.date,
          messageKey: candidate.key,
          excerpt: candidate.excerpt,
        });
      }}
    >
      <div>
        <span className={`badge ${candidate.uncertain ? "amber" : "green"}`}>
          {candidate.uncertain ? "Zuordnung prüfen" : "Eindeutiger Vorschlag"}
        </span>
        <p className="form-hint">
          {candidate.date} · Nachricht von {candidate.sender}
        </p>
        <blockquote>{candidate.excerpt}</blockquote>
      </div>
      {candidate.matchedTerms.length > 0 && (
        <p className="form-hint">
          Erkannt über: {candidate.matchedTerms.join(", ")}
        </p>
      )}
      {candidate.warnings.length > 0 && (
        <ul>
          {candidate.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <div className="whatsapp-fields">
        <label>
          Spieler für Vorschlag
          <select
            required
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
          >
            <option value="">Bitte auswählen</option>
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
          Strafenkategorie für Vorschlag
          <select
            required
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
          >
            <option value="">Bitte auswählen</option>
            {state.penaltyTypes
              .filter((t) => t.active)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="whatsapp-save">
        <strong>
          Katalogbetrag:{" "}
          {category ? euros(category.amountCents) : "Kategorie auswählen"}
        </strong>
        <button
          className="button primary"
          type="submit"
          disabled={busy || !playerId || !category}
        >
          Als Vorschlag übernehmen
        </button>
      </div>
    </form>
  );
}
