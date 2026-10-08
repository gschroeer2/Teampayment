import { redirect } from "next/navigation";
import { supabaseMode } from "@/lib/supabase/config";
import { changePassword } from "../actions";
export const dynamic = "force-dynamic";
export default async function Reset({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (supabaseMode() === "demo") redirect("/");
  const p = await searchParams;
  return (
    <main className="login-shell">
      <div className="login-card">
        <h1>Neues Passwort</h1>
        {p.error && (
          <p role="alert">Passwort konnte nicht gespeichert werden.</p>
        )}
        <form action={changePassword}>
          <label>
            Neues Passwort (mindestens 12 Zeichen)
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={200}
              autoComplete="new-password"
              required
            />
          </label>
          <button className="button primary">Passwort speichern</button>
        </form>
      </div>
    </main>
  );
}
