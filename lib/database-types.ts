import type { Role, PenaltyStatus, PersonCategory } from "./types";
/** Result of teamkasse_state. Keep these boundary types in sync with the migration. */
export interface DatabaseSnapshot {
  drink_consumptions: Array<{
    id: string;
    player_id: string;
    date: string;
    list_key: string;
    count: number;
    unit_price_cents: number;
    penalty_id: string;
    image_hash: string | null;
  }>;
  import_batches: Array<{ source: string; file_hash: string }>;
  team: { id: string; name: string; retention_days: number };
  players: Array<{
    id: string;
    team_id: string;
    code: string;
    name: string;
    category: PersonCategory;
    first_name: string | null;
    last_name: string | null;
    aliases: string[];
    active: boolean;
  }>;
  penalty_types: Array<{
    id: string;
    team_id: string;
    name: string;
    description: string;
    aliases: string[];
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
    source: "manual" | "whatsapp" | "drinks";
    source_hash: string | null;
    evidence_excerpt?: string | null;
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
