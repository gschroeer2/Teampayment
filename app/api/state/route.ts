import { NextResponse } from "next/server";
import { supabaseMode } from "@/lib/supabase/config";
import { AccessError, loadState } from "@/lib/server-state";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (supabaseMode() === "demo") return NextResponse.json({ mode: "demo" });
    return NextResponse.json(await loadState(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Daten konnten nicht geladen werden.",
      },
      { status: e instanceof AccessError ? e.status : 503 },
    );
  }
}
