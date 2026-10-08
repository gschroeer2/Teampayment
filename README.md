# TeamKasse

Eine deutsche, mobile Mannschaftskasse für Amateur-Fußballteams. Erste funktionsfähige Version mit Next.js App Router, TypeScript, Tailwind CSS und einer Supabase/PostgreSQL-Anbindung. Keine echten privaten Finanzdaten in den Beispieldaten.

## Was bereits funktioniert

- Dashboard mit offenen Forderungen, beglichenen Beträgen, Guthaben und aktuellen Vorgängen.
- Spieler hinzufügen, bearbeiten und deaktivieren; eindeutige IDs (`MK-017`), Spitznamen und Namensvarianten.
- Strafenkatalog mit Centbeträgen, aktivierbaren Kategorien und bearbeitbaren Erkennungsbegriffen.
- WhatsApp-TXT-Import mit Katalogzuordnung, prüfbaren Vorschlägen und gespeicherten Nachrichten-Hashes gegen Dubletten.
- Manuelle Strafen: Vorschlag, Bestätigung, Ablehnung und Storno mit Prüfvermerk. Korrekturen durch Storno und neuen Eintrag, ohne Überschreiben der Historie.
- Zahlungen über Barzahlung, Bank oder PayPal **manuell** erfassen. Teilzahlungen, Aufteilung auf mehrere Spieler, automatische Verteilung auf die ältesten bestätigten Forderungen, Guthaben und vollständige Rückbuchung.
- CSV-Export, Spieler-/Zeitraumfilter für Vorgänge. Kontostände berücksichtigen immer die gesamte Historie.
- Supabase-Auth-Anmeldung, Passwort-Reset, Teamzuordnung und drei Rollen. Kein offenes Registrierungsformular.
- Serverseitige Rollenprüfung, RLS, geschützte atomare Datenbankfunktionen und Änderungsprotokoll.
- Datenexport und Administratorfunktion zum Anonymisieren eines Spielerkontos.
- Helles/Dunkles Design und installierbare PWA mit neutraler Offline-Seite. Finanzdaten werden nicht im Service-Worker-Cache abgelegt.

**Ohne Supabase-Konfiguration:** klar gekennzeichnete Demo mit acht fiktiven Spielern. Änderungen werden nur im Browser (`localStorage`) gespeichert. Die Demo-Rollenauswahl simuliert Ansichten; sie ist keine echte Anmeldung und darf nicht mit realen Finanzdaten genutzt werden. Browser können lokale Speicherung blockieren; dann lebt die Demo nur bis zum Neuladen.

## Lokal starten – in drei Schritten

Voraussetzung: **Node.js 24 LTS** und npm. Im Projektordner:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Die Supabase-Felder in `.env.local` für die Demo leer lassen. Der Terminalausgabe entnimmst du den lokalen Port (standardmäßig 3000); öffne ihn in deinem Browser. Eine kostenlose Supabase-Instanz ist für die Demo nicht nötig.

So probierst du die App aus:

1. Auf „Spieler“ einen fiktiven Spieler hinzufügen.
2. Über „Strafe erfassen“ eine bestätigte Strafe anlegen.
3. Unter „Zahlungen“ einen Teilbetrag oder eine Sammelzahlung erfassen.
4. Den offenen Betrag bzw. das Guthaben in „Spieler“ prüfen.
5. Über die Demo-Rollenauswahl die eingeschränkte Spieleransicht prüfen.
6. Unter „Verwaltung“ die Demo zurücksetzen.

Für den Produktionsmodus auf deinem Rechner:

```bash
npm run build
npm run start
```

Die PWA wird im Produktionsmodus registriert. Auf dem iPhone über „Teilen → Zum Home-Bildschirm“ hinzufügen; unter Android über die Installationsfunktion des Browsers. Außerhalb von localhost ist HTTPS erforderlich. Offline kann die App keine aktuellen Kontostände liefern.

## Supabase einrichten

1. Ein Supabase-Projekt erstellen. In dessen SQL-Editor den vollständigen Inhalt von [`supabase/migrations/001_teamkasse.sql`](supabase/migrations/001_teamkasse.sql) ausführen. Anschließend [`supabase/migrations/002_whatsapp_catalog_aliases.sql`](supabase/migrations/002_whatsapp_catalog_aliases.sql) ausführen. Beide Migrationen sind einmalig; bei einer bestehenden Version-1-Datenbank nur Migration 002 ergänzen.
2. Für eine **Entwicklungsdatenbank** optional [`supabase/seed.sql`](supabase/seed.sql) ausführen. Die Beispieldaten sind fiktiv, und der Seed ist wiederholbar. In einer produktiven Datenbank zunächst ein eigenes Team als Datenbankbetreiber anlegen:

   ```sql
   insert into public.teams(name) values ('Dein Vereinsname') returning id;
   ```

3. Unter Supabase Auth einen Benutzer erstellen/einladen. Öffentliche Selbstregistrierung in Supabase deaktivieren; SMTP und Rate Limits für den Betrieb konfigurieren. Die App unterstützt PKCE-Code-Rückleitungen über `/auth/callback` und Token-Hash-E-Mails über `/auth/confirm`. Für Einladungen das Supabase-E-Mail-Template auf `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` setzen. Für Recovery entsprechend `type=recovery`. Nach Bestätigung führt die App zur Passwortvergabe. Für den ersten Test kann der Betreiber alternativ einen Benutzer mit Passwort direkt in Supabase Auth erstellen. Die E-Mail-Templates und Redirect-URLs vor Freigabe mit einem Testkonto prüfen.
4. Diesem ersten Benutzer **als Datenbankbetreiber** eine Admin-Mitgliedschaft zuordnen. UUIDs durch die tatsächlichen Werte ersetzen:

   ```sql
   insert into public.memberships(team_id,user_id,role)
   values ('TEAM-UUID','AUTH-BENUTZER-UUID','admin');
   ```

   Demo-Team-UUID nach dem Seed: `10000000-0000-4000-8000-000000000001`.

5. In `.env.local` konfigurieren:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=DEIN-PUBLISHABLE-KEY
   ```

   Der Publishable Key ist ein öffentlicher, durch RLS begrenzter Client-Key. **Keinen Service-Role-Key verwenden.** Die Anwendung benötigt keinen Service-Role-Key und enthält keine geheimen Zugangsdaten.

6. In Supabase Auth Site URL und erlaubte Redirect URLs passend zur App setzen. Für die Entwicklung die eigene lokale Origin und den Pfad `/auth/callback` erlauben, für den Betrieb die feste HTTPS-Domain. Der Passwort-Reset nutzt `/auth/callback?next=/login/reset`. Bei eigenem Reverse-Proxy gegebenenfalls `APP_ORIGIN` auf die feste öffentliche Origin setzen und den CSP-Supabase-Host in `proxy.ts` anpassen. Lokales Supabase über HTTP benötigt ebenfalls eine entsprechende `connect-src`-Regel.
7. Den Next.js-Prozess neu starten (bei `npm start` zuerst neu bauen), dann anmelden. Weitere Auth-Konten in Supabase erstellen/einladen und unter „Verwaltung → Konto zuordnen“ mit Rolle und Spielerkonto verknüpfen. Ein Auth-Konto ohne Mitgliedschaft bekommt keine Finanzdaten. Spielerrollen benötigen ein eigenes Spielerkonto. Ein Spieler kann pro Team nur einem Konto zugeordnet werden.

Version 1 verwendet bei mehreren Mitgliedschaften das Team mit der kleinsten UUID. Ein Teamwechsel ist noch nicht implementiert. Die Anwendung fällt bei fehlender Mitgliedschaft, Verbindungsfehlern oder nur teilweise gesetzter Supabase-Konfiguration **nicht** auf Demo-Daten zurück.

### Rollen

| Fähigkeit                                        | Spieler | Kassierer | Admin |
| ------------------------------------------------ | ------- | --------- | ----- |
| Eigenes Konto und eigene Zahlungsanteile         | Ja      | Ja        | Ja    |
| Alle Spielerkonten, Strafen, Zahlungen verwalten | Nein    | Ja        | Ja    |
| Katalog, Einstellungen, Mitglieder/Rollen        | Nein    | Nein      | Ja    |
| Änderungsprotokoll, Anonymisierung               | Nein    | Nein      | Ja    |

Die App verwendet ausschließlich die authentifizierte Supabase-Sitzung. Rollen und Teams aus Browser-Anfragen werden nicht als Berechtigungsgrundlage übernommen. Spieler dürfen keine Rohtransaktionen lesen: Die Funktion `own_payment_history` liefert bei Sammelzahlungen ausschließlich den eigenen Anteil und entfernt Verwendungszweck/Transaktions-ID. Im Live-Modus ist kein Rollenwechsel im Browser verfügbar.

## Datenmodell und Buchungen

Alle IDs sind UUIDs, Geldbeträge sind ganzzahlige Centbeträge. Teamübergreifende Beziehungen werden durch zusammengesetzte Fremdschlüssel verhindert. Das Schema umfasst `teams`, `players`, `memberships`, `penalty_types`, `penalties`, `transactions`, `payment_allocations`, `import_batches` und `audit_logs`.

Kontostand je Spieler:

```text
bestätigte Forderungen = Summe der bestätigten Strafen
zugeordnete Zahlungen  = Summe der positiven und negativen Zahlungszuordnungen
offen                 = max(0, Forderungen − Zahlungen)
Guthaben              = max(0, Zahlungen − Forderungen)
```

`payment_allocations` verbindet eine Transaktion mit Spieler und Forderung. Eine Zuordnung ohne Forderung stellt Guthaben dar. Bei neuen Bestätigungen wird vorhandenes Guthaben verteilt. Vorschläge, abgelehnte und stornierte Strafen erzeugen keine Forderung. Ein Storno gibt zugeordnete Beträge als Guthaben frei. Eine vollständige Rückbuchung erzeugt eine separate negative Transaktion mit `reverses_id` und negativen Zuordnungen. Die Originaltransaktion bleibt bestehen.

Die Datenbankfunktion `teamkasse_command` sperrt das Team während einer Änderung. Summen, Statuswechsel, Zuordnungen und Dubletten werden innerhalb einer Transaktion geprüft. Deferrable Constraint Trigger prüfen am Transaktionsende die Zuordnungssummen und Grenzen. Direkte Client-Schreibrechte auf den Tabellen sind entzogen. `teamkasse_state` liest einen konsistenten, durch RLS gefilterten Snapshot; die üblichen PostgREST-Seitenlimits kürzen keine Summen ab.

Eine externe Transaktions-ID ist pro Team und Kanal eindeutig. Manuelle Zahlungen ohne externe ID können nicht automatisch als Dublette erkannt werden. **Interne Bank-/PayPal-Transfers in Version 1 nicht als Spielerzahlung erfassen.** Das Schema kennt `transfer`; die manuelle Oberfläche und der spätere Import benötigen dafür noch einen eigenen Abgleichablauf. Version 1 bietet vollständige Rückbuchungen, keine Teilrückerstattungen.

## Tests ausführen

```bash
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
npm run test:e2e
```

- Vitest prüft offene Beträge, Teil-/Sammelzahlungen, Guthaben und Rückbuchungen, Storno, Dubletten, Identifikation, Rollenprüfung, Anonymisierung, CSV-/WhatsApp-Vorschauen, KI-Ausgabevalidierung und Anfragegrößen.
- `test:db` führt die Migration und den wiederholbaren Seed in **PGlite (echter PostgreSQL-Engine)** aus, inklusive RLS, tatsächlicher Datenbankrollen, atomarer RPCs, fremder Teams und privater Zahlungsanteile. `auth.uid()` und Auth-Benutzer werden im Test simuliert; Supabase Auth und das Netzwerk werden dadurch nicht getestet.
- Playwright startet den Produktionsserver auf Port 3100 und prüft im frischen Demo-Browserkonto Desktop und iPhone-Größe. Es prüft Bedienabläufe, Persistenz, Export, Layout, Dark Mode, Offline-Seite und API-Origin-Prüfung. Die Demo-Umgebungsvariablen müssen leer sein. Port 3100 muss frei sein; die Tests starten und beenden ihren eigenen Server, damit kein veralteter Build verwendet wird.

Für Browsertests ist Chromium nötig. Die Konfiguration verwendet ein vorhandenes `/usr/bin/chromium`, andernfalls:

```bash
npx playwright install chromium
# Optional eigener Browserpfad:
# PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/pfad/zu/chromium npm run test:e2e
```

Browser-Artefakte liegen in `test-results/` und sind Git-ignoriert. Es werden keine echten Zahlungsdaten verwendet. Der echte Supabase-Anmeldeablauf muss nach Konfiguration eines Projekts zusätzlich getestet werden; Zugangsdaten waren bei der Implementierung nicht vorhanden. Die Mobiltests sind Chromium-Emulation, keine Tests auf echten iPhones oder in Safari.

Prüfergebnisse und behobene Fehler stehen in [`docs/VALIDATION.md`](docs/VALIDATION.md).

## Datenschutz und Betrieb

- `.env.local` bleibt Git-ignoriert. Öffentliche Supabase-Schlüssel ersetzen keine RLS. Auth-Rate-Limits, E-Mail-Konfiguration, TLS, Backups und Zugriffsverwaltung sind Aufgaben des Betreibers.
- JSON-Schreibanfragen sind auf 16 KiB begrenzt, werden mit Zod validiert und benötigen die passende Origin. Die Produktions-CSP nutzt individuelle Script-Nonces. Auth-Seiten und Finanz-APIs werden weder vom Service Worker noch als statische Seiten gespeichert.
- Es gibt in Version 1 **keinen Datei-Upload-Endpunkt**. Die vorbereiteten TXT-/CSV-Parser begrenzen Texte auf 2 MB und CSVs auf 10.000 Zeilen. Bei späteren Uploads sind zusätzlich MIME-/Signaturprüfung, serverseitige Limits, begrenzte ZIP-Entpackung und menschliche Freigabe erforderlich.
- Datenexporte umfassen nur die für die aktuelle Rolle berechtigten Daten. CSV-Zellen werden gegen Tabellenkalkulations-Formeln abgesichert.
- Unter „Spieler“ kann ein Admin ein Konto nach expliziter Texteingabe anonymisieren. Name, Aliasse, Strafgründe, zugehörige Verwendungszwecke und **alle Freitext-Snapshots des Teamprotokolls** werden entfernt; die strukturierte Änderungshistorie bleibt. Spielerzugriff wird entzogen. UUIDs, Spieler-ID, externe Transaktions-IDs und Geldhistorie bleiben zur Nachvollziehbarkeit bestehen. Dies ist Pseudonymisierung/Redaktion, keine vollständige Löschung sämtlicher Daten.
- Der Betreiber muss anschließend bei Bedarf das betreffende Supabase-Auth-Konto, Auth-Logs, Exporte und Backups behandeln. Gesetzlich oder vereinsrechtlich notwendige Finanzaufbewahrung muss vor Löschung geklärt werden. Es gibt keine pauschale automatische Löschung der Finanzhistorie.
- Die einstellbare Frist (30–3650 Tage) gilt für importierte Nachrichtenbelege. `purge_expired_import_evidence()` entfernt abgelaufene Belegausschnitte; sie muss über eine vertrauenswürdige tägliche Datenbankaufgabe aufgerufen werden. Sie ist nicht für App-Clients freigegeben. Belegtexte werden grundsätzlich nicht in Audit-Snapshots kopiert. WhatsApp-Belege werden beim Übernehmen einzelner Vorschläge gespeichert. Vollständige Chats werden weder hochgeladen noch dauerhaft gespeichert.

## WhatsApp-Kurzmeldungen ausprobieren

1. Unter **Verwaltung** die Kategorie **Kronkorken fallen lassen** bearbeiten. Dort den vereinbarten Betrag sowie kommagetrennte Erkennungsbegriffe wie `Deckel, Kronkorken, Bierdeckel` hinterlegen. Der neue Demo-Katalog enthält hierfür einen rein fiktiven Betrag von 2 Euro; er ist keine Vorgabe für euer Team. Bei bereits gespeicherten älteren Demo-Daten die Kategorie selbst ergänzen oder bewusst die Demo zurücksetzen.
2. Unter **Spieler** muss `Jo` als Spitzname genau einem aktiven Spieler zugeordnet sein; im neuen Demo-Datensatz ist das Jonas Weber.
3. Unter **Importe** einen Android-/iPhone-Chat-Export als UTF-8-TXT ohne Medien auswählen (maximal 2 MB). Für einen lokalen Test reicht diese fiktive TXT-Zeile: `08.10.26, 19:30 - Trainer: Jo Deckel`.
4. Die Vorschau zeigt Jonas, die Kategorie und deren hinterlegten Betrag. Spieler und Kategorie können vor der Übernahme korrigiert werden. **Als Vorschlag übernehmen** speichert den Belegausschnitt und Nachrichten-Hash. Unter **Strafen** den Vorschlag anschließend bestätigen oder ablehnen. Erst die Bestätigung erzeugt eine Forderung.
5. Derselbe Export wird nach Übernahme nicht nochmals vorgeschlagen – auch nach Neuladen sowie nach Ablehnung oder Storno. Dublettenschutz gilt pro Team und Nachrichten-Hash (Datum, Uhrzeit, Absender und Originaltext). Eine nachträglich veränderte Nachricht oder ein geänderter Absender ist kein identischer Export und muss manuell geprüft werden.

Die Erkennung gleicht ganze normalisierte Wörter/Phrasen mit Kategoriebezeichnungen und konfigurierten Erkennungsbegriffen ab. Groß-/Kleinschreibung, Umlaute und Satzzeichen sind tolerant. Unbekannte Umschreibungen und Tippfehler werden nicht frei erraten: passende Synonyme im Katalog ergänzen. Es gibt keine aktive KI-Anbindung und keinen API-Schlüsselbedarf. Mehrere mögliche Spieler/Kategorien, abweichende Geldbeträge, Verneinungen und mögliche Ironie werden zur Prüfung markiert. Der Nachrichtenabsender wird nicht automatisch als bestrafter Spieler angenommen. Jede Übernahme verwendet den aktuellen Katalogbetrag; abweichende Sonderbeträge können weiterhin als begründete manuelle Strafe erfasst werden.

Vorschauen werden beim Verlassen des Importbereichs verworfen; nur übernommene Ausschnitte bleiben gespeichert. Maximal 500 Vorschläge werden pro Vorschau angezeigt; größere Exporte bitte aufteilen. ZIP, automatische verbindliche Forderungen und ein gesondertes Datei-Importprotokoll sind noch nicht implementiert. Übernahmen, Freigaben und Ablehnungen stehen im Änderungsprotokoll. In Supabase sind Belege in der App nur für Kassierer und Admin sichtbar; Audit-Snapshots enthalten keine Belegtexte. Die konfigurierbare Löschfrist greift über die dokumentierte Datenbankaufgabe. In der Demo gibt es keine Hintergrundaufgabe: zum Entfernen der lokalen Daten die Demo zurücksetzen.

## Nächste Entwicklungsphasen

| Bereich            | Stand in Version 1                                                                                           | Nächster überprüfbarer Schritt                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| PayPal-/Bank-CSV   | Getestete, reine Vorschauparser mit Mapping, EUR-Prüfung, ID-Dubletten und eindeutiger Spieleridentifikation | Upload, relevante Zeilen auswählen, Prüfmaske, atomare Import-RPC und Importprotokoll             |
| WhatsApp           | TXT-Import im Browser, Katalogsynonyme, Vorschlagsprüfung, persistente Dublettensperre und Belege            | ZIP ohne Medien, Importübersicht und optionaler KI-Adapter                                        |
| KI                 | Provider-Vertrag und Prüfung bekannter Spieler/Beträge; keine API-Aufrufe                                    | Server-only OpenAI-Adapter mit strukturierten Ausgaben, Minimal-Ausschnitten, Limits und Freigabe |
| Bank/PSD2          | Schnittstelle für regulierten Kontoinformationsanbieter                                                      | Anbieter auswählen; Consent-Flow; CAMT.053-Parser und Transferabgleich                            |
| Weitere Funktionen | Eine Mannschaft pro Ansicht, vollständige Rückbuchung                                                        | Teamwechsel, Teilrückerstattungen und Teilen einzelner Nachrichten                                |

Die CSV-Parser in `lib/imports/csv.ts` und der KI-Vertrag in `lib/ai.ts` sind vorbereitende Module. Der WhatsApp-TXT-Import ist integriert und speichert ausschließlich manuell übernommene Strafenvorschläge. CSV-Vorschauen fordern immer manuelle Freigabe; Namen werden nur bei genau einem Treffer zugeordnet. Der KI-Vertrag erlaubt ausschließlich Vorschläge und benötigt keine API-Schlüssel für den aktuellen Betrieb. Ein späterer OpenAI-Schlüssel gehört ausschließlich in serverseitige Umgebungsvariablen. Niemals private PayPal-Zugangsdaten, Online-Banking-Passwörter oder WhatsApp-Web-Scraper ergänzen.

Für weitere Entwicklung: zunächst einen kleinen Ablauf samt Fachlogiktest ergänzen, anschließend eine neue SQL-Migration und RLS-/RPC-Tests, danach Serverroute und Oberfläche. Die gemeinsame TypeScript-Kontologik und SQL-Logik müssen im Verhalten übereinstimmen. Den Lockfile einchecken und vor Freigaben alle Prüfungen ausführen.

## Projektstruktur

```text
app/                    App Router, Auth-Seiten und Server-API
components/             Oberfläche und PWA-Registrierung
lib/ledger.ts           Kontologik und lokale Demo-Befehle
lib/commands.ts         Zod-Eingaben und Rollenprüfung
lib/server-state.ts     Authentifizierter Datenbank-Snapshot
lib/imports/            CSV-Vorschauparser und WhatsApp-Katalogerkennung
supabase/migrations/    Tabellen, RLS, RPCs und Audit-Trigger
supabase/seed.sql        Wiederholbare fiktive Beispieldaten
scripts/test-db.mjs      PostgreSQL-Integrationstests
tests/                 Fachlogik- und Browserprüfungen
```
