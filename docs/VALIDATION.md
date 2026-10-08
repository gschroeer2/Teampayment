# Validierung

Geprüft in der Codex-Cloud mit Node.js 24.19.0, Next.js 16.4.0 und Chromium. Alle Testdaten sind fiktiv.

## Abschließende Ergebnisse

| Prüfung                                             | Ergebnis                                                     |
| --------------------------------------------------- | ------------------------------------------------------------ |
| TypeScript (`npm run typecheck`)                    | Bestanden                                                    |
| ESLint (`npm run lint`)                             | Bestanden, keine Warnungen                                   |
| Vitest (`npm test`)                                 | 23 Tests bestanden, keine übersprungen                       |
| PostgreSQL (`npm run test:db`)                      | 14 Prüfungen bestanden                                       |
| Entwicklungsstart (`npm run dev`)                   | Dashboard, Demo-API und interaktive Spielerübersicht geprüft |
| Wiederholbare Installation (`npm ci`)               | Gespeichertes Installationsskript vollständig ausgeführt     |
| Produktionsbuild (`npm run build`)                  | Bestanden                                                    |
| Playwright (`npm run test:e2e`)                     | 12 Prüfungen bestanden: 6 Desktop + 6 iPhone-Größe           |
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

Die PostgreSQL-Prüfungen verwenden PGlite mit simuliertem `auth.uid()`. Kein Supabase-Projekt war angebunden. Auth, SMTP, Redirect-Templates und echte Supabase-Netzwerkzugriffe sind noch an einem konfigurierten Projekt zu prüfen. Die Browserprüfungen verwenden Chromium, auch für die iPhone-Größe; Safari und echte Mobilgeräte sind nicht abgedeckt. Externe Importe und OpenAI-Aufrufe sind noch nicht freigeschaltet.
