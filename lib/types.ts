export type Role = "player" | "cashier" | "admin";
export type PenaltyStatus = "proposed" | "confirmed" | "rejected" | "cancelled";
export interface Team {
  id: string;
  name: string;
  retentionDays: number;
}
export interface Player {
  id: string;
  teamId: string;
  code: string;
  name: string;
  aliases: string[];
  active: boolean;
}
export interface PenaltyType {
  id: string;
  teamId: string;
  name: string;
  description: string;
  aliases: string[];
  amountCents: number;
  active: boolean;
}
export interface Penalty {
  id: string;
  teamId: string;
  playerId: string;
  typeId: string | null;
  amountCents: number;
  reason: string;
  date: string;
  status: PenaltyStatus;
  createdAt: string;
  correctionNote?: string;
  source?: "manual" | "whatsapp";
  sourceHash?: string;
  evidenceExcerpt?: string;
}
export interface Transaction {
  id: string;
  teamId: string;
  amountCents: number;
  date: string;
  source: "cash" | "bank" | "paypal";
  reference: string;
  externalId: string | null;
  kind: "payment" | "refund" | "transfer";
  reversesId: string | null;
  createdAt: string;
}
export interface Allocation {
  id: string;
  teamId: string;
  transactionId: string;
  playerId: string;
  penaltyId: string | null;
  amountCents: number;
}
export interface AuditLog {
  id: string;
  teamId: string;
  action: string;
  actor: string;
  createdAt: string;
  summary: string;
}
export interface Membership {
  userId: string;
  role: Role;
  playerId: string | null;
}
export interface AppState {
  mode: "demo" | "supabase";
  team: Team;
  role: Role;
  playerId: string | null;
  players: Player[];
  penaltyTypes: PenaltyType[];
  penalties: Penalty[];
  transactions: Transaction[];
  allocations: Allocation[];
  auditLogs: AuditLog[];
  memberships: Membership[];
}
