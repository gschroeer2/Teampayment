import { z } from "zod";
const id = z.uuid();
const amount = z.number().int().min(1).max(100_000_000);
const name = z.string().trim().min(2).max(100);
export const dateSchema = z.iso.date().refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}, "Ungültiges Datum");
export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("savePlayer"),
    id: id.optional(),
    name,
    code: z
      .string()
      .trim()
      .regex(/^MK-\d{3,6}$/i)
      .transform((v) => v.toUpperCase()),
    aliases: z.array(z.string().trim().min(1).max(100)).max(20),
    active: z.boolean(),
  }),
  z.object({
    type: z.literal("addPenalty"),
    playerId: id,
    typeId: id.nullable(),
    amountCents: amount,
    reason: z.string().trim().min(3).max(500),
    date: dateSchema,
    status: z.enum(["proposed", "confirmed"]),
  }),
  z.object({
    type: z.literal("setPenaltyStatus"),
    id,
    status: z.enum(["confirmed", "rejected", "cancelled"]),
    note: z.string().trim().min(3).max(500),
  }),
  z.object({
    type: z.literal("addPayment"),
    amountCents: amount,
    date: dateSchema,
    source: z.enum(["cash", "bank", "paypal"]),
    reference: z.string().trim().max(200),
    externalId: z.string().trim().min(1).max(200).nullable(),
    splits: z
      .array(z.object({ playerId: id, amountCents: amount }))
      .min(1)
      .max(50),
  }),
  z.object({
    type: z.literal("refundPayment"),
    id,
    note: z.string().trim().min(3).max(200),
    date: dateSchema,
  }),
  z.object({
    type: z.literal("savePenaltyType"),
    id: id.optional(),
    name,
    description: z.string().trim().max(500),
    amountCents: amount,
    active: z.boolean(),
  }),
  z.object({
    type: z.literal("anonymizePlayer"),
    playerId: id,
    confirmation: z.literal("ANONYMISIEREN"),
  }),
  z.object({
    type: z.literal("updateSettings"),
    retentionDays: z.number().int().min(30).max(3650),
  }),
  z.object({
    type: z.literal("setMembership"),
    userId: id,
    role: z.enum(["player", "cashier", "admin"]),
    playerId: id.nullable(),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export function canManage(role: string) {
  return role === "cashier" || role === "admin";
}
export function authorize(role: string, command: Command) {
  const adminOnly = [
    "savePenaltyType",
    "updateSettings",
    "setMembership",
    "anonymizePlayer",
  ].includes(command.type);
  if (!canManage(role) || (adminOnly && role !== "admin"))
    throw new Error("Keine Berechtigung für diese Änderung.");
}
