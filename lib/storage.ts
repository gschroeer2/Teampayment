import { z } from "zod";
const id = z.uuid(),
  cent = z.number().int(),
  date = z.iso.date(),
  role = z.enum(["admin", "cashier", "player"]);
// Stored demo data are untrusted. Malformed or outdated data never become live data.
export const demoStorageSchema = z.object({
  version: z.literal(1),
  state: z.object({
    mode: z.literal("demo"),
    imports: z
      .array(z.object({ source: z.string(), hash: z.string() }))
      .default([]),
    drinkConsumptions: z
      .array(
        z.object({
          id,
          playerId: id,
          date,
          listKey: z.string(),
          count: z.number().int().positive(),
          unitPriceCents: cent.positive(),
          penaltyId: id,
          imageHash: z.string().nullable(),
        }),
      )
      .default([]),
    role,
    playerId: id.nullable(),
    team: z.object({
      id,
      name: z.string(),
      retentionDays: z.number().int().min(30).max(3650),
    }),
    players: z.array(
      z.object({
        id,
        teamId: id,
        code: z.string().regex(/^MK-\d{3,6}$/),
        name: z.string(),
        aliases: z.array(z.string()),
        active: z.boolean(),
      }),
    ),
    penaltyTypes: z.array(
      z.object({
        id,
        teamId: id,
        name: z.string(),
        description: z.string(),
        aliases: z.array(z.string()).default([]),
        amountCents: cent.positive(),
        active: z.boolean(),
      }),
    ),
    penalties: z.array(
      z.object({
        id,
        teamId: id,
        playerId: id,
        typeId: id.nullable(),
        amountCents: cent.positive(),
        reason: z.string(),
        date,
        status: z.enum(["proposed", "confirmed", "rejected", "cancelled"]),
        createdAt: z.string(),
        correctionNote: z.string().optional(),
        source: z.enum(["manual", "whatsapp", "drinks"]).optional(),
        sourceHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        evidenceExcerpt: z.string().max(1000).optional(),
      }),
    ),
    transactions: z.array(
      z.object({
        id,
        teamId: id,
        amountCents: cent,
        date,
        source: z.enum(["bank", "cash", "paypal"]),
        reference: z.string(),
        externalId: z.string().nullable(),
        kind: z.enum(["payment", "refund", "transfer"]),
        reversesId: id.nullable(),
        createdAt: z.string(),
      }),
    ),
    allocations: z.array(
      z.object({
        id,
        teamId: id,
        transactionId: id,
        playerId: id,
        penaltyId: id.nullable(),
        amountCents: cent,
      }),
    ),
    auditLogs: z.array(
      z.object({
        id,
        teamId: id,
        action: z.string(),
        actor: z.string(),
        createdAt: z.string(),
        summary: z.string(),
      }),
    ),
    memberships: z.array(
      z.object({ userId: id, role, playerId: id.nullable() }),
    ),
  }),
});
