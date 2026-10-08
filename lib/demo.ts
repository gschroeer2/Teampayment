import type { AppState } from "./types";
const teamId = "10000000-0000-4000-8000-000000000001";
const uid = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function createDemo(): AppState {
  const now = new Date();
  const date = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  };
  const players = [
    ["Jonas Weber", "Jo"],
    ["Leon Fischer", "Leo"],
    ["Max Becker", "Max"],
    ["Felix Wagner", "Flex"],
    ["Paul Hoffmann", "Paul"],
    ["Lukas Schmidt", "Luki"],
    ["Tim Schneider", "Tim"],
    ["Ben Müller", "Ben"],
  ].map(([name, alias], i) => ({
    id: uid(i + 1),
    teamId,
    name,
    category: "player" as const,
    firstName: name.split(" ")[0],
    lastName: name.split(" ").slice(1).join(" "),
    code: `MK-${String(i + 1).padStart(3, "0")}`,
    aliases: [alias],
    active: true,
  }));
  const penaltyTypes = [
    ["Zu spät zum Training", 500, "Pünktlichkeit gehört zum Team."],
    ["Schuhe vergessen", 500, "Ausrüstung nicht vollständig."],
    ["Gelbe Karte wegen Meckerns", 1000, "Fairplay auf und neben dem Platz."],
    ["Kabine nicht aufgeräumt", 300, "Wir hinterlassen die Kabine sauber."],
    [
      "Kronkorken fallen lassen",
      200,
      "Fiktiver Demo-Betrag – im Katalog anpassbar.",
    ],
  ].map(([name, amount, description], i) => ({
    id: uid(100 + i),
    teamId,
    name: String(name),
    amountCents: Number(amount),
    description: String(description),
    aliases: [
      ["zu spät", "verspätet"],
      ["Schuhe vergessen", "Schuhe nicht dabei"],
      ["Meckern"],
      ["Kabine dreckig"],
      ["Deckel", "Kronkorken", "Bierdeckel"],
    ][i],
    active: true,
  }));
  const penalties = [
    { player: 0, type: 0, days: 1 },
    { player: 0, type: 1, days: 4 },
    { player: 1, type: 2, days: 3 },
    { player: 2, type: 1, days: 2 },
    { player: 3, type: 0, days: 5 },
    { player: 4, type: 3, days: 6 },
    { player: 5, type: 2, days: 7 },
    { player: 6, type: 0, days: 8 },
    { player: 7, type: 1, days: 2 },
    { player: 2, type: 0, days: 0 },
  ].map((v, i) => ({
    id: uid(200 + i),
    teamId,
    playerId: players[v.player].id,
    typeId: penaltyTypes[v.type].id,
    amountCents: penaltyTypes[v.type].amountCents,
    reason: penaltyTypes[v.type].name,
    date: date(v.days),
    status: i === 9 ? ("proposed" as const) : ("confirmed" as const),
    createdAt: `${date(v.days)}T18:00:00.000Z`,
  }));
  const transactions = [
    {
      id: uid(300),
      teamId,
      amountCents: 1000,
      date: date(2),
      source: "paypal" as const,
      reference: "MK-001 Mannschaftskasse",
      externalId: "DEMO-PAYPAL-001",
      kind: "payment" as const,
      reversesId: null,
      createdAt: `${date(2)}T19:00:00Z`,
    },
    {
      id: uid(301),
      teamId,
      amountCents: 500,
      date: date(1),
      source: "bank" as const,
      reference: "MK-004",
      externalId: "DEMO-BANK-001",
      kind: "payment" as const,
      reversesId: null,
      createdAt: `${date(1)}T19:00:00Z`,
    },
  ];
  const allocations = [
    {
      id: uid(400),
      teamId,
      transactionId: uid(300),
      playerId: players[0].id,
      penaltyId: penalties[0].id,
      amountCents: 500,
    },
    {
      id: uid(401),
      teamId,
      transactionId: uid(300),
      playerId: players[0].id,
      penaltyId: penalties[1].id,
      amountCents: 500,
    },
    {
      id: uid(402),
      teamId,
      transactionId: uid(301),
      playerId: players[3].id,
      penaltyId: penalties[4].id,
      amountCents: 500,
    },
  ];
  return {
    mode: "demo",
    drinkConsumptions: [],
    imports: [],
    team: {
      id: teamId,
      name: "FC Eintracht · Erste Mannschaft",
      retentionDays: 365,
    },
    role: "admin",
    playerId: null,
    players,
    penaltyTypes,
    penalties,
    transactions,
    allocations,
    auditLogs: [
      {
        id: uid(500),
        teamId,
        action: "demo",
        actor: "Demo-Administrator",
        createdAt: now.toISOString(),
        summary: "Fiktive Beispieldaten geladen",
      },
    ],
    memberships: [{ userId: uid(600), role: "admin", playerId: null }],
  };
}
