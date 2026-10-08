import { NextResponse, type NextRequest } from "next/server";
import { supabaseMode } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  if (supabaseMode() === "demo")
    return NextResponse.redirect(new URL("/", request.url));
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await serverClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          request.nextUrl.searchParams.get("next") === "/login/reset"
            ? "/login/reset"
            : "/",
          request.url,
        ),
      );
  }
  return NextResponse.redirect(new URL("/login?error=1", request.url));
}
