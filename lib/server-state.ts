import "server-only";
import { serverClient } from "./supabase/server";
import type { DatabaseSnapshot } from "./database-types";
import type { AppState } from "./types";
export class AccessError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function getContext() {
  const supabase = await serverClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new AccessError("Bitte anmelden.", 401);
  // The first team is used in v1. Never accept a team or role from the browser.
  const { data: member, error: memberError } = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", user.id)
    .order("team_id")
    .limit(1)
    .maybeSingle();
  if (memberError)
    throw new AccessError("Mitgliedschaft konnte nicht geladen werden.", 503);
  if (!member)
    throw new AccessError(
      "Noch keine Teamzuordnung. Bitte den Administrator kontaktieren.",
      403,
    );
  return { supabase, user, member };
}
export async function loadState(): Promise<AppState> {
  const { supabase, member } = await getContext();
  const { data: snapshot, error } = await supabase.rpc("teamkasse_state", {
    p_team: member.team_id,
  });
  if (error || !snapshot?.team)
    throw new AccessError(
      "Daten konnten nicht geladen werden. Datenbankmigration und Verbindung prüfen.",
      503,
    );
  const data = snapshot as DatabaseSnapshot;
  const team = { data: data.team };
  const players = { data: data.players },
    types = { data: data.penalty_types },
    penalties = { data: data.penalties };
  const transactions = { data: data.transactions },
    allocations = { data: data.allocations },
    audits = { data: data.audit_logs },
    memberships = { data: data.memberships };
  const d = team.data!;
  return {
    mode: "supabase",
    imports: (data.import_batches ?? []).map((r) => ({
      source: r.source,
      hash: r.file_hash,
    })),
    drinkConsumptions: (data.drink_consumptions ?? []).map((r) => ({
      id: r.id,
      playerId: r.player_id,
      date: r.date,
      listKey: r.list_key,
      count: r.count,
      unitPriceCents: r.unit_price_cents,
      penaltyId: r.penalty_id,
      imageHash: r.image_hash,
    })),
    role: member.role,
    playerId: member.player_id,
    team: { id: d.id, name: d.name, retentionDays: d.retention_days },
    players: (players.data ?? []).map((p) => ({
      id: p.id,
      teamId: p.team_id,
      code: p.code,
      name: p.name,
      aliases: p.aliases,
      active: p.active,
    })),
    penaltyTypes: (types.data ?? []).map((p) => ({
      id: p.id,
      teamId: p.team_id,
      name: p.name,
      description: p.description,
      aliases: p.aliases ?? [],
      amountCents: p.amount_cents,
      active: p.active,
    })),
    penalties: (penalties.data ?? []).map((p) => ({
      id: p.id,
      teamId: p.team_id,
      playerId: p.player_id,
      typeId: p.type_id,
      amountCents: p.amount_cents,
      reason: p.reason,
      date: p.date,
      status: p.status,
      createdAt: p.created_at,
      correctionNote: p.correction_note ?? undefined,
      source: p.source,
      sourceHash: p.source_hash ?? undefined,
      evidenceExcerpt: p.evidence_excerpt ?? undefined,
    })),
    transactions: (transactions.data ?? []).map(
      (t: Record<string, unknown>) => ({
        id: String(t.id),
        teamId: String(t.team_id),
        amountCents: Number(t.amount_cents),
        date: String(t.date),
        source: t.source as AppState["transactions"][number]["source"],
        reference: String(t.reference),
        externalId: t.external_id as string | null,
        kind: t.kind as AppState["transactions"][number]["kind"],
        reversesId: t.reverses_id as string | null,
        createdAt: String(t.created_at),
      }),
    ),
    allocations: (allocations.data ?? []).map((a) => ({
      id: a.id,
      teamId: a.team_id,
      transactionId: a.transaction_id,
      playerId: a.player_id,
      penaltyId: a.penalty_id,
      amountCents: a.amount_cents,
    })),
    auditLogs: (audits.data ?? []).map((a) => ({
      id: a.id,
      teamId: a.team_id,
      actor: a.actor_id ?? "System",
      action: a.action,
      createdAt: a.created_at,
      summary: `${a.action} · ${a.entity_id}`,
    })),
    memberships: (memberships.data ?? []).map((m) => ({
      userId: m.user_id,
      role: m.role,
      playerId: m.player_id,
    })),
  };
}
