import type { Role, PenaltyStatus } from "./types";
/** Result of teamkasse_state. Keep these boundary types in sync with the migration. */
export interface DatabaseSnapshot {
  team: { id: string; name: string; retention_days: number };
  players: Array<{
    id: string;
    team_id: string;
    code: string;
    name: string;
    aliases: string[];
    active: boolean;
  }>;
  penalty_types: Array<{
    id: string;
    team_id: string;
    name: string;
    description: string;
    amount_cents: number;
    active: boolean;
  }>;
  penalties: Array<{
    id: string;
    team_id: string;
    player_id: string;
    type_id: string | null;
    amount_cents: number;
    reason: string;
    date: string;
    status: PenaltyStatus;
    created_at: string;
    correction_note: string | null;
  }>;
  transactions: Array<{
    id: string;
    team_id: string;
    amount_cents: number;
    date: string;
    source: string;
    reference: string;
    external_id: string | null;
    kind: string;
    reverses_id: string | null;
    created_at: string;
  }>;
  allocations: Array<{
    id: string;
    team_id: string;
    transaction_id: string;
    player_id: string;
    penalty_id: string | null;
    amount_cents: number;
  }>;
  audit_logs: Array<{
    id: string;
    team_id: string;
    actor_id: string | null;
    action: string;
    entity_id: string;
    created_at: string;
  }>;
  memberships: Array<{ user_id: string; role: Role; player_id: string | null }>;
}
