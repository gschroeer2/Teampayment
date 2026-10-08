"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { supabaseMode } from "@/lib/supabase/config";
export async function signIn(form: FormData) {
  if (supabaseMode() === "demo") redirect("/");
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (email.length > 254 || password.length > 200 || !email || !password)
    redirect("/login?error=1");
  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=1");
  redirect("/");
}
export async function signOut() {
  if (supabaseMode() === "supabase") {
    const supabase = await serverClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
export async function requestReset(form: FormData) {
  if (supabaseMode() === "demo") redirect("/");
  const email = String(form.get("email") ?? "").trim();
  if (email && email.length <= 254) {
    const h = await headers();
    const origin = h.get("origin");
    if (origin) {
      const supabase = await serverClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/login/reset`,
      });
    }
  }
  redirect("/login?reset=1");
}
export async function changePassword(form: FormData) {
  const password = String(form.get("password") ?? "");
  if (password.length < 12 || password.length > 200)
    redirect("/login/reset?error=1");
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/login/reset?error=1");
  redirect("/");
}
