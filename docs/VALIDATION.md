# Validierung

Geprüft in der Codex-Cloud mit Node.js 24.19.0, Next.js 16.4.0 und Chromium. Alle Testdaten sind fiktiv.

## Abschließende Ergebnisse

| Prüfung                                             | Ergebnis                                                     |
| --------------------------------------------------- | ------------------------------------------------------------ |
| TypeScript (`npm run typecheck`)                    | Bestanden                                                    |
| ESLint (`npm run lint`)                             | Bestanden, keine Warnungen                                   |
| Vitest (`npm test`)                                 | 63 Tests bestanden, keine übersprungen                       |
| PostgreSQL (`npm run test:db`)                      | 24 Prüfungen bestanden                                       |
| Entwicklungsstart (`npm run dev`)                   | Dashboard, Demo-API und interaktive Spielerübersicht geprüft |
| Wiederholbare Installation (`npm ci`)               | Gespeichertes Installationsskript vollständig ausgeführt     |
| Produktionsbuild (`npm run build -- --webpack`)     | Bestanden                                                    |
| Playwright (`npm run test:e2e`)                     | 38 Prüfungen bestanden: 19 Desktop + 19 in iPhone-Größe      |
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

Die PostgreSQL-Prüfungen verwenden PGlite mit simuliertem `auth.uid()`. Kein Supabase-Projekt war angebunden. Auth, SMTP, Redirect-Templates und echte Supabase-Netzwerkzugriffe sind noch an einem konfigurierten Projekt zu prüfen. Die Browserprüfungen verwenden Chromium, auch für die iPhone-Größe; Safari und echte Mobilgeräte sind nicht abgedeckt. PayPal-/Bankimporte und WhatsApp-OpenAI-Aufrufe sind noch nicht freigeschaltet. Der optionale OpenAI-Adapter für Getränkefotos ist implementiert; echte Anbieteraufrufe und Bilderkennungsqualität wurden mangels Testkonto nicht geprüft. Der WhatsApp-TXT-Import ist integriert und lokal sowie gegen die PostgreSQL-RPCs geprüft.

## Erweiterung: WhatsApp-Kurzformen

- Erkennung von „Jo Deckel“ über Spieler-Aliasse und bearbeitbare Katalogsynonyme, mit Beträgen ausschließlich aus dem Katalog.
- Fachtests für unbekannte/mehrdeutige Spieler, deaktivierte Einträge, Wortgrenzen, mehrere Kategorien und Beträge, Ironie, Verneinungen, wiederholte Exporte, alte Demo-Speicherstände, Vorschlagsstatus und Freigabe.
- Migrationen 001 und 002 sowie wiederholbarer Seed gegen PostgreSQL ausgeführt. Neue RPC-Prüfungen sichern Adminrechte für Katalogbegriffe, Teamgrenzen, Beleg-Hashes, Dubletten, Katalogbetrag trotz manipulierter Anfrage, Vorschlagsstatus und Belegredaktion im Audit.
- Desktop- und mobile Browserprüfungen bearbeiten den Katalogbetrag, importieren TXT, übernehmen einen Vorschlag, laden neu, prüfen den erneuten Import und bestätigen mit Originalbeleg. Weitere Prüfungen testen falsche Dateitypen, das 2-MB-Limit und manuelle Spielerzuordnung.
- Der erste Browserlauf bestand 14 von 16 Prüfungen. Zwei Uploadprüfungen scheiterten am Testselektor `getByRole("alert")`, der auch den internen Next.js-Routenansager traf. Nach Begrenzung auf die konkrete Fehlermeldung bestanden alle vier WhatsApp-Prüfungen auf Desktop und in iPhone-Größe. Die übrigen zwölf hatten bereits bestanden.
- Eine zusätzliche gezielte ESLint-Prüfung wurde versehentlich im Export-Checkout ohne installierte Pakete gestartet und scheiterte am nicht beschreibbaren npm-Cache. Die Wiederholung nutzt die vorhandene Installation im tatsächlichen Projektordner.
- TypeScript, ESLint, 33 Vitest-Fälle, 16 PostgreSQL-Prüfungen und Produktionsbuild bestanden. Ein zusätzlicher TypeScript-Lauf nach den letzten Änderungen bestand ebenfalls.

## Erweiterung: Zeitraum im WhatsApp-Import

- Bearbeitbare Von-/Bis-Datumsfelder vor und nach dem Upload; beide Kalendertage vollständig inklusive. Leere Grenzen bleiben offen. Das Datum stammt direkt aus dem Export, ohne Zeitzonenumrechnung.
- Filterung erfolgt vor Erkennung und Vorschlagslimit. Datumsänderungen entfernen die alte Vorschau; „Zeitraum anwenden“ liest dieselbe lokal gewählte Datei erneut. Gespeicherte Strafen und stabile Nachrichten-Hashes bleiben unverändert.
- Vier zusätzliche Fachtests prüfen inklusive Grenzen bis 23:59:59, einen einzelnen Tag, offene Grenzen, einen leeren Zeitraum, ungültige Daten, umgekehrte Grenzen und Dublettenschutz über Zeitraumwechsel hinweg. Alle 37 Vitest-Fälle bestanden.
- Alle sechs WhatsApp-Browserprüfungen bestanden auf Desktop und in iPhone-Größe, einschließlich des neuen Ablaufs mit vollständigem Chat, Änderung und erneuter Anwendung des Zeitraums, gesperrtem ungültigem Zeitraum und Übernahme nur zulässiger Vorschläge. Keine neuen Datenbankmigrationen oder Änderungen an der Zahlungslogik.
- ESLint und separate TypeScript-Prüfung bestanden. Der normale Turbopack-Build scheiterte in der aktuellen Sandbox an einem gesperrten internen Port; auch die erste Wiederholung mit erweiterten Rechten scheiterte daran. Ein Webpack-Build innerhalb der Sandbox scheiterte beim TypeScript-Unterprozess (`--showConfig`); mit erweiterten Ausführungsrechten bestand `npm run build -- --webpack` vollständig. Das Projekt-Buildskript bleibt unverändert; die Alternative ist eine Verifikationsmöglichkeit für diese Cloud-Umgebung.
- Git-Zugriff und lokaler Browser-Testserver benötigten in der aktuellen Sandbox erweiterte Ausführungsrechte. Abruf und Browserprüfungen waren damit erfolgreich.

## Erweiterung: PDF-/Excel-Katalog und Getränkelisten

- Installation aus dem Lockfile mit `npm ci` bestanden. Der Postinstall-Schritt kopiert den passenden PDF-Worker nach `public/`; er wird nicht als generierter Fremdcode eingecheckt. Produktionsaudit meldet keine bekannten Schwachstellen. PDF.js 6.4.299, read-excel-file 9.3.12 und Sharp 0.35.5 sind festgeschrieben.
- 51 Fachtests bestanden: neue Fälle für Spaltenzuordnung, Euro/Cent, PDF-Zeilen, XLSX-Archivgrenzen, atomare Katalogübernahme, bestehende Kategorien, Bildsignaturen, unsichere/mehrdeutige Namen, ungültige Datumszellen, Mengenberechnung, private Spieleransichten und logische Dubletten bei neuen Fotos.
- Alle drei Migrationen samt wiederholbarem Seed erfolgreich auf PGlite angewendet. 19 PostgreSQL-Prüfungen bestanden, einschließlich neuer Admin-/RLS-Tests, unveränderlicher Quellzellen, korrekt erzeugter Forderungen, Importprotokollen, Dateidubletten, Teamgrenzen und vollständiger Rückabwicklung fehlerhafter Stapel. Die private alte RPC-Implementierung ist nicht für authentifizierte Benutzer aufrufbar.
- Alle 26 Playwright-Prüfungen bestanden auf Desktop und in iPhone-Größe. Neue Browserfälle laden echte fiktive XLSX-/PDF-Dateien, prüfen Vorschau und wiederholte Übernahme. Getränketests prüfen pro Foto zurückgesetzte Freigabe, automatische Namenszuordnung, menschliche Mengenprüfung, manuelle Erfassung ohne Schlüssel und gesperrte Demo-/Cross-Origin-API-Aufrufe. Der Anbieter wird im Foto-Erkennungsfall ausdrücklich gemockt; es findet keine echte OpenAI-Verarbeitung statt.
- TypeScript, ESLint und abschließender Produktionsbuild mit Webpack bestanden. Bestehende Dashboard-, Zahlungs-, Rückbuchungs-, WhatsApp-, Rollen- und Offline-Prüfungen bestanden ebenfalls nach der Erweiterung.
- Frühere Prüfungen während dieser Erweiterung: TypeScript fand eine falsche Spaltenreferenz sowie eine in PDF.js 6 entfernte Option; beides korrigiert. ESLint prüfte zunächst den generierten, minifizierten PDF-Worker und meldete Fremdcodefehler; dieser wird jetzt explizit von Lint/Formatierung ausgeschlossen. Eine Formatprüfung fand vorübergehend einen falschen Stylesheetinhalt; die Ausgangsstile wurden vollständig wiederhergestellt und die Importstile ergänzt, anschließend im Desktop-/Mobilbrowser geprüft. Das Erzeugen der fiktiven PNG-Testdatei meldete einen nicht beschreibbaren Fontconfig-Cache; die Bilddatei wurde erstellt und erfolgreich in beiden Browsergrößen geladen.

Die echte Bildqualität muss mit einem eingerichteten Supabase-/OpenAI-Konto und einem anonymisierten Beispielfoto validiert werden. Gescannte PDFs, alte XLS-Dateien und HEIC-Fotos sind in dieser Version nicht unterstützt. Es gibt keinen automatischen Forderungseintrag allein durch eine KI-Antwort: erst die ausdrückliche Prüfung/Übernahme bucht die Getränkeforderung.

## Erweiterung: Personenlisten aus XLSX und Text-PDF

- Migration 004 ergänzt getrennte Vor-/Nachnamen und die fachliche Kategorie Spieler/Trainer/Betreuer. Auth-Rollen bleiben separat. Der atomare Import wird für Kassierer/Admin geprüft, serialisiert die Vergabe von MK-IDs und bewahrt bestehende Konten, Spitznamen und Aktivstatus.
- Gemeinsamer begrenzter XLSX-/PDF-Leser wird für Personen- und Katalogimport verwendet. PDF-Tabellen werden anhand der Überschriftenpositionen gelesen; mehrteilige Nachnamen bleiben erhalten. Keine gescannten PDFs, alten XLS-Dateien oder frei umgebrochenen Tabellen. Dateien bleiben im Browser; nur ausgewählte Personen und Importmetadaten werden gespeichert.
- Neun neue Vitest-Fälle prüfen Mapping, unbekannte Kategorien, mehrteilige PDF-Namen, eindeutige IDs, Datei-/Namensdubletten, bestehende Identität, Rollen/Teamgrenzen, alte Demo-Daten und Redaktion. Insgesamt 60 Tests bestanden.
- Fünf zusätzliche Prüfungen im echten PostgreSQL-Motor testen Migration 004, unzugängliche private RPCs, Rollen/Teamgrenzen, Auth-Rollen unabhängig von Personenkategorien, Datei-/Namensdubletten, bestehende Konten und vollständigen Rollback. Die bestehende Anonymisierungsprüfung kontrolliert nun zusätzlich die beiden Namensfelder. Insgesamt 24 Prüfungen bestanden.
- Der erste Browserlauf bestand 30 von 32 Prüfungen. Die beiden Fälle zur manuellen Kategorieänderung scheiterten am exakten `getByLabel("Kategorie")`-Testselektor für das Auswahlfeld. Die Anwendung zeigte das Feld korrekt; der Test wurde auf dessen zugängliche Combobox-Rolle umgestellt.

- Beim Korrigieren des Selektors wurde vorübergehend auch der Textfeld-Selektor im bestehenden Katalogtest geändert; dieser wurde gezielt wiederhergestellt. Die übrigen 30 Browserprüfungen bestanden in diesem Zwischenlauf.

- Der abschließende vollständige Browserlauf bestand alle 32 Prüfungen (16 Desktop, 16 in iPhone-Größe), einschließlich echter XLSX-/PDF-Dateien, bearbeiteter unbekannter Kategorien, Datei-/dateiübergreifender Dubletten, Persistenz, manueller Kategorieänderung, Rollenansicht sowie Dateityp-/Größenprüfung. TypeScript, ESLint, Formatprüfung und Produktionsbuild mit Webpack bestanden ebenfalls. Die Supabase-Einrichtung in README enthält Migration 004.

## Korrektur: Katalogübernahme ohne sichtbare Rückmeldung

- Das gemeldete Verhalten mit einem normal anklickbaren Übernahme-Button wurde an einer fiktiven zwölfzeiligen XLSX-Datei nachgestellt: ein ungültiger Betrag verhindert die atomare Übernahme, die Meldung lag jedoch oberhalb der Vorschau. Die beiden gezielten Browserprüfungen scheiterten vor der Korrektur auf Desktop und Mobil mit einem Sichtbarkeitsanteil von 0 für die Meldung.
- Die Katalogmaske zeigt Eingabe- und Speicherfehler nun unter dem Button und führt Fokus/Ansicht zur Meldung. Ausgewählte Zeilen werden gezählt, Eingaben während des Speicherns gesperrt. Speicherfehler werden gezielt an den Katalogaufruf weitergegeben, damit Meldungen anderer Importmasken keinen Scrollsprung im Katalog auslösen. Fehler nennen die tatsächliche Vorschauzeile, den Kategorienamen und die zu korrigierenden Felder. Doppelte ausgewählte Namen werden vor einem Schreibaufruf geprüft; die Zuordnung berücksichtigt korrigierte Namen.
- `EUR 5,00` und weitere eindeutige Euro-Schreibweisen werden akzeptiert. Deutsche Tausenderpunkte erfordern ein ausdrückliches Dezimalkomma. Fremdwährungen, mehrere Beträge und mehrdeutige Zahlen bleiben gesperrt. Die gemeinsame manuelle Zahlungslogik wurde nicht geändert.
- Drei neue Fachtests prüfen Geldformate, Zeilen-/Feldfehler, fehlende Auswahl, doppelte Namen und Zuordnung bearbeiteter Kategorien. Insgesamt 63 Vitest-Tests bestanden. Die 24 PostgreSQL-Prüfungen bestanden erneut; keine zusätzliche Migration nötig.
- Während der Korrektur meldete ESLint eine fehlende Fehlerursache beim Weiterreichen des Betragsfehlers; `cause` wird nun beibehalten. Der zusätzliche Browserfall für Speicherfehler fand zunächst einen TypeScript-Konflikt zwischen Browser-/Node-Typen beim Überschreiben von `crypto.randomUUID`. Die ausschließlich im isolierten Testbrowser vorgenommene Fehler-Injektion verwendet nun `Object.defineProperty`.

- Abschließend bestanden alle 38 Browserprüfungen (19 Desktop, 19 in iPhone-Größe), darunter sichtbare Zeilenfehler am unteren Button, Korrektur und erfolgreiche Übernahme, fehlende Auswahl, doppelte Namen sowie ein ausdrücklich injizierter Speicherfehler mit erfolgreichem Wiederholungsversuch. TypeScript, ESLint, Formatprüfung und Produktionsbuild mit Webpack bestanden. Insgesamt 125 automatisierte Fachlogik-/Datenbank-/Browserprüfungen bestanden. Eine private Nutzerdatei oder ein echtes Supabase-Projekt lag für diesen Fehlerbericht nicht vor; der nachgestellte Fehler und die Tests verwenden ausschließlich fiktive Daten.
