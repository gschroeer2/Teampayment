import { signIn, requestReset } from "./actions";
import Link from "next/link";
import { WalletCards } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const p = await searchParams;
  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="brand-icon">
          <WalletCards size={28} />
        </div>
        <h1>Willkommen bei TeamKasse</h1>
        <p>Eine Mannschaft. Eine Kasse. Alles im Blick.</p>
        {p.error && (
          <p role="alert" className="error">
            Anmeldung fehlgeschlagen. E-Mail und Passwort prüfen.
          </p>
        )}
        {p.reset && (
          <p role="status" className="success">
            Falls das Konto existiert, wurde eine E-Mail zum Zurücksetzen
            angefordert.
          </p>
        )}
        <form action={signIn}>
          <label>
            E-Mail
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label>
            Passwort
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
            />
          </label>
          <button className="button primary" type="submit">
            Anmelden
          </button>
        </form>
        <details>
          <summary>Passwort vergessen?</summary>
          <form action={requestReset}>
            <label>
              E-Mail
              <input type="email" name="email" required />
            </label>
            <button className="button secondary">Link anfordern</button>
          </form>
        </details>
        <p className="muted small">
          Konten werden vom Teamadministrator eingeladen. Es gibt keine
          öffentliche Registrierung.
        </p>
        <Link href="/">Zur Übersicht</Link>
      </div>
    </main>
  );
}
