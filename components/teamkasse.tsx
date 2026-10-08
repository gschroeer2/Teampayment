"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Download,
  FileUp,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Users,
  WalletCards,
  X,
  RotateCcw,
  Trophy,
  Sparkles,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import type { AppState, Penalty, Player, Role } from "@/lib/types";
import {
  applyCommand,
  euros,
  parseEuros,
  penaltyPaid,
  playerBalance,
  totals,
  visibleState,
} from "@/lib/ledger";
import { canManage, type Command } from "@/lib/commands";
import { createDemo } from "@/lib/demo";
import { makeCsv, downloadFile } from "@/lib/csv";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { PeopleImport } from "./people-import";
import { personCategoryLabels } from "@/lib/types";
import { CatalogImport } from "./catalog-import";
import { DrinksImport } from "./drinks-import";
import { WhatsAppImport } from "./whatsapp-import";
import { demoStorageSchema } from "@/lib/storage";

type Tab =
  "dashboard" | "players" | "penalties" | "payments" | "imports" | "settings";
type Modal =
  | { kind: "player"; player?: Player }
  | { kind: "penalty" }
  | { kind: "payment" }
  | {
      kind: "status";
      penalty: Penalty;
      status: "confirmed" | "rejected" | "cancelled";
    }
  | { kind: "refund"; id: string }
  | { kind: "category"; id?: string }
  | { kind: "member" }
  | { kind: "privacy"; player: Player }
  | null;
const tabLabels: Record<Tab, string> = {
  dashboard: "Übersicht",
  players: "Spieler",
  penalties: "Strafen",
  payments: "Zahlungen",
  imports: "Importe",
  settings: "Verwaltung",
};
const sourceLabels = { cash: "Barzahlung", bank: "Bank", paypal: "PayPal" };
const roleLabels: Record<Role, string> = {
  admin: "Administrator",
  cashier: "Kassierer",
  player: "Spieler",
};
const today = () => new Date().toISOString().slice(0, 10);
function shortDate(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
  });
}
function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
}
function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return <span className={`avatar avatar-${index % 5}`}>{initials(name)}</span>;
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <ListChecks size={30} />
      <p>{text}</p>
    </div>
  );
}
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
const nav: Array<{ id: Tab; icon: LucideIcon }> = [
  { id: "dashboard", icon: LayoutDashboard },
  { id: "players", icon: Users },
  { id: "penalties", icon: ListChecks },
  { id: "payments", icon: ArrowLeftRight },
  { id: "imports", icon: FileUp },
  { id: "settings", icon: Settings2 },
];
export default function TeamKasse({
  initialState,
}: {
  initialState: AppState;
}) {
  const [master, setMaster] = useState(initialState);
  const [role, setRole] = useState<Role>(initialState.role);
  const [demoPlayer] = useState(
    initialState.players[2]?.id ?? initialState.players[0]?.id ?? null,
  );
  const [tab, setTab] = useState<Tab>("dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [query, setQuery] = useState("");
  const [viewDate] = useState(today);
  const [period, setPeriod] = useState("all");
  const [playerFilter, setPlayerFilter] = useState("all");
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const state =
    master.mode === "demo"
      ? visibleState(master, role, role === "player" ? demoPlayer : null)
      : master;
  const manager = canManage(state.role);
  const admin = state.role === "admin";
  useEffect(() => {
    try {
      if (initialState.mode === "demo") {
        const saved = localStorage.getItem("teamkasse-demo-v1");
        if (saved) {
          const parsed = demoStorageSchema.safeParse(JSON.parse(saved));
          if (parsed.success) {
            // Browser-only persisted demo state is restored once after hydration.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setMaster(parsed.data.state);
          } else localStorage.removeItem("teamkasse-demo-v1");
        }
      }
      // Browser-only preference cannot be read during server rendering.
      setDark(localStorage.getItem("teamkasse-theme") === "dark");
    } catch {
      /* Local storage may be disabled. Demo remains usable in memory. */
    }
    // Client-only browser preferences are read once after hydration.
    setHydrated(true);
  }, [initialState.mode]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("teamkasse-theme", dark ? "dark" : "light");
    } catch {
      // Persistence is optional when the browser blocks local storage.
    }
  }, [dark]);
  useEffect(() => {
    if (master.mode === "demo" && hydrated)
      try {
        localStorage.setItem(
          "teamkasse-demo-v1",
          JSON.stringify({ version: 1, state: master }),
        );
      } catch {
        // Persistence is optional when the browser blocks local storage.
      }
  }, [master, hydrated]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  async function execute(command: Command, propagateError = false) {
    setBusy(true);
    setError("");
    try {
      if (state.mode === "demo")
        setMaster(applyCommand({ ...master, role }, command));
      else {
        const response = await fetch("/api/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Änderung fehlgeschlagen.");
        const refreshed = await fetch("/api/state", { cache: "no-store" });
        const data = await refreshed.json();
        if (!refreshed.ok)
          throw new Error(
            "Gespeichert, aber Übersicht konnte nicht aktualisiert werden. Seite neu laden.",
          );
        setMaster(data);
      }
      setModal(null);
      setToast("Änderung gespeichert.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Änderung fehlgeschlagen.");
      if (propagateError) throw e;
    } finally {
      setBusy(false);
    }
  }
  const sum = totals(state);
  const proposals = state.penalties.filter((p) => p.status === "proposed");
  const start =
    period === "month"
      ? viewDate.slice(0, 7) + "-01"
      : period === "30"
        ? new Date(new Date(viewDate + "T12:00:00Z").getTime() - 30 * 86400000)
            .toISOString()
            .slice(0, 10)
        : "";
  const filteredPenalties = state.penalties
    .filter(
      (p) =>
        (!start || p.date >= start) &&
        (playerFilter === "all" || p.playerId === playerFilter),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
  const filteredPlayers = state.players.filter((p) =>
    `${p.name} ${p.code} ${p.aliases.join(" ")}`
      .toLocaleLowerCase("de")
      .includes(query.toLocaleLowerCase("de")),
  );
  const filteredPayments = state.transactions
    .filter(
      (t) =>
        (!start || t.date >= start) &&
        (playerFilter === "all" ||
          state.allocations.some(
            (a) => a.transactionId === t.id && a.playerId === playerFilter,
          )),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  function navigate(id: Tab) {
    setTab(id);
    setQuery("");
    setPlayerFilter("all");
    setPeriod("all");
    setError("");
  }
  function exportCsv() {
    const rows: unknown[][] =
      tab === "payments"
        ? [
            ["Datum", "Kanal", "Art", "Betrag EUR", "Verwendungszweck"],
            ...filteredPayments.map((t) => [
              t.date,
              sourceLabels[t.source],
              t.kind,
              (t.amountCents / 100).toFixed(2),
              t.reference,
            ]),
          ]
        : tab === "penalties"
          ? [
              [
                "Datum",
                "Spieler-ID",
                "Spieler",
                "Grund",
                "Betrag EUR",
                "Status",
              ],
              ...filteredPenalties.map((p) => [
                p.date,
                state.players.find((x) => x.id === p.playerId)?.code,
                state.players.find((x) => x.id === p.playerId)?.name,
                p.reason,
                (p.amountCents / 100).toFixed(2),
                p.status,
              ]),
            ]
          : [
              [
                "Spieler-ID",
                "Name",
                "Vorname",
                "Nachname",
                "Kategorie",
                "Bestätigte Forderungen EUR",
                "Zugeordnete Zahlungen EUR",
                "Offen EUR",
                "Guthaben EUR",
              ],
              ...state.players.map((p) => {
                const b = playerBalance(state, p.id);
                return [
                  p.code,
                  p.name,
                  p.firstName ?? "",
                  p.lastName ?? "",
                  personCategoryLabels[p.category ?? "player"],
                  ...[b.charged, b.paid, b.open, b.credit].map((v) =>
                    (v / 100).toFixed(2),
                  ),
                ];
              }),
            ];
    downloadFile(`teamkasse-${tab}-${today()}.csv`, makeCsv(rows));
    setToast("CSV-Export erstellt.");
  }
  function open(newModal: Modal) {
    setError("");
    setModal(newModal);
  }
  return (
    <div className="app-shell" aria-busy={!hydrated} inert={!hydrated}>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="TeamKasse Startseite">
          <span className="brand-icon">
            <WalletCards size={24} />
          </span>
          <span>
            Team<span className="brand-accent">Kasse</span>
            <small>GEMEINSAM IM BLICK</small>
          </span>
        </Link>
        <div className="team-switch">
          <span className="team-badge">
            <Trophy size={21} />
          </span>
          <span>
            <strong>{state.team.name.split(" · ")[0]}</strong>
            <small>
              {state.team.name.split(" · ")[1] ?? "Mannschaftskasse"}
            </small>
          </span>
        </div>
        <span className="nav-caption">MANNSCHAFTSKASSE</span>
        <nav aria-label="Hauptnavigation">
          {nav
            .filter(
              (n) =>
                manager || !["players", "imports", "settings"].includes(n.id),
            )
            .map(({ id, icon: Icon }) => (
              <button
                key={id}
                className={`nav-item ${tab === id ? "active" : ""}`}
                onClick={() => navigate(id)}
                aria-current={tab === id ? "page" : undefined}
              >
                <Icon size={20} />
                <span>
                  {id === "dashboard" && !manager
                    ? "Mein Konto"
                    : tabLabels[id]}
                </span>
                {id === "penalties" && proposals.length > 0 && (
                  <span className="nav-count" aria-hidden="true">
                    {proposals.length}
                  </span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="team-note">
            <ShieldCheck size={21} />
            <strong>Fair. Transparent. Zusammen.</strong>
            <p>Damit die Kasse genauso rund läuft wie euer Spiel.</p>
          </div>
          <div className="profile">
            <Avatar
              name={
                state.mode === "demo" ? "Demo Nutzer" : roleLabels[state.role]
              }
            />
            <span>
              <strong>
                {state.mode === "demo" ? "Demo-Nutzer" : roleLabels[state.role]}
              </strong>
              <small>{roleLabels[state.role]}</small>
            </span>
            {state.mode === "supabase" && (
              <form action={signOut}>
                <button className="icon-button" aria-label="Abmelden">
                  <LogOut size={18} />
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Mannschaftskasse <span>/</span> <strong>{tabLabels[tab]}</strong>
          </span>
          <div className="topbar-actions">
            <span className="season">
              <span className="dot" /> Saison {new Date().getFullYear()}/
              {String(new Date().getFullYear() + 1).slice(2)}
            </span>
            <IconButton
              label={dark ? "Helles Design" : "Dunkles Design"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </IconButton>
            <span className="mobile-brand">TeamKasse</span>
          </div>
        </header>
        {state.mode === "demo" && (
          <div className="demo-banner">
            <span>
              <Sparkles size={15} />
              <strong>Demo-Modus</strong>
              <span className="demo-explainer">
                {" "}
                · Fiktive Daten, nur in diesem Browser gespeichert.
              </span>
            </span>
            <label>
              <span className="sr-only">Demo-Rolle</span>
              <select
                aria-label="Demo-Rolle"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as Role);
                  navigate("dashboard");
                }}
              >
                <option value="admin">Admin-Ansicht</option>
                <option value="cashier">Kassierer-Ansicht</option>
                <option value="player">Spieler-Ansicht</option>
              </select>
            </label>
          </div>
        )}
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="dot" /> ALLES IM TEAM
              </div>
              <h1>
                {tab === "dashboard"
                  ? manager
                    ? "Eure Kasse. Klarer Überblick."
                    : "Dein Konto. Alles im Blick."
                  : tabLabels[tab]}
              </h1>
              <p>
                {tab === "dashboard"
                  ? "Weniger Verwaltungsaufwand. Mehr Zeit auf dem Platz."
                  : tab === "players"
                    ? "Euer Team, eure Konten – transparent und übersichtlich."
                    : tab === "penalties"
                      ? "Fair erfasst. Nachvollziehbar bestätigt."
                      : tab === "payments"
                        ? "Jeder Euro findet seinen Platz."
                        : tab === "imports"
                          ? "Ein sicherer Weg von der Datei zur Mannschaftskasse."
                          : "Alles, was eure Mannschaftskasse zusammenhält."}
              </p>
            </div>
            <div className="heading-actions">
              {["dashboard", "players", "penalties", "payments"].includes(
                tab,
              ) && (
                <button className="button secondary" onClick={exportCsv}>
                  <Download size={17} />
                  <span>CSV exportieren</span>
                </button>
              )}
              {manager &&
                ["dashboard", "players", "penalties", "payments"].includes(
                  tab,
                ) && (
                  <button
                    className="button primary"
                    onClick={() =>
                      open(
                        tab === "players"
                          ? { kind: "player" }
                          : tab === "payments"
                            ? { kind: "payment" }
                            : { kind: "penalty" },
                      )
                    }
                  >
                    <Plus size={18} />
                    {tab === "players"
                      ? "Spieler hinzufügen"
                      : tab === "payments"
                        ? "Zahlung erfassen"
                        : "Strafe erfassen"}
                  </button>
                )}
            </div>
          </div>
          {error && !modal && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {tab === "dashboard" && (
            <>
              <div className="section-toolbar">
                <Filters
                  state={state}
                  period={period}
                  playerFilter={playerFilter}
                  setPeriod={setPeriod}
                  setPlayerFilter={setPlayerFilter}
                />
                <span className="muted small">
                  Kontostände: gesamte Historie
                </span>
              </div>
              <div className="metrics">
                <div className="metric featured">
                  <div className="metric-title">
                    Offene Forderungen{" "}
                    <span className="metric-icon">
                      <WalletCards size={21} />
                    </span>
                  </div>
                  <strong>{euros(sum.open)}</strong>
                  <span className="metric-sub">
                    <span className="light-dot" />
                    {
                      state.players.filter(
                        (p) => playerBalance(state, p.id).open > 0,
                      ).length
                    }{" "}
                    {manager
                      ? "Spieler mit offenem Betrag"
                      : "offenes Spielerkonto"}
                  </span>
                  <div className="metric-decoration" />
                </div>
                <div className="metric">
                  <div className="metric-title">
                    Bereits beglichen{" "}
                    <span className="metric-icon pale">
                      <CheckCircle2 size={21} />
                    </span>
                  </div>
                  <strong>{euros(sum.paid)}</strong>
                  <span className="metric-sub">
                    <span className="badge green">
                      <ArrowUpRight size={13} /> Zugeordnete Zahlungen
                    </span>
                  </span>
                </div>
                <div className="metric">
                  <div className="metric-title">
                    {manager ? "Aktive Spieler" : "Dein Guthaben"}{" "}
                    <span className="metric-icon lilac">
                      <Users size={21} />
                    </span>
                  </div>
                  <strong>
                    {manager
                      ? state.players.filter((p) => p.active).length
                      : euros(sum.credit)}
                    {manager && <span className="metric-unit">im Team</span>}
                  </strong>
                  <span className="metric-sub">
                    {manager
                      ? `${euros(sum.credit)} Guthaben in Spielerkonten`
                      : "Wird mit offenen Forderungen verrechnet"}
                  </span>
                </div>
              </div>
              {proposals.length > 0 && (
                <div className="notice">
                  <span className="notice-icon">
                    <Clock3 size={21} />
                  </span>
                  <div>
                    <strong>
                      {proposals.length}{" "}
                      {proposals.length === 1
                        ? "Strafenvorschlag wartet"
                        : "Strafenvorschläge warten"}{" "}
                      {manager ? "auf Prüfung" : "auf Bestätigung"}
                    </strong>
                    <p>
                      Vorschläge zählen erst nach der Bestätigung zu den offenen
                      Forderungen.
                    </p>
                  </div>
                  <button onClick={() => navigate("penalties")}>
                    {manager ? "Jetzt prüfen" : "Ansehen"}
                    <ArrowRight size={17} />
                  </button>
                </div>
              )}
              <div className="dashboard-grid">
                <section className="panel recent-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Letzte Forderungen</h2>
                      <p>Was zuletzt in eurer Kasse passiert ist</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("penalties")}
                    >
                      Alle ansehen <ArrowRight size={15} />
                    </button>
                  </div>
                  <PenaltyRows
                    state={state}
                    onOpen={open}
                    items={filteredPenalties.slice(0, 5)}
                    compact
                  />
                </section>
                <section className="panel balances-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{manager ? "Spielerkonten" : "Dein Spielerkonto"}</h2>
                      <p>Aktuelle offene Beträge</p>
                    </div>
                    <Users size={19} className="muted" />
                  </div>
                  <div className="balance-list">
                    {[...state.players]
                      .sort(
                        (a, b) =>
                          playerBalance(state, b.id).open -
                          playerBalance(state, a.id).open,
                      )
                      .slice(0, 5)
                      .map((p, i) => {
                        const b = playerBalance(state, p.id);
                        return (
                          <div className="balance-row" key={p.id}>
                            <Avatar name={p.name} index={i} />
                            <div>
                              <strong>{p.name}</strong>
                              <small>{p.code}</small>
                            </div>
                            <span
                              className={`money ${b.open ? "" : "text-green"}`}
                            >
                              {b.open ? (
                                euros(b.open)
                              ) : (
                                <>
                                  <Check size={13} /> Ausgeglichen
                                </>
                              )}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                  {manager && (
                    <button
                      className="panel-footer-button"
                      onClick={() => navigate("players")}
                    >
                      Alle {state.players.length} Spielerkonten{" "}
                      <ArrowRight size={16} />
                    </button>
                  )}
                </section>
              </div>
              <div className="dashboard-grid bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Letzte Zahlungen</h2>
                      <p>Sauber zugeordnet, immer nachvollziehbar</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("payments")}
                    >
                      Alle ansehen <ArrowRight size={15} />
                    </button>
                  </div>
                  {filteredPayments.slice(0, 3).map((t) => (
                    <div className="payment-preview" key={t.id}>
                      <span
                        className={`transaction-icon ${t.kind === "refund" ? "refund" : ""}`}
                      >
                        <ArrowDownLeft size={20} />
                      </span>
                      <div>
                        <strong>
                          {sourceLabels[t.source]}
                          {t.kind === "refund" ? " · Rückbuchung" : ""}
                        </strong>
                        <small>
                          {t.reference || "Ohne Verwendungszweck"} ·{" "}
                          {shortDate(t.date)}
                        </small>
                      </div>
                      <span
                        className={`money ${t.amountCents > 0 ? "text-green" : "text-red"}`}
                      >
                        {t.amountCents > 0 ? "+" : ""}
                        {euros(t.amountCents)}
                      </span>
                    </div>
                  ))}
                  {!filteredPayments.length && (
                    <Empty text="Noch keine Zahlungen erfasst." />
                  )}
                </section>
                <section className="team-spirit">
                  <div className="pitch">
                    <div className="pitch-line" />
                    <div className="pitch-circle" />
                    <Trophy size={34} />
                  </div>
                  <span className="eyebrow">EIN TEAM. EINE KASSE.</span>
                  <h2>
                    Auf dem Platz ein Team.
                    <br />
                    Bei der Kasse auch.
                  </h2>
                  <p>
                    Klare Konten sorgen für ein gutes Miteinander. Jeder sieht,
                    was ihn betrifft.
                  </p>
                  {manager && (
                    <button
                      className="text-button"
                      onClick={() => open({ kind: "payment" })}
                    >
                      Zahlung eintragen <ArrowRight size={17} />
                    </button>
                  )}
                </section>
              </div>
            </>
          )}
          {tab === "players" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Spielerübersicht{" "}
                      <span className="count-pill">{state.players.length}</span>
                    </h2>
                    <p>
                      Spieler, Trainer und Betreuer. Kontostände berücksichtigen
                      die gesamte Historie.
                    </p>
                  </div>
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Spieler suchen"
                      placeholder="Name oder Spieler-ID suchen"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Spieler</th>
                        <th>Spieler-ID</th>
                        <th>Kategorie</th>
                        <th>Offen</th>
                        <th>Guthaben</th>
                        <th>Status</th>
                        <th>
                          <span className="sr-only">Bearbeiten</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.map((p, i) => {
                        const b = playerBalance(state, p.id);
                        return (
                          <tr key={p.id}>
                            <td>
                              <div className="person-row">
                                <Avatar name={p.name} index={i} />
                                <span>
                                  <strong>{p.name}</strong>
                                  <small>
                                    {p.aliases.length
                                      ? p.aliases.join(", ")
                                      : "Kein Spitzname"}
                                  </small>
                                </span>
                              </div>
                            </td>
                            <td>
                              <code>{p.code}</code>
                            </td>
                            <td>
                              <span className="badge gray">
                                {personCategoryLabels[p.category ?? "player"]}
                              </span>
                            </td>
                            <td
                              className={`money ${b.open ? "" : "text-green"}`}
                            >
                              {euros(b.open)}
                            </td>
                            <td className="money text-green">
                              {euros(b.credit)}
                            </td>
                            <td>
                              <span
                                className={`badge ${p.active ? "green" : "gray"}`}
                              >
                                <span className="dot" />
                                {p.active ? "Aktiv" : "Deaktiviert"}
                              </span>
                            </td>
                            <td>
                              {admin && (
                                <IconButton
                                  label={`${p.name} anonymisieren`}
                                  onClick={() =>
                                    open({ kind: "privacy", player: p })
                                  }
                                >
                                  <ShieldCheck size={17} />
                                </IconButton>
                              )}
                              <IconButton
                                label={`${p.name} bearbeiten`}
                                onClick={() =>
                                  open({ kind: "player", player: p })
                                }
                              >
                                <MoreHorizontal size={20} />
                              </IconButton>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!filteredPlayers.length && (
                    <Empty text="Keine passenden Spieler gefunden." />
                  )}
                </div>
              </section>
              <PeopleImport
                state={state}
                busy={busy}
                error={error}
                onSubmit={execute}
              />
            </>
          )}
          {tab === "penalties" && (
            <>
              <div className="section-toolbar">
                <Filters
                  state={state}
                  period={period}
                  playerFilter={playerFilter}
                  setPeriod={setPeriod}
                  setPlayerFilter={setPlayerFilter}
                />
                <span className="muted small">
                  {filteredPenalties.length} Einträge
                </span>
              </div>
              <section className="panel">
                <PenaltyRows
                  state={state}
                  onOpen={open}
                  items={filteredPenalties}
                />
              </section>
              <p className="footnote">
                <ShieldCheck size={15} /> Korrekturen erfolgen durch Storno und
                einen neuen Eintrag. Die Historie bleibt erhalten.
              </p>
            </>
          )}
          {tab === "payments" && (
            <>
              <div className="section-toolbar">
                <Filters
                  state={state}
                  period={period}
                  playerFilter={playerFilter}
                  setPeriod={setPeriod}
                  setPlayerFilter={setPlayerFilter}
                />
                <span className="muted small">
                  {filteredPayments.length} Einträge
                </span>
              </div>
              <section className="panel">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Zahlung</th>
                        <th>Datum</th>
                        <th>Zuordnung</th>
                        <th>Betrag</th>
                        {manager && (
                          <th>
                            <span className="sr-only">Aktionen</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map((t) => {
                        const reversed = state.transactions.some(
                          (r) => r.reversesId === t.id,
                        );
                        const splits = state.players
                          .map((p) => ({
                            player: p,
                            amount: state.allocations
                              .filter(
                                (a) =>
                                  a.transactionId === t.id &&
                                  a.playerId === p.id,
                              )
                              .reduce((n, a) => n + a.amountCents, 0),
                          }))
                          .filter((s) => s.amount !== 0);
                        return (
                          <tr key={t.id}>
                            <td>
                              <div className="person-row">
                                <span
                                  className={`transaction-icon ${t.kind === "refund" ? "refund" : ""}`}
                                >
                                  <ArrowDownLeft size={19} />
                                </span>
                                <span>
                                  <strong>
                                    {sourceLabels[t.source]}
                                    {t.kind === "refund"
                                      ? " · Rückbuchung"
                                      : ""}
                                  </strong>
                                  <small>
                                    {t.reference || "Ohne Verwendungszweck"}
                                  </small>
                                  {reversed && (
                                    <span className="badge gray">
                                      Zurückgebucht
                                    </span>
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="muted">{shortDate(t.date)}</td>
                            <td>
                              {splits.map((s) => (
                                <small
                                  className="split-label"
                                  key={s.player.id}
                                >
                                  {s.player.name} · {euros(s.amount)}
                                </small>
                              ))}
                            </td>
                            <td
                              className={`money ${t.amountCents > 0 ? "text-green" : "text-red"}`}
                            >
                              {t.amountCents > 0 ? "+" : ""}
                              {euros(t.amountCents)}
                            </td>
                            {manager && (
                              <td>
                                {t.kind === "payment" && !reversed && (
                                  <IconButton
                                    label="Zahlung zurückbuchen"
                                    onClick={() =>
                                      open({ kind: "refund", id: t.id })
                                    }
                                  >
                                    <RotateCcw size={17} />
                                  </IconButton>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!filteredPayments.length && (
                    <Empty text="Noch keine Zahlungen in diesem Zeitraum." />
                  )}
                </div>
              </section>
              <div className="info-card">
                <ShieldCheck size={20} />
                <p>
                  Teil- und Sammelzahlungen werden auf die ältesten bestätigten
                  Forderungen verteilt. Ein Restbetrag bleibt als Guthaben.
                  Version 1 unterstützt vollständige Rückbuchungen.
                </p>
              </div>
            </>
          )}
          {tab === "imports" && (
            <>
              <div className="info-card">
                <CircleHelp size={22} />
                <div>
                  <strong>Dateiimporte prüfen und übernehmen</strong>
                  <p>
                    WhatsApp-Strafmeldungen werden anhand des Strafenkatalogs
                    vorgeschlagen. Katalogdateien und Getränkelisten haben
                    eigene Prüfmasken. Zahlungsimporte folgen später.
                  </p>
                </div>
              </div>
              <PeopleImport
                state={state}
                busy={busy}
                error={error}
                onSubmit={execute}
              />
              <WhatsAppImport
                state={state}
                busy={busy}
                error={error}
                onSubmit={execute}
              />
              <DrinksImport
                state={state}
                busy={busy}
                error={error}
                onSubmit={execute}
              />
              {admin && (
                <CatalogImport
                  state={state}
                  busy={busy}
                  onSubmit={(command) => execute(command, true)}
                />
              )}
              <div className="import-grid">
                {[
                  {
                    title: "PayPal-Transaktionen",
                    text: "CSV-Berichte mit flexibler Spaltenzuordnung, Dublettenprüfung und manueller Freigabe.",
                    tag: "CSV",
                  },
                  {
                    title: "Bankumsätze",
                    text: "Konfigurierbare CSV-Formate. CAMT.053 und regulierte PSD2-Anbieter folgen separat.",
                    tag: "CSV · später CAMT.053",
                  },
                ].map((item) => (
                  <section className="panel import-card" key={item.title}>
                    <span className="metric-icon pale">
                      <FileUp size={24} />
                    </span>
                    <h2>{item.title}</h2>
                    <p>{item.text}</p>
                    <span className="badge gray">{item.tag}</span>
                    <div className="planned">
                      Geplant · noch kein Upload verfügbar
                    </div>
                  </section>
                ))}
              </div>
              <p className="footnote">
                Keine PayPal-Zugangsdaten, Bankpasswörter oder inoffiziellen
                WhatsApp-Verbindungen.
              </p>
            </>
          )}
          {tab === "settings" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Strafenkatalog</h2>
                    <p>
                      {admin
                        ? "Verbindliche Beträge für ein faires Miteinander."
                        : "Nur Administratoren können den Katalog bearbeiten."}
                    </p>
                  </div>
                  {admin && (
                    <button
                      className="button secondary"
                      onClick={() => open({ kind: "category" })}
                    >
                      <Plus size={16} /> Kategorie
                    </button>
                  )}
                </div>
                <div className="catalog-grid">
                  {state.penaltyTypes.map((t) => (
                    <div className="catalog-card" key={t.id}>
                      <span className="catalog-icon">
                        <ListChecks size={20} />
                      </span>
                      <div>
                        <strong>{t.name}</strong>
                        <p>{t.description}</p>
                        {t.aliases.length > 0 && (
                          <p>Erkennungsbegriffe: {t.aliases.join(", ")}</p>
                        )}
                        <span
                          className={`badge ${t.active ? "green" : "gray"}`}
                        >
                          {t.active ? "Aktiv" : "Deaktiviert"}
                        </span>
                      </div>
                      <div className="catalog-amount">
                        <strong>{euros(t.amountCents)}</strong>
                        {admin && (
                          <IconButton
                            label={`${t.name} bearbeiten`}
                            onClick={() => open({ kind: "category", id: t.id })}
                          >
                            <MoreHorizontal size={18} />
                          </IconButton>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              {admin && (
                <>
                  <CatalogImport
                    state={state}
                    busy={busy}
                    onSubmit={(command) => execute(command, true)}
                  />
                  <section className="panel settings-section">
                    <div className="panel-heading">
                      <div>
                        <h2>Mitglieder & Rollen</h2>
                        <p>
                          Supabase-Auth-Konten zuvor sicher einladen. Spieler
                          sehen ausschließlich das eigene Konto.
                        </p>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => open({ kind: "member" })}
                      >
                        <Plus size={16} /> Konto zuordnen
                      </button>
                    </div>
                    <div className="member-list">
                      {state.memberships.map((m) => (
                        <div className="member-row" key={m.userId}>
                          <code>{m.userId}</code>
                          <span>
                            {m.playerId
                              ? state.players.find((p) => p.id === m.playerId)
                                  ?.name
                              : "Ohne Spielerkonto"}
                          </span>
                          <span className="badge blue">
                            {roleLabels[m.role]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="panel settings-section">
                    <div className="panel-heading">
                      <div>
                        <h2>Datenschutz & Einstellungen</h2>
                        <p>
                          Die Löschfrist gilt für importierte Nachrichtenbelege.
                          Finanzhistorie wird nicht automatisch gelöscht.
                        </p>
                      </div>
                    </div>
                    <form
                      className="settings-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void execute({
                          type: "updateSettings",
                          retentionDays: Number(f.get("retentionDays")),
                        });
                      }}
                    >
                      <label>
                        Aufbewahrung von Importbelegen (Tage)
                        <input
                          name="retentionDays"
                          type="number"
                          min={30}
                          max={3650}
                          required
                          defaultValue={state.team.retentionDays}
                          key={state.team.retentionDays}
                        />
                      </label>
                      <button className="button secondary" disabled={busy}>
                        Speichern
                      </button>
                    </form>
                    <div className="privacy-actions">
                      <button
                        className="button secondary"
                        onClick={() =>
                          downloadFile(
                            `teamkasse-daten-${today()}.json`,
                            JSON.stringify(state, null, 2),
                            "application/json",
                          )
                        }
                      >
                        <Download size={16} /> Berechtigte Daten exportieren
                      </button>
                      {state.mode === "demo" && (
                        <button
                          className="button secondary"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Alle lokalen Demo-Änderungen löschen und fiktive Beispieldaten neu laden?",
                              )
                            ) {
                              setMaster(createDemo());
                              setRole("admin");
                              setToast("Demo zurückgesetzt.");
                            }
                          }}
                        >
                          <RotateCcw size={16} /> Demo zurücksetzen
                        </button>
                      )}
                    </div>
                    <p className="muted small settings-description">
                      Spielerkonten können in der Spielerübersicht anonymisiert
                      werden. Auth-Konten und externe Backups behandelt der
                      Betreiber separat; siehe README.
                    </p>
                  </section>
                  <section className="panel settings-section">
                    <div className="panel-heading">
                      <div>
                        <h2>Änderungsprotokoll</h2>
                        <p>
                          Die letzten {state.auditLogs.length} Änderungen. Nur
                          für Administratoren.
                        </p>
                      </div>
                      <ShieldCheck size={20} />
                    </div>
                    <div className="audit-list">
                      {state.auditLogs.map((a) => (
                        <div className="audit-row" key={a.id}>
                          <span className="audit-dot" />
                          <div>
                            <strong>{a.summary}</strong>
                            <small>{a.actor}</small>
                          </div>
                          <time>
                            {new Date(a.createdAt).toLocaleString("de-DE", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
          {!manager && (
            <div className="info-card">
              <ShieldCheck size={20} />
              <div>
                <p>
                  Dein vollständiger Datenauszug enthält nur dein Spielerkonto.
                  Eine Konto-Anonymisierung kannst du beim Teamadministrator
                  beantragen.
                </p>
                <button
                  className="text-button"
                  onClick={() =>
                    downloadFile(
                      `teamkasse-mein-konto-${today()}.json`,
                      JSON.stringify(state, null, 2),
                      "application/json",
                    )
                  }
                >
                  Meine Daten exportieren <Download size={15} />
                </button>
              </div>
            </div>
          )}
          <footer className="footer">
            <span>
              <WalletCards size={14} /> TeamKasse{" "}
              <span className="footer-dot">·</span> Für das Team gemacht.
            </span>
            <span>
              <ShieldCheck size={14} />{" "}
              {state.mode === "demo"
                ? "Lokale Demo · keine echten Finanzdaten"
                : "Zugriff durch Supabase RLS geschützt"}
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile Navigation">
        {nav
          .filter(
            (n) =>
              manager || !["players", "imports", "settings"].includes(n.id),
          )
          .map(({ id, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={tab === id ? "active" : ""}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{tabLabels[id]}</span>
            </button>
          ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <EntryDialog
          modal={modal}
          state={state}
          busy={busy}
          error={error}
          onClose={() => !busy && setModal(null)}
          onSubmit={execute}
        />
      )}
    </div>
  );
}

function EntryDialog({
  modal,
  state,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  modal: NonNullable<Modal>;
  state: AppState;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (c: Command) => Promise<void>;
}) {
  const titles = {
    player:
      modal.kind === "player" && modal.player
        ? "Spieler bearbeiten"
        : "Spieler hinzufügen",
    penalty: "Strafe erfassen",
    payment: "Zahlung erfassen",
    status: "Strafeneintrag prüfen",
    refund: "Zahlung zurückbuchen",
    category: "Strafenkategorie",
    member: "Mitglied zuordnen",
    privacy: "Spielerkonto anonymisieren",
  };
  const [localError, setLocalError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [splits, setSplits] = useState([
    { playerId: state.players[0]?.id ?? "", amount: "" },
  ]);
  const [splitMode, setSplitMode] = useState(false);
  const category =
    modal.kind === "category"
      ? state.penaltyTypes.find((t) => t.id === modal.id)
      : null;
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialogRef.current;
    d?.showModal();
    return () => d?.close();
  }, [dialogRef]);
  const type = state.penaltyTypes.find((t) => t.id === selectedCategory);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError("");
    const f = new FormData(e.currentTarget);
    const str = (n: string) => String(f.get(n) ?? "").trim();
    try {
      let command: Command;
      switch (modal.kind) {
        case "player":
          command = {
            type: "savePlayer",
            ...(modal.player ? { id: modal.player.id } : {}),
            name: str("name"),
            category: str("category") as "player" | "coach" | "staff",
            code: str("code"),
            aliases: str("aliases")
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean),
            active: f.get("active") === "on",
          };
          break;
        case "penalty":
          command = {
            type: "addPenalty",
            playerId: str("playerId"),
            typeId: str("typeId") || null,
            amountCents: parseEuros(str("amount")),
            reason: str("reason"),
            date: str("date"),
            status: str("status") as "proposed" | "confirmed",
          };
          break;
        case "payment":
          command = {
            type: "addPayment",
            amountCents: parseEuros(paymentAmount),
            date: str("date"),
            source: str("source") as "cash" | "bank" | "paypal",
            reference: str("reference"),
            externalId: str("externalId") || null,
            splits: splits.map((s) => ({
              playerId: s.playerId,
              amountCents: parseEuros(splitMode ? s.amount : paymentAmount),
            })),
          };
          break;
        case "status":
          command = {
            type: "setPenaltyStatus",
            id: modal.penalty.id,
            status: modal.status,
            note: str("note"),
          };
          break;
        case "refund":
          command = {
            type: "refundPayment",
            id: modal.id,
            note: str("note"),
            date: str("date"),
          };
          break;
        case "category":
          command = {
            type: "savePenaltyType",
            ...(category ? { id: category.id } : {}),
            name: str("name"),
            description: str("description"),
            aliases: str("categoryAliases")
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean),
            amountCents: parseEuros(str("amount")),
            active: f.get("active") === "on",
          };
          break;
        case "privacy":
          command = {
            type: "anonymizePlayer",
            playerId: modal.player.id,
            confirmation: str("confirmation") as "ANONYMISIEREN",
          };
          break;
        case "member":
          command = {
            type: "setMembership",
            userId: str("userId"),
            role: str("role") as Role,
            playerId: str("playerId") || null,
          };
          break;
      }
      await onSubmit(command);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Eingaben prüfen.");
    }
  }
  return (
    <dialog
      ref={dialogRef}
      className="entry-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-header">
        <div>
          <span className="eyebrow">TEAMKASSE</span>
          <h2 id="dialog-title">{titles[modal.kind]}</h2>
        </div>
        <IconButton label="Dialog schließen" onClick={onClose}>
          <X size={22} />
        </IconButton>
      </div>
      <form onSubmit={submit} className="entry-form">
        {(error || localError) && (
          <div className="error" role="alert">
            {localError || error}
          </div>
        )}
        {modal.kind === "player" && (
          <>
            <label>
              Name
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={modal.player?.name}
                placeholder="Vor- und Nachname"
              />
            </label>
            <label>
              Kategorie
              <select
                name="category"
                defaultValue={modal.player?.category ?? "player"}
              >
                {Object.entries(personCategoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Spieler-ID
              <input
                name="code"
                required
                pattern="[Mm][Kk]-[0-9]{3,6}"
                maxLength={9}
                defaultValue={
                  modal.player?.code ??
                  `MK-${String(Math.max(0, ...state.players.map((p) => Number(p.code.slice(3)))) + 1).padStart(3, "0")}`
                }
              />
              <small>Eindeutig im Team, z. B. MK-017.</small>
            </label>
            <label>
              Spitznamen & Namensvarianten
              <input
                name="aliases"
                maxLength={1000}
                defaultValue={modal.player?.aliases.join(", ")}
                placeholder="Max, Maxi – durch Kommas getrennt"
              />
            </label>
            <label className="checkbox-label">
              <input
                name="active"
                type="checkbox"
                defaultChecked={modal.player?.active ?? true}
              />{" "}
              Spieler ist aktiv
            </label>
          </>
        )}
        {modal.kind === "penalty" && (
          <>
            <label>
              Spieler
              <select name="playerId" aria-label="Spieler" required>
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
              Strafenkategorie
              <select
                name="typeId"
                aria-label="Strafenkategorie"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">Individuelle Strafe</option>
                {state.penaltyTypes
                  .filter((t) => t.active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {euros(t.amountCents)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Betrag in Euro
                <input
                  key={`amount-${selectedCategory}`}
                  name="amount"
                  inputMode="decimal"
                  required
                  defaultValue={type ? (type.amountCents / 100).toFixed(2) : ""}
                  placeholder="5,00"
                />
              </label>
              <label>
                Datum
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={today()}
                />
              </label>
            </div>
            <label>
              Grund
              <input
                key={`reason-${selectedCategory}`}
                name="reason"
                required
                minLength={3}
                maxLength={500}
                defaultValue={type?.name ?? ""}
                placeholder="Was ist passiert?"
              />
            </label>
            <label>
              Status
              <select name="status" aria-label="Status">
                <option value="confirmed">
                  Bestätigt – zählt zur offenen Forderung
                </option>
                <option value="proposed">
                  Vorschlag – muss noch bestätigt werden
                </option>
              </select>
            </label>
          </>
        )}
        {modal.kind === "payment" && (
          <>
            <div className="form-grid">
              <label>
                Betrag in Euro
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="10,00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </label>
              <label>
                Datum
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={today()}
                />
              </label>
            </div>
            <label>
              Zahlungsweg
              <select name="source" aria-label="Zahlungsweg">
                <option value="paypal">PayPal</option>
                <option value="bank">Bank</option>
                <option value="cash">Barzahlung</option>
              </select>
            </label>
            <label>
              Verwendungszweck
              <input
                name="reference"
                maxLength={200}
                placeholder="MK-017 Mannschaftskasse"
              />
            </label>
            <label>
              Transaktions-ID (optional)
              <input
                name="externalId"
                maxLength={200}
                placeholder="Eindeutige ID aus Zahlungsbeleg"
              />
              <small>Eine wiederholte ID wird je Zahlungsweg abgewiesen.</small>
            </label>
            <div className="split-heading">
              <strong>Spielerzuordnung</strong>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={splitMode}
                  onChange={(e) => {
                    setSplitMode(e.target.checked);
                    setSplits([
                      { playerId: splits[0].playerId, amount: paymentAmount },
                    ]);
                  }}
                />{" "}
                Sammelzahlung
              </label>
            </div>
            {splits.map((s, i) => (
              <div className="split-inputs" key={i}>
                <label>
                  <span className="sr-only">Spieler {i + 1}</span>
                  <select
                    aria-label={`Zahlung Spieler ${i + 1}`}
                    value={s.playerId}
                    onChange={(e) =>
                      setSplits(
                        splits.map((row, index) =>
                          index === i
                            ? { ...row, playerId: e.target.value }
                            : row,
                        ),
                      )
                    }
                    required
                  >
                    {state.players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.code}
                      </option>
                    ))}
                  </select>
                </label>
                {splitMode && (
                  <>
                    <label>
                      <span className="sr-only">Teilbetrag {i + 1}</span>
                      <input
                        aria-label={`Teilbetrag ${i + 1}`}
                        inputMode="decimal"
                        required
                        placeholder="5,00"
                        value={s.amount}
                        onChange={(e) =>
                          setSplits(
                            splits.map((row, index) =>
                              index === i
                                ? { ...row, amount: e.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </label>
                    {splits.length > 1 && (
                      <IconButton
                        label="Teilzahlung entfernen"
                        onClick={() =>
                          setSplits(splits.filter((_, index) => index !== i))
                        }
                      >
                        <X size={16} />
                      </IconButton>
                    )}
                  </>
                )}
              </div>
            ))}
            {splitMode && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setSplits([
                    ...splits,
                    {
                      playerId:
                        state.players.find(
                          (p) => !splits.some((s) => s.playerId === p.id),
                        )?.id ?? "",
                      amount: "",
                    },
                  ])
                }
                disabled={splits.length >= state.players.length}
              >
                <Plus size={15} /> Weiteren Spieler hinzufügen
              </button>
            )}
            <p className="form-hint">
              Die Aufteilung muss exakt dem Betrag entsprechen. Teilzahlungen
              sind möglich; ein Restbetrag wird als Guthaben ausgewiesen.
            </p>
          </>
        )}
        {modal.kind === "status" && (
          <>
            <div className="dialog-summary">
              <strong>{modal.penalty.reason}</strong>
              <span>
                {euros(modal.penalty.amountCents)} ·{" "}
                {
                  state.players.find((p) => p.id === modal.penalty.playerId)
                    ?.name
                }
              </span>
            </div>
            {modal.penalty.evidenceExcerpt && (
              <blockquote className="whatsapp-evidence">
                WhatsApp-Beleg: {modal.penalty.evidenceExcerpt}
              </blockquote>
            )}
            <p>
              {modal.status === "confirmed"
                ? "Mit der Bestätigung wird die Strafe verbindlich."
                : modal.status === "cancelled"
                  ? "Die Forderung wird storniert. Bereits zugeordnete Zahlungen bleiben als Guthaben erhalten."
                  : "Der Vorschlag wird abgelehnt und erzeugt keine Forderung."}
            </p>
            <label>
              Begründung / Vermerk
              <textarea
                name="note"
                required
                minLength={3}
                maxLength={500}
                placeholder="Nachvollziehbarer Prüfvermerk"
              />
            </label>
          </>
        )}
        {modal.kind === "refund" && (
          <>
            <p>
              Die gesamte Zahlung wird als separate negative Transaktion
              zurückgebucht. Offene Forderungen werden wiederhergestellt. Der
              ursprüngliche Eintrag bleibt erhalten.
            </p>
            <label>
              Grund
              <textarea
                name="note"
                required
                minLength={3}
                maxLength={200}
                placeholder="Grund der Rückbuchung"
              />
            </label>
            <label>
              Datum
              <input name="date" type="date" required defaultValue={today()} />
            </label>
          </>
        )}
        {modal.kind === "category" && (
          <>
            <label>
              Kategorie
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={category?.name}
              />
            </label>
            <label>
              Betrag in Euro
              <input
                name="amount"
                inputMode="decimal"
                required
                defaultValue={
                  category ? (category.amountCents / 100).toFixed(2) : ""
                }
              />
            </label>
            <label>
              Erkennungsbegriffe (kommagetrennt)
              <input
                name="categoryAliases"
                defaultValue={category?.aliases.join(", ")}
                maxLength={3029}
                placeholder="z. B. Deckel, Kronkorken, Bierdeckel"
              />
            </label>
            <p className="form-hint">
              Kurzformen und Synonyme für den WhatsApp-Import. Eindeutige
              Begriffe verwenden; keine automatische KI-Erkennung.
            </p>
            <label>
              Beschreibung
              <textarea
                name="description"
                maxLength={500}
                defaultValue={category?.description}
              />
            </label>
            <label className="checkbox-label">
              <input
                name="active"
                type="checkbox"
                defaultChecked={category?.active ?? true}
              />{" "}
              Kategorie aktiv
            </label>
            <p className="form-hint">
              Änderungen am Katalog verändern keine bereits erfassten Strafen.
            </p>
          </>
        )}
        {modal.kind === "member" && (
          <>
            <p>
              Auth-Benutzer vorher über Supabase einladen. Diese Aktion ordnet
              ein bestehendes Konto zu oder ändert seine Rolle.
            </p>
            <label>
              Auth-Benutzer-ID
              <input
                name="userId"
                required
                placeholder="UUID aus Supabase Auth"
              />
            </label>
            <label>
              Rolle
              <select name="role" aria-label="Rolle">
                <option value="player">Spieler</option>
                <option value="cashier">Kassierer</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <label>
              Spielerkonto
              <select name="playerId" aria-label="Spielerkonto">
                <option value="">
                  Keine Zuordnung (nur Kassierer / Admin)
                </option>
                {state.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.code}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {modal.kind === "privacy" && (
          <>
            <p>
              <strong>
                {modal.player.name} · {modal.player.code}
              </strong>
            </p>
            <p>
              Name, Aliasse, Strafgründe, zugehörige Verwendungszwecke und
              Freitext-Snapshots im Teamprotokoll werden entfernt.
              Spielerzugriff wird entzogen. IDs, Beträge und Buchungshistorie
              bleiben erhalten. Das Supabase-Auth-Konto und externe Backups muss
              der Betreiber separat behandeln.
            </p>
            <label>
              Zur Bestätigung ANONYMISIEREN eingeben
              <input
                name="confirmation"
                required
                pattern="ANONYMISIEREN"
                autoComplete="off"
              />
            </label>
          </>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Abbrechen
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy
              ? "Wird gespeichert …"
              : modal.kind === "status"
                ? {
                    confirmed: "Bestätigen",
                    rejected: "Ablehnen",
                    cancelled: "Stornieren",
                  }[modal.status]
                : modal.kind === "refund"
                  ? "Zurückbuchen"
                  : "Speichern"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}

function PenaltyRows({
  items,
  compact = false,
  state,
  onOpen,
}: {
  items: Penalty[];
  compact?: boolean;
  state: AppState;
  onOpen: (modal: Modal) => void;
}) {
  const manager = canManage(state.role);
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Spieler & Grund</th>
            {!compact && <th>Datum</th>}
            <th>Betrag</th>
            <th>Status</th>
            {manager && (
              <th>
                <span className="sr-only">Aktionen</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const player = state.players.find((x) => x.id === p.playerId);
            const paid = penaltyPaid(p, state.allocations);
            const label =
              p.status === "confirmed"
                ? paid >= p.amountCents
                  ? "Bezahlt"
                  : paid > 0
                    ? "Teilbezahlt"
                    : "Offen"
                : {
                    proposed: "Vorschlag",
                    cancelled: "Storniert",
                    rejected: "Abgelehnt",
                  }[p.status];
            const tone =
              p.status === "confirmed" && paid >= p.amountCents
                ? "green"
                : p.status === "proposed"
                  ? "blue"
                  : p.status === "confirmed"
                    ? "amber"
                    : "gray";
            return (
              <tr key={p.id}>
                <td>
                  <div className="person-row">
                    <Avatar
                      name={player?.name ?? "?"}
                      index={state.players.findIndex(
                        (x) => x.id === p.playerId,
                      )}
                    />
                    <span>
                      <strong>{player?.name ?? "Unbekannt"}</strong>
                      <small>{p.reason}</small>
                      {p.source === "drinks" && (
                        <small>Getränkeforderung</small>
                      )}
                      {p.source === "whatsapp" && (
                        <small>Quelle: WhatsApp</small>
                      )}
                      {p.correctionNote && (
                        <small>Vermerk: {p.correctionNote}</small>
                      )}
                    </span>
                  </div>
                </td>
                {!compact && <td className="muted">{shortDate(p.date)}</td>}
                <td className="money">{euros(p.amountCents)}</td>
                <td>
                  <span className={`badge ${tone}`}>
                    <span className="dot" />
                    {label}
                  </span>
                </td>
                {manager && (
                  <td>
                    <div className="row-actions">
                      {p.status === "proposed" ? (
                        <>
                          <IconButton
                            label="Strafe bestätigen"
                            onClick={() => {
                              onOpen({
                                kind: "status",
                                penalty: p,
                                status: "confirmed",
                              });
                            }}
                          >
                            <Check size={17} />
                          </IconButton>
                          <IconButton
                            label="Strafe ablehnen"
                            onClick={() => {
                              onOpen({
                                kind: "status",
                                penalty: p,
                                status: "rejected",
                              });
                            }}
                          >
                            <X size={17} />
                          </IconButton>
                        </>
                      ) : p.status === "confirmed" ? (
                        <IconButton
                          label="Strafe stornieren"
                          onClick={() => {
                            onOpen({
                              kind: "status",
                              penalty: p,
                              status: "cancelled",
                            });
                          }}
                        >
                          <MoreHorizontal size={18} />
                        </IconButton>
                      ) : null}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!items.length && (
        <Empty text="Für diese Auswahl gibt es keine Forderungen." />
      )}
    </div>
  );
}
function Filters({
  state,
  period,
  playerFilter,
  setPeriod,
  setPlayerFilter,
}: {
  state: AppState;
  period: string;
  playerFilter: string;
  setPeriod: (value: string) => void;
  setPlayerFilter: (value: string) => void;
}) {
  const manager = canManage(state.role);
  return (
    <div className="filters">
      <label className="select-wrap">
        <Clock3 size={16} />
        <select
          aria-label="Zeitraum"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="all">Alle Zeiträume</option>
          <option value="month">Dieser Monat</option>
          <option value="30">Letzte 30 Tage</option>
        </select>
      </label>
      {manager && (
        <label className="select-wrap">
          <Users size={16} />
          <select
            aria-label="Spielerfilter"
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
          >
            <option value="all">Alle Spieler</option>
            {state.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
