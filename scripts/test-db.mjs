import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
let count = 0;
const ids = {
  team: "10000000-0000-4000-8000-000000000001",
  team2: "10000000-0000-4000-8000-000000000002",
  admin: "30000000-0000-4000-8000-000000000001",
  cashier: "30000000-0000-4000-8000-000000000002",
  player: "30000000-0000-4000-8000-000000000003",
  outsider: "30000000-0000-4000-8000-000000000004",
  p1: "20000000-0000-4000-8000-000000000001",
  p2: "20000000-0000-4000-8000-000000000002",
  foreign: "20000000-0000-4000-8000-000000000009",
};
async function as(user, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    return tx.query(sql, params);
  });
}
async function command(user, data, team = ids.team) {
  return as(user, "select public.teamkasse_command($1,$2::jsonb)", [
    team,
    JSON.stringify(data),
  ]);
}
async function check(name, fn) {
  await fn();
  count++;
  console.log(`PASS ${name}`);
}
try {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/001_teamkasse.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/002_whatsapp_catalog_aliases.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/003_catalog_and_drinks.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8"),
  );
  console.log("PASS migration and repeatable development seed");
  count++;
  await db.query("insert into auth.users(id) select unnest($1::uuid[])", [
    Object.values(ids).filter((v) => v.startsWith("300")),
  ]);
  await db.query("insert into public.teams(id,name) values($1,$2)", [
    ids.team2,
    "Zweites Team",
  ]);
  await db.query(
    "insert into public.players(id,team_id,code,name) values($1,$2,'MK-009','Fremder Spieler')",
    [ids.foreign, ids.team2],
  );
  await db.query(
    "insert into public.memberships(team_id,user_id,role,player_id) values ($1,$2,'admin',null),($1,$3,'cashier',null),($1,$4,'player',$5),($6,$7,'admin',null)",
    [
      ids.team,
      ids.admin,
      ids.cashier,
      ids.player,
      ids.p1,
      ids.team2,
      ids.outsider,
    ],
  );
  await check(
    "player RLS filters players, penalties, memberships and foreign teams",
    async () => {
      assert.equal(
        (await as(ids.player, "select * from public.players")).rows.length,
        1,
      );
      assert.equal(
        (await as(ids.player, "select * from public.penalties")).rows.length,
        1,
      );
      assert.equal(
        (await as(ids.player, "select * from public.memberships")).rows.length,
        1,
      );
      assert.equal(
        (await as(ids.player, "select * from public.teams")).rows.length,
        1,
      );
      assert.equal(
        (await as(ids.player, "select * from public.audit_logs")).rows.length,
        0,
      );
    },
  );
  await check(
    "player and outsider cannot write RPCs; direct writes denied",
    async () => {
      await assert.rejects(
        command(ids.player, { type: "updateSettings", retentionDays: 90 }),
      );
      await assert.rejects(
        command(ids.outsider, { type: "updateSettings", retentionDays: 90 }),
      );
      await assert.rejects(
        as(ids.admin, "update public.players set name='Manipuliert'"),
      );
    },
  );
  await check(
    "cashier can create financial rows but cannot edit catalog or roles",
    async () => {
      await command(ids.cashier, {
        type: "addPenalty",
        playerId: ids.p1,
        typeId: null,
        amountCents: 500,
        reason: "Schuhe vergessen",
        date: "2026-10-01",
        status: "confirmed",
      });
      await assert.rejects(
        command(ids.cashier, {
          type: "savePenaltyType",
          name: "Test",
          description: "",
          amountCents: 500,
          active: true,
        }),
      );
      await assert.rejects(
        command(ids.cashier, {
          type: "setMembership",
          userId: ids.player,
          role: "admin",
          playerId: null,
        }),
      );
    },
  );
  const payment = {
    type: "addPayment",
    amountCents: 2000,
    date: "2026-10-02",
    source: "bank",
    reference: "Private Sammelzahlung",
    externalId: "BANK-001",
    splits: [
      { playerId: ids.p1, amountCents: 1200 },
      { playerId: ids.p2, amountCents: 800 },
    ],
  };
  await check("atomic partial, split and excess allocations", async () => {
    await command(ids.cashier, payment);
    const a = (await db.query("select * from public.payment_allocations")).rows;
    assert.equal(
      a.reduce((n, a) => n + a.amount_cents, 0),
      2000,
    );
    assert.equal(
      a
        .filter((a) => a.player_id === ids.p1)
        .reduce((n, a) => n + a.amount_cents, 0),
      1200,
    );
    assert.equal(
      a
        .filter((a) => a.penalty_id === null)
        .reduce((n, a) => n + a.amount_cents, 0),
      200,
    );
    assert.equal(a.filter((a) => a.player_id === ids.p2)[0].amount_cents, 800);
  });
  await check(
    "payment privacy: raw transaction hidden and own share redacted",
    async () => {
      assert.equal(
        (await as(ids.player, "select * from public.transactions")).rows.length,
        0,
      );
      const h = (
        await as(ids.player, "select * from public.own_payment_history($1)", [
          ids.team,
        ])
      ).rows;
      assert.equal(h.length, 1);
      assert.equal(Number(h[0].amount_cents), 1200);
      assert.equal(h[0].reference, "Eigener Zahlungsanteil");
      assert.equal(h[0].external_id, null);
      assert.equal(
        (
          await as(
            ids.outsider,
            "select * from public.own_payment_history($1)",
            [ids.team],
          )
        ).rows.length,
        0,
      );
    },
  );
  await check(
    "duplicates, foreign player splits and mismatched totals roll back completely",
    async () => {
      await assert.rejects(command(ids.cashier, payment));
      await assert.rejects(
        command(ids.cashier, {
          ...payment,
          externalId: "BANK-002",
          splits: [{ playerId: ids.foreign, amountCents: 2000 }],
        }),
      );
      await assert.rejects(
        command(ids.cashier, {
          ...payment,
          externalId: "BANK-003",
          amountCents: 2001,
        }),
      );
      assert.equal(
        (await db.query("select * from public.transactions")).rows.length,
        1,
      );
    },
  );
  await check(
    "cross-team foreign keys and unknown IDs prevent catalog/player abuse",
    async () => {
      await assert.rejects(
        command(ids.admin, {
          type: "savePlayer",
          id: ids.foreign,
          name: "Changed",
          code: "MK-009",
          aliases: [],
          active: true,
        }),
      );
      await assert.rejects(
        command(ids.admin, {
          type: "setMembership",
          userId: ids.player,
          role: "player",
          playerId: ids.foreign,
        }),
      );
    },
  );
  await check(
    "last admin cannot be demoted and player membership needs a player",
    async () => {
      await assert.rejects(
        command(ids.admin, {
          type: "setMembership",
          userId: ids.admin,
          role: "cashier",
          playerId: null,
        }),
      );
      await assert.rejects(
        command(ids.admin, {
          type: "setMembership",
          userId: ids.player,
          role: "player",
          playerId: null,
        }),
      );
    },
  );
  const txn = (
    await db.query(
      "select id from public.transactions where external_id='BANK-001'",
    )
  ).rows[0].id;
  await check(
    "full refund reverses every split, preserves history and prevents double refund",
    async () => {
      await command(ids.cashier, {
        type: "refundPayment",
        id: txn,
        date: "2026-10-03",
        note: "Rückerstattung",
      });
      assert.equal(
        Number(
          (
            await db.query(
              "select sum(amount_cents) as net from public.payment_allocations",
            )
          ).rows[0].net,
        ),
        0,
      );
      assert.equal(
        (await db.query("select * from public.transactions")).rows.length,
        2,
      );
      await assert.rejects(
        command(ids.cashier, {
          type: "refundPayment",
          id: txn,
          date: "2026-10-03",
          note: "Noch einmal",
        }),
      );
    },
  );
  await check("immutable audit visible to admin only", async () => {
    assert.ok(
      (await as(ids.admin, "select * from public.audit_logs")).rows.length > 5,
    );
    assert.equal(
      (await as(ids.cashier, "select * from public.audit_logs")).rows.length,
      0,
    );
    await assert.rejects(as(ids.admin, "delete from public.audit_logs"));
  });
  await check(
    "credit is applied to future demands and dashboard uses an RLS-filtered snapshot",
    async () => {
      await command(ids.cashier, {
        ...payment,
        amountCents: 1000,
        externalId: "BANK-CREDIT",
        splits: [{ playerId: ids.p1, amountCents: 1000 }],
      });
      const state = (
        await as(ids.player, "select public.teamkasse_state($1) as state", [
          ids.team,
        ])
      ).rows[0].state;
      assert.equal(state.players.length, 1);
      assert.equal(state.audit_logs.length, 0);
      assert.equal(state.memberships.length, 0);
      assert.equal(state.transactions.length, 3);
      assert.equal(
        state.transactions.find((t) => t.external_id === "BANK-CREDIT"),
        undefined,
      );
      await command(ids.cashier, {
        type: "addPenalty",
        playerId: ids.p1,
        typeId: null,
        amountCents: 500,
        reason: "Neue Forderung",
        date: "2026-10-04",
        status: "confirmed",
      });
      const tx = (
        await db.query(
          "select id from public.transactions where external_id='BANK-CREDIT'",
        )
      ).rows[0].id;
      await command(ids.cashier, {
        type: "refundPayment",
        id: tx,
        date: "2026-10-05",
        note: "Rückerstattung",
      });
      assert.equal(
        Number(
          (
            await db.query(
              "select sum(amount_cents) as net from public.payment_allocations",
            )
          ).rows[0].net,
        ),
        0,
      );
    },
  );
  await check(
    "WhatsApp catalog aliases are admin-only and validated in the database",
    async () => {
      const data = {
        type: "savePenaltyType",
        id: "20000000-0000-4000-8000-000000000104",
        name: "Kronkorken fallen lassen",
        description: "Fiktiver Testbetrag",
        amountCents: 350,
        aliases: ["Deckel", "Kronkorken"],
        active: true,
      };
      await assert.rejects(command(ids.cashier, data));
      await assert.rejects(command(ids.admin, { ...data, aliases: ["x"] }));
      await command(ids.admin, data);
      const row = (
        await as(ids.admin, "select * from public.penalty_types where id=$1", [
          data.id,
        ])
      ).rows[0];
      assert.deepEqual(row.aliases, data.aliases);
    },
  );
  await check(
    "WhatsApp proposals ignore forged amounts/status and enforce team access and duplicate hashes",
    async () => {
      const data = {
        type: "addWhatsAppProposal",
        playerId: ids.p1,
        typeId: "20000000-0000-4000-8000-000000000104",
        date: "2026-10-08",
        messageKey: "a".repeat(64),
        excerpt: "Jo Deckel",
        amountCents: 1,
        status: "confirmed",
      };
      await assert.rejects(command(ids.player, data));
      await assert.rejects(command(ids.outsider, data));
      await assert.rejects(
        command(ids.cashier, { ...data, playerId: ids.foreign }),
      );
      await assert.rejects(
        command(ids.cashier, { ...data, messageKey: "bad" }),
      );
      await command(ids.cashier, data);
      await assert.rejects(command(ids.cashier, data));
      const rows = (
        await as(
          ids.admin,
          "select * from public.penalties where source_hash=$1",
          [data.messageKey],
        )
      ).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, "proposed");
      assert.equal(rows[0].amount_cents, 350);
      assert.equal(rows[0].source, "whatsapp");
      const audit = (
        await as(
          ids.admin,
          "select after_data from public.audit_logs where entity_id=$1",
          [rows[0].id],
        )
      ).rows;
      assert.ok(
        audit.every((r) => !JSON.stringify(r.after_data).includes("Jo Deckel")),
      );
      const snapshot = (
        await as(ids.cashier, "select public.teamkasse_state($1) as state", [
          ids.team,
        ])
      ).rows[0].state;
      assert.equal(
        snapshot.penalties.find((p) => p.id === rows[0].id).evidence_excerpt,
        "Jo Deckel",
      );
      const own = (
        await as(ids.player, "select public.teamkasse_state($1) as state", [
          ids.team,
        ])
      ).rows[0].state;
      assert.ok(own.penalties.every((p) => !("evidence_excerpt" in p)));
    },
  );
  await check(
    "catalog batch is admin-only, atomic and protected against duplicate files/names",
    async () => {
      const data = {
        type: "importPenaltyCatalog",
        fileHash: "c".repeat(64),
        rows: [
          {
            name: "Katalog-Test",
            description: "Fiktiv",
            amountCents: 350,
            aliases: ["Testkurz"],
            active: true,
          },
        ],
      };
      await assert.rejects(command(ids.cashier, data));
      await assert.rejects(command(ids.player, data));
      await command(ids.admin, data);
      await assert.rejects(command(ids.admin, data));
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from public.penalty_types where name='Katalog-Test'",
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        command(ids.admin, {
          ...data,
          fileHash: "b".repeat(64),
          rows: [
            { ...data.rows[0], name: "Rollback-Kategorie" },
            { ...data.rows[0], name: "Ungültig", amountCents: -1 },
          ],
        }),
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from public.penalty_types where name='Rollback-Kategorie'",
          )
        ).rows[0].n,
        0,
      );
      await assert.rejects(
        command(ids.admin, {
          ...data,
          fileHash: "b".repeat(64),
          rows: [{ ...data.rows[0], name: "KATALOG-TEST" }],
        }),
      );
      await assert.rejects(
        as(ids.admin, "select private.teamkasse_command_v2($1,$2::jsonb)", [
          ids.team,
          JSON.stringify({ type: "updateSettings", retentionDays: 90 }),
        ]),
      );
    },
  );
  await check(
    "drink quantities create exact ledger charges with RLS and immutable source cells",
    async () => {
      const data = {
        type: "recordDrinks",
        listKey: "training-oktober-2026",
        imageHash: "d".repeat(64),
        unitPriceCents: 150,
        cells: [
          { playerId: ids.p1, date: "2026-10-08", count: 3 },
          { playerId: ids.p2, date: "2026-10-08", count: 2 },
        ],
      };
      const before = (
        await db.query(
          "select coalesce(sum(amount_cents),0)::int as n from public.penalties where player_id=$1 and status='confirmed'",
          [ids.p1],
        )
      ).rows[0].n;
      await assert.rejects(command(ids.player, data));
      await assert.rejects(command(ids.outsider, data));
      await command(ids.cashier, data);
      const after = (
        await db.query(
          "select coalesce(sum(amount_cents),0)::int as n from public.penalties where player_id=$1 and status='confirmed'",
          [ids.p1],
        )
      ).rows[0].n;
      assert.equal(after - before, 450);
      assert.equal(
        (await as(ids.player, "select * from public.drink_consumptions")).rows
          .length,
        1,
      );
      assert.equal(
        (await as(ids.cashier, "select * from public.drink_consumptions")).rows
          .length,
        2,
      );
      await assert.rejects(
        as(ids.cashier, "update public.drink_consumptions set count=99"),
      );
      await assert.rejects(command(ids.cashier, data));
      await assert.rejects(
        command(ids.cashier, { ...data, imageHash: "e".repeat(64) }),
      );
      await assert.rejects(
        command(ids.cashier, { ...data, listKey: "andere-liste" }),
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from public.penalties where source='drinks'",
          )
        ).rows[0].n,
        2,
      );
      await command(ids.cashier, {
        ...data,
        cells: [{ playerId: ids.p2, date: "2026-10-09", count: 1 }],
      });
      assert.equal(
        (
          await db.query(
            "select row_count from public.import_batches where source='drinks'",
          )
        ).rows[0].row_count,
        3,
      );
    },
  );
  await check(
    "invalid drink cells roll back the entire import, including its financial rows",
    async () => {
      const data = {
        type: "recordDrinks",
        listKey: "rollback-test",
        imageHash: null,
        unitPriceCents: 150,
        cells: [
          { playerId: ids.p2, date: "2026-10-10", count: 2 },
          { playerId: ids.foreign, date: "2026-10-10", count: 1 },
        ],
      };
      await assert.rejects(command(ids.cashier, data));
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from public.drink_consumptions where list_key='rollback-test'",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from public.penalties where source='drinks' and date='2026-10-10'",
          )
        ).rows[0].n,
        0,
      );
      await assert.rejects(
        command(ids.cashier, {
          ...data,
          cells: [{ playerId: ids.p2, date: "2026-10-10", count: 0 }],
        }),
      );
    },
  );
  await check(
    "anonymization requires admin, scrubs personal text and revokes linked player access",
    async () => {
      await assert.rejects(
        command(ids.cashier, {
          type: "anonymizePlayer",
          playerId: ids.p1,
          confirmation: "ANONYMISIEREN",
        }),
      );
      await command(ids.admin, {
        type: "anonymizePlayer",
        playerId: ids.p1,
        confirmation: "ANONYMISIEREN",
      });
      const p = (
        await db.query("select * from public.players where id=$1", [ids.p1])
      ).rows[0];
      assert.equal(p.name, "Anonymisierter Spieler");
      assert.equal(p.active, false);
      assert.deepEqual(p.aliases, []);
      assert.equal(
        (await as(ids.player, "select * from public.players")).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select * from public.audit_logs where team_id=$1 and (before_data is not null or after_data is not null)",
            [ids.team],
          )
        ).rows.length,
        0,
      );
    },
  );
  await check("anonymous database queries are denied", async () => {
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query("select * from public.players");
      }),
    );
  });
  console.log(
    `\n${count} PostgreSQL checks passed (PGlite, real PostgreSQL engine).`,
  );
} finally {
  await db.close();
}
