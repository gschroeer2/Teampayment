import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { AccessError, getContext } from "@/lib/server-state";
import { supabaseMode } from "@/lib/supabase/config";
import { canManage } from "@/lib/commands";
import { readLimitedBody, sameOrigin } from "@/lib/http";
import { imageType } from "@/lib/imports/drinks";
import { recognizeDrinkSheet } from "@/lib/ai/drinks";
export const runtime = "nodejs";
const recent = new Map<string, number>();
const active = new Set<string>();
export async function GET() {
  if (supabaseMode() === "demo")
    return NextResponse.json({
      available: false,
      reason:
        "Automatische Fotoerkennung benötigt eine Supabase-Anmeldung und einen serverseitigen OpenAI-Schlüssel. Die manuelle Prüfmaske funktioniert im Demo-Modus.",
    });
  try {
    const { member } = await getContext();
    if (!canManage(member.role))
      throw new AccessError("Keine Berechtigung.", 403);
    return NextResponse.json({
      available: !!process.env.OPENAI_API_KEY?.trim(),
      reason: process.env.OPENAI_API_KEY?.trim()
        ? "Foto wird nur nach deiner Freigabe an OpenAI gesendet."
        : "OpenAI-Schlüssel ist noch nicht eingerichtet. Mengen können manuell geprüft werden.",
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AccessError ? e.message : "Erkennung nicht verfügbar.",
      },
      { status: e instanceof AccessError ? e.status : 503 },
    );
  }
}
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
      throw new AccessError(
        "Automatische Erkennung benötigt eine Anmeldung. Im Demo-Modus bitte die manuelle Prüfmaske verwenden.",
        409,
      );
    const { member, user } = await getContext();
    if (!canManage(member.role))
      throw new AccessError("Keine Berechtigung.", 403);
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key)
      throw new AccessError("OpenAI-Schlüssel ist nicht eingerichtet.", 503);
    if ((recent.get(user.id) ?? 0) > Date.now() - 20_000)
      throw new AccessError(
        "Bitte vor der nächsten Bilderkennung 20 Sekunden warten.",
        429,
      );
    let text: string;
    try {
      text = await readLimitedBody(request, 7_000_000);
    } catch {
      throw new AccessError("Foto-Anfrage ist zu groß oder ungültig.", 413);
    }
    const data = z
      .object({
        consent: z.literal(true),
        image: z
          .string()
          .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
      })
      .safeParse(JSON.parse(text));
    if (!data.success)
      throw new AccessError(
        "Foto und ausdrückliche Freigabe erforderlich.",
        400,
      );
    const bytes = Buffer.from(data.data.image.split(",")[1], "base64");
    if (bytes.length > 5_000_000)
      throw new AccessError("Foto überschreitet 5 MB.", 413);
    imageType(bytes);
    const image = sharp(bytes, {
      limitInputPixels: 24_000_000,
      animated: false,
    });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1)
      throw new AccessError("Ungültiges oder mehrseitiges Foto.", 400);
    // Re-encoding strips EXIF/location metadata. No file is written to disk or Supabase Storage.
    const cleaned = await image
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    for (const [id, time] of recent)
      if (time < Date.now() - 60_000) recent.delete(id);
    if (recent.size >= 1000)
      throw new AccessError("Erkennung momentan ausgelastet.", 429);
    if (active.has(user.id) || (recent.get(user.id) ?? 0) > Date.now() - 20_000)
      throw new AccessError(
        "Eine Erkennung läuft bereits oder wurde gerade ausgeführt.",
        429,
      );
    recent.set(user.id, Date.now());
    active.add(user.id);
    try {
      const result = await recognizeDrinkSheet(
        `data:image/png;base64,${cleaned.toString("base64")}`,
        key,
        process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4.1",
      );
      return NextResponse.json(result);
    } finally {
      active.delete(user.id);
    }
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : e instanceof SyntaxError
              ? "Ungültige Anfrage."
              : "Foto konnte nicht sicher erkannt werden. Bitte Format, Schärfe, Ausschnitt und KI-Konfiguration prüfen.",
      },
      { status: e instanceof AccessError ? e.status : 400 },
    );
  }
}
