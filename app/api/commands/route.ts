import { NextResponse, type NextRequest } from "next/server";
import { commandSchema, authorize } from "@/lib/commands";
import { AccessError, getContext } from "@/lib/server-state";
import { readLimitedBody, sameOrigin } from "@/lib/http";
import { supabaseMode } from "@/lib/supabase/config";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request, process.env.APP_ORIGIN))
    return NextResponse.json(
      { error: "Ungültiger Ursprung." },
      { status: 403 },
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json({ error: "JSON erforderlich." }, { status: 415 });
  try {
    if (supabaseMode() === "demo")
      return NextResponse.json(
        { error: "Demo-Daten werden ausschließlich im Browser gespeichert." },
        { status: 409 },
      );
    const { supabase, member } = await getContext();
    let body: string;
    try {
      body = await readLimitedBody(request);
    } catch {
      return NextResponse.json(
        { error: "Anfrage zu groß oder ungültig." },
        { status: 413 },
      );
    }
    const parsed = commandSchema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return NextResponse.json(
        {
          error:
            "Eingaben prüfen: " +
            parsed.error.issues.map((i) => i.message).join(", "),
        },
        { status: 400 },
      );
    try {
      authorize(member.role, parsed.data);
    } catch {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 },
      );
    }
    const { error } = await supabase.rpc("teamkasse_command", {
      p_team: member.team_id,
      p_command: parsed.data,
    });
    if (error) {
      const duplicate = error.code === "23505";
      return NextResponse.json(
        {
          error: duplicate
            ? "Spieler-ID, Konto-Zuordnung oder Transaktion ist bereits vorhanden."
            : "Änderung nicht möglich. Zuordnung, Status und Beträge prüfen.",
        },
        { status: error.code === "42501" ? 403 : 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : "Anfrage konnte nicht verarbeitet werden.",
      },
      { status: e instanceof AccessError ? e.status : 400 },
    );
  }
}
