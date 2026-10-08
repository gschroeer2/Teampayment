import TeamKasse from "@/components/teamkasse";
import { createDemo } from "@/lib/demo";
import { supabaseMode } from "@/lib/supabase/config";
import { loadState, AccessError } from "@/lib/server-state";
import { redirect } from "next/navigation";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Page() {
  let state;
  let failure: unknown;
  try {
    state = supabaseMode() === "demo" ? createDemo() : await loadState();
  } catch (e) {
    if (e instanceof AccessError && e.status === 401) redirect("/login");
    failure = e;
  }
  if (state) return <TeamKasse initialState={state} />;
  return (
    <main className="login-shell">
      <section className="login-card">
        <h1>TeamKasse einrichten</h1>
        <p role="alert">
          {failure instanceof Error
            ? failure.message
            : "Verbindung fehlgeschlagen."}
        </p>
        <p>
          Prüfe die Einrichtungsschritte in der README. Fehlerhafte
          Supabase-Konfigurationen wechseln nicht in den Demo-Modus.
        </p>
        <Link href="/login" className="button primary">
          Zur Anmeldung
        </Link>
      </section>
    </main>
  );
}
