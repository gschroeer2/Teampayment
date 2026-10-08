import type { Allocation, AppState, Penalty, Player } from "./types";
import { authorize, commandSchema, type Command } from "./commands";
export function euros(cents: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
export function parseEuros(value: string): number {
  const clean = value.trim().replace(/\s|€/g, "");
  if (!/^\d{1,7}([,.]\d{1,2})?$/.test(clean))
    throw new Error(
      "Betrag bitte als Euro mit maximal zwei Nachkommastellen eingeben.",
    );
  const [whole, fraction = ""] = clean.split(/[,.]/);
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_000)
    throw new Error("Betrag muss zwischen 0,01 und 1.000.000 Euro liegen.");
  return cents;
}
export function penaltyPaid(penalty: Penalty, allocations: Allocation[]) {
  return allocations
    .filter((a) => a.penaltyId === penalty.id)
    .reduce((n, a) => n + a.amountCents, 0);
}
export function playerBalance(
  state: Pick<AppState, "penalties" | "allocations">,
  playerId: string,
) {
  const charged = state.penalties
    .filter((p) => p.playerId === playerId && p.status === "confirmed")
    .reduce((n, p) => n + p.amountCents, 0);
  const paid = state.allocations
    .filter((a) => a.playerId === playerId)
    .reduce((n, a) => n + a.amountCents, 0);
  return {
    charged,
    paid,
    open: Math.max(0, charged - paid),
    credit: Math.max(0, paid - charged),
  };
}
export function totals(state: AppState) {
  return state.players.reduce(
    (n, p) => {
      const b = playerBalance(state, p.id);
      return {
        open: n.open + b.open,
        paid: n.paid + Math.min(b.charged, b.paid),
        credit: n.credit + b.credit,
      };
    },
    { open: 0, paid: 0, credit: 0 },
  );
}
export function normalizeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function identifyPlayer(
  text: string,
  players: Player[],
): { playerId: string | null; ambiguous: boolean } {
  const normalized = ` ${normalizeName(text)} `;
  const byCode = players.filter((p) =>
    normalized.includes(` ${normalizeName(p.code)} `),
  );
  const matches = byCode.length
    ? byCode
    : players.filter((p) =>
        [p.name, ...p.aliases].some(
          (n) => n.length > 1 && normalized.includes(` ${normalizeName(n)} `),
        ),
      );
  return {
    playerId: matches.length === 1 ? matches[0].id : null,
    ambiguous: matches.length > 1,
  };
}
/** Pure, immutable demo engine. Live writes use the atomic PostgreSQL RPC. */
export function applyCommand(
  current: AppState,
  input: Command,
  uuid: () => string = () => crypto.randomUUID(),
  now = new Date().toISOString(),
): AppState {
  const command = commandSchema.parse(input);
  authorize(current.role, command);
  const state = structuredClone(current);
  const teamId = state.team.id;
  const getPlayer = (id: string) => {
    const p = state.players.find((p) => p.id === id && p.teamId === teamId);
    if (!p) throw new Error("Spieler nicht gefunden.");
    return p;
  };
  let summary = "";
  switch (command.type) {
    case "savePlayer": {
      if (
        state.players.some(
          (p) => p.code === command.code && p.id !== command.id,
        )
      )
        throw new Error("Spieler-ID ist bereits vergeben.");
      const player = {
        id: command.id ?? uuid(),
        teamId,
        name: command.name,
        code: command.code,
        aliases: command.aliases,
        active: command.active,
      };
      if (command.id) {
        getPlayer(command.id);
        state.players = state.players.map((p) =>
          p.id === command.id ? player : p,
        );
      } else state.players.push(player);
      summary = `Spieler ${command.code} ${command.id ? "aktualisiert" : "angelegt"}`;
      break;
    }
    case "addPenalty": {
      const player = getPlayer(command.playerId);
      if (!player.active) throw new Error("Dieser Spieler ist deaktiviert.");
      if (
        command.typeId &&
        !state.penaltyTypes.some((t) => t.id === command.typeId && t.active)
      )
        throw new Error("Strafenkategorie ist nicht aktiv.");
      state.penalties.push({ id: uuid(), teamId, ...command, createdAt: now });
      summary = `Strafe für ${player.code}: ${euros(command.amountCents)}`;
      break;
    }
    case "setPenaltyStatus": {
      const p = state.penalties.find((p) => p.id === command.id);
      if (!p) throw new Error("Strafe nicht gefunden.");
      if (!(
        (p.status === "proposed" &&
          ["confirmed", "rejected"].includes(command.status)) ||
        (p.status === "confirmed" && command.status === "cancelled")
      ))
        throw new Error("Statuswechsel nicht möglich.");
      p.status = command.status;
      p.correctionNote = command.note;
      if (command.status === "cancelled")
        state.allocations = state.allocations.map((a) =>
          a.penaltyId === p.id ? { ...a, penaltyId: null } : a,
        );
      summary = `Strafe ${command.status}: ${command.note}`;
      break;
    }
    case "addPayment": {
      if (
        command.splits.reduce((n, s) => n + s.amountCents, 0) !==
        command.amountCents
      )
        throw new Error(
          "Die Aufteilung muss exakt dem Zahlungsbetrag entsprechen.",
        );
      if (
        new Set(command.splits.map((s) => s.playerId)).size !==
        command.splits.length
      )
        throw new Error(
          "Jeder Spieler darf nur einmal in der Aufteilung vorkommen.",
        );
      if (
        command.externalId &&
        state.transactions.some(
          (t) =>
            t.source === command.source && t.externalId === command.externalId,
        )
      )
        throw new Error("Diese Transaktion wurde bereits erfasst.");
      const transactionId = uuid();
      state.transactions.push({
        id: transactionId,
        teamId,
        amountCents: command.amountCents,
        date: command.date,
        source: command.source,
        reference: command.reference,
        externalId: command.externalId,
        kind: "payment",
        reversesId: null,
        createdAt: now,
      });
      for (const split of command.splits) {
        getPlayer(split.playerId);
        let left = split.amountCents;
        const penalties = state.penalties
          .filter(
            (p) => p.playerId === split.playerId && p.status === "confirmed",
          )
          .sort(
            (a, b) =>
              a.date.localeCompare(b.date) ||
              a.createdAt.localeCompare(b.createdAt) ||
              a.id.localeCompare(b.id),
          );
        for (const p of penalties) {
          const value = Math.min(
            left,
            Math.max(0, p.amountCents - penaltyPaid(p, state.allocations)),
          );
          if (value > 0) {
            state.allocations.push({
              id: uuid(),
              teamId,
              transactionId,
              playerId: split.playerId,
              penaltyId: p.id,
              amountCents: value,
            });
            left -= value;
          }
          if (!left) break;
        }
        if (left > 0)
          state.allocations.push({
            id: uuid(),
            teamId,
            transactionId,
            playerId: split.playerId,
            penaltyId: null,
            amountCents: left,
          });
      }
      summary = `Zahlung erfasst: ${euros(command.amountCents)}`;
      break;
    }
    case "refundPayment": {
      const original = state.transactions.find(
        (t) => t.id === command.id && t.kind === "payment",
      );
      if (!original) throw new Error("Zahlung nicht gefunden.");
      if (state.transactions.some((t) => t.reversesId === original.id))
        throw new Error("Diese Zahlung wurde bereits zurückgebucht.");
      const txId = uuid();
      state.transactions.push({
        id: txId,
        teamId,
        amountCents: -original.amountCents,
        date: command.date,
        source: original.source,
        reference: command.note,
        externalId: null,
        kind: "refund",
        reversesId: original.id,
        createdAt: now,
      });
      state.allocations.push(
        ...state.allocations
          .filter((a) => a.transactionId === original.id)
          .map((a) => ({
            ...a,
            id: uuid(),
            transactionId: txId,
            amountCents: -a.amountCents,
          })),
      );
      summary = `Zahlung zurückgebucht: ${euros(original.amountCents)} – ${command.note}`;
      break;
    }
    case "savePenaltyType": {
      if (command.id && !state.penaltyTypes.some((p) => p.id === command.id))
        throw new Error("Kategorie nicht gefunden.");
      const category = {
        id: command.id ?? uuid(),
        teamId,
        name: command.name,
        description: command.description,
        amountCents: command.amountCents,
        active: command.active,
      };
      state.penaltyTypes = command.id
        ? state.penaltyTypes.map((t) => (t.id === command.id ? category : t))
        : [...state.penaltyTypes, category];
      summary = `Strafenkatalog: ${command.name}`;
      break;
    }
    case "anonymizePlayer": {
      const player = getPlayer(command.playerId);
      player.name = "Anonymisierter Spieler";
      player.aliases = [];
      player.active = false;
      for (const penalty of state.penalties.filter(
        (p) => p.playerId === player.id,
      )) {
        penalty.reason = "Grund anonymisiert";
        delete penalty.correctionNote;
      }
      const transactions = new Set(
        state.allocations
          .filter((a) => a.playerId === player.id)
          .map((a) => a.transactionId),
      );
      for (const t of state.transactions)
        if (transactions.has(t.id))
          t.reference = "Verwendungszweck anonymisiert";
      state.memberships = state.memberships
        .filter((m) => !(m.role === "player" && m.playerId === player.id))
        .map((m) => (m.playerId === player.id ? { ...m, playerId: null } : m));
      state.auditLogs = state.auditLogs.map((a) => ({
        ...a,
        summary: a.action,
        actor: "Identität entfernt",
      }));
      summary = `Spielerkonto ${player.code} anonymisiert`;
      break;
    }
    case "updateSettings":
      state.team.retentionDays = command.retentionDays;
      summary = `Löschfrist: ${command.retentionDays} Tage`;
      break;
    case "setMembership": {
      if (command.role === "player" && !command.playerId)
        throw new Error("Spielerrolle benötigt eine Spielerzuordnung.");
      if (command.playerId) getPlayer(command.playerId);
      if (
        state.memberships.some(
          (m) =>
            m.userId !== command.userId &&
            m.playerId &&
            m.playerId === command.playerId,
        )
      )
        throw new Error("Spieler hat bereits eine Konto-Zuordnung.");
      const old = state.memberships.find((m) => m.userId === command.userId);
      if (
        old?.role === "admin" &&
        command.role !== "admin" &&
        state.memberships.filter((m) => m.role === "admin").length === 1
      )
        throw new Error("Der letzte Administrator kann nicht entfernt werden.");
      state.memberships = state.memberships.filter(
        (m) => m.userId !== command.userId,
      );
      state.memberships.push({
        userId: command.userId,
        role: command.role,
        playerId: command.playerId,
      });
      summary = `Mitgliedsrolle: ${command.role}`;
      break;
    }
  }
  // Apply unused credit to confirmed demands without changing receipt totals.
  for (const player of state.players) {
    const credits = state.allocations.filter(
      (a) =>
        a.playerId === player.id &&
        !a.penaltyId &&
        a.amountCents > 0 &&
        !state.transactions.some((t) => t.reversesId === a.transactionId),
    );
    const demands = state.penalties
      .filter((p) => p.playerId === player.id && p.status === "confirmed")
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      );
    for (const credit of credits)
      for (const demand of demands) {
        const used = Math.min(
          credit.amountCents,
          Math.max(
            0,
            demand.amountCents - penaltyPaid(demand, state.allocations),
          ),
        );
        if (!used) continue;
        if (used === credit.amountCents) {
          credit.penaltyId = demand.id;
          break;
        }
        credit.amountCents -= used;
        state.allocations.push({
          ...credit,
          id: uuid(),
          penaltyId: demand.id,
          amountCents: used,
        });
      }
  }
  state.auditLogs.unshift({
    id: uuid(),
    teamId,
    action: command.type,
    actor: "Demo-Administrator",
    createdAt: now,
    summary,
  });
  return state;
}
/** Demo role simulation is never an authorization mechanism for live data. */
export function visibleState(
  state: AppState,
  role: AppState["role"],
  playerId: string | null,
): AppState {
  if (role !== "player")
    return {
      ...state,
      role,
      playerId,
      auditLogs: role === "admin" ? state.auditLogs : [],
      memberships: role === "admin" ? state.memberships : [],
    };
  const allocations = state.allocations.filter((a) => a.playerId === playerId);
  return {
    ...state,
    role,
    playerId,
    players: state.players.filter((p) => p.id === playerId),
    penalties: state.penalties.filter((p) => p.playerId === playerId),
    allocations,
    auditLogs: [],
    memberships: [],
    transactions: state.transactions
      .filter((t) => allocations.some((a) => a.transactionId === t.id))
      .map((t) => ({
        ...t,
        reference: "Eigener Zahlungsanteil",
        externalId: null,
        amountCents: allocations
          .filter((a) => a.transactionId === t.id)
          .reduce((n, a) => n + a.amountCents, 0),
      })),
  };
}
