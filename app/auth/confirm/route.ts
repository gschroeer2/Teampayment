import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { serverClient } from "@/lib/supabase/server";
import { supabaseMode } from "@/lib/supabase/config";
export async function GET(request: NextRequest) {
  if (supabaseMode() === "demo")
    return NextResponse.redirect(new URL("/", request.url));
  const token = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (
    token &&
    token.length <= 256 &&
    ["invite", "recovery", "email"].includes(type ?? "")
  ) {
    const supabase = await serverClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: type as EmailOtpType,
    });
    if (!error)
      return NextResponse.redirect(
        new URL(
          type === "invite" || type === "recovery" ? "/login/reset" : "/",
          request.url,
        ),
      );
  }
  return NextResponse.redirect(new URL("/login?error=1", request.url));
}
