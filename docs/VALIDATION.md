# Validierung

Geprüft in der Codex-Cloud mit Node.js 24.19.0, Next.js 16.4.0 und Chromium. Alle Testdaten sind fiktiv.

## Abschließende Ergebnisse

| Prüfung                                             | Ergebnis                                                     |
| --------------------------------------------------- | ------------------------------------------------------------ |
| TypeScript (`npm run typecheck`)                    | Bestanden                                                    |
| ESLint (`npm run lint`)                             | Bestanden, keine Warnungen                                   |
| Vitest (`npm test`)                                 | 33 Tests bestanden, keine übersprungen                       |
| PostgreSQL (`npm run test:db`)                      | 16 Prüfungen bestanden                                       |
| Entwicklungsstart (`npm run dev`)                   | Dashboard, Demo-API und interaktive Spielerübersicht geprüft |
| Wiederholbare Installation (`npm ci`)               | Gespeichertes Installationsskript vollständig ausgeführt     |
| Produktionsbuild (`npm run build`)                  | Bestanden                                                    |
| Playwright (`npm run test:e2e`)                     | 16 unterschiedliche Prüfungen bestanden: 8 Desktop + 8 iPhone-Größe           |
| Produktions-Abhängigkeiten (`npm audit --omit=dev`) | Keine gemeldeten Schwachstellen im geprüften Stand           |

Die Browserprüfungen starten einen eigenen Produktionsserver; sie lesen und verändern Daten, exportieren CSV, prüfen Rollenansichten, Katalogpflege, Konto-Anonymisierung, Rückbuchung und die Offline-Seite. Alle Prüfungen sind abgeschlossen. Während der Entwicklung gescheiterte Prüfungen und ihre Ursachen sind unten dokumentiert.

## Während der Umsetzung behobene Fehler

- Next.js 16.4 blockierte Entwicklungsassets über die zusätzliche Loopback-Adresse: `127.0.0.1` als konkrete erlaubte Entwicklungs-Origin ergänzt; `localhost` funktionierte bereits.
- npm-Cache war im nicht beschreibbaren Benutzerverzeichnis: für die Cloud `/tmp/teamkasse-npm` verwenden.
- ESLint-10-Kompatibilität: das Next-Sammelpaket enthielt Plugins mit veralteten Peer-Ranges; direkte, ESLint-10-kompatible TypeScript-, React-Hooks- und Next-Plugins verwenden.
- React-Lint-Regeln: Komponenten aus dem Renderpfad herausgezogen, Dialog-Refs korrigiert und Fehlerbehandlung vom JSX getrennt.
- Guthaben musste auch nach späteren Forderungen verteilt werden: TypeScript- und SQL-Logik erweitert und regressionsgetestet.
- Mobile Tabellen hatten aus dem Scrollcontainer ragende, versteckte Accessibility-Labels: durch positionierten Scrollcontainer begrenzt.
- Zu frühe Interaktion vor Hydration konnte einen ersten Klick verlieren: Oberfläche ist bis zur Initialisierung inert.
- Auswahlfeldbeschriftungen und mehrdeutige Browser-Testselektoren: explizite Labels und auf den Dialog begrenzte Selektoren ergänzt.
- Ein Diagnose-Server lief noch mit altem Build: beendet; Browserprüfungen verwenden jetzt ausschließlich einen eigenen frischen Server.
- Origin-Prüfung verglich im lokalen Server die interne Bind-Adresse mit der Browser-Origin: Host-basierte Prüfung mit optionaler fester Deployment-Origin ergänzt.

## Grenzen der Aussagekraft

Die PostgreSQL-Prüfungen verwenden PGlite mit simuliertem `auth.uid()`. Kein Supabase-Projekt war angebunden. Auth, SMTP, Redirect-Templates und echte Supabase-Netzwerkzugriffe sind noch an einem konfigurierten Projekt zu prüfen. Die Browserprüfungen verwenden Chromium, auch für die iPhone-Größe; Safari und echte Mobilgeräte sind nicht abgedeckt. PayPal-/Bankimporte und OpenAI-Aufrufe sind noch nicht freigeschaltet. Der WhatsApp-TXT-Import ist integriert und lokal sowie gegen die PostgreSQL-RPCs geprüft.

## Erweiterung: WhatsApp-Kurzformen

- Erkennung von „Jo Deckel“ über Spieler-Aliasse und bearbeitbare Katalogsynonyme, mit Beträgen ausschließlich aus dem Katalog.
- Fachtests für unbekannte/mehrdeutige Spieler, deaktivierte Einträge, Wortgrenzen, mehrere Kategorien und Beträge, Ironie, Verneinungen, wiederholte Exporte, alte Demo-Speicherstände, Vorschlagsstatus und Freigabe.
- Migrationen 001 und 002 sowie wiederholbarer Seed gegen PostgreSQL ausgeführt. Neue RPC-Prüfungen sichern Adminrechte für Katalogbegriffe, Teamgrenzen, Beleg-Hashes, Dubletten, Katalogbetrag trotz manipulierter Anfrage, Vorschlagsstatus und Belegredaktion im Audit.
- Desktop- und mobile Browserprüfungen bearbeiten den Katalogbetrag, importieren TXT, übernehmen einen Vorschlag, laden neu, prüfen den erneuten Import und bestätigen mit Originalbeleg. Weitere Prüfungen testen falsche Dateitypen, das 2-MB-Limit und manuelle Spielerzuordnung.
- Der erste Browserlauf bestand 14 von 16 Prüfungen. Zwei Uploadprüfungen scheiterten am Testselektor `getByRole("alert")`, der auch den internen Next.js-Routenansager traf. Nach Begrenzung auf die konkrete Fehlermeldung bestanden alle vier WhatsApp-Prüfungen auf Desktop und in iPhone-Größe. Die übrigen zwölf hatten bereits bestanden.
- Eine zusätzliche gezielte ESLint-Prüfung wurde versehentlich im Export-Checkout ohne installierte Pakete gestartet und scheiterte am nicht beschreibbaren npm-Cache. Die Wiederholung nutzt die vorhandene Installation im tatsächlichen Projektordner.
- TypeScript, ESLint, 33 Vitest-Fälle, 16 PostgreSQL-Prüfungen und Produktionsbuild bestanden. Ein zusätzlicher TypeScript-Lauf nach den letzten Änderungen bestand ebenfalls.
