import { test, expect } from "@playwright/test";
const nav = (page: import("@playwright/test").Page, label: string) =>
  page
    .getByRole("navigation", { name: /(?:Hauptnavigation|Mobile Navigation)/ })
    .filter({ visible: true })
    .getByRole("button", { name: label, exact: true });
test("Dashboard, Datenänderung, Persistenz und Spielerzugriff", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Eure Kasse. Klarer Überblick." }),
  ).toBeVisible();
  await expect(page.getByText("Demo-Modus", { exact: true })).toBeVisible();
  await nav(page, "Spieler").click();
  await page.getByRole("button", { name: "Spieler hinzufügen" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Erik Demo");
  await page.getByLabel("Spitznamen & Namensvarianten").fill("Eri");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Speichern", exact: true })
    .click();
  await expect(page.getByText("Erik Demo", { exact: true })).toBeVisible();
  await page.reload();
  await nav(page, "Spieler").click();
  await expect(page.getByText("Erik Demo", { exact: true })).toBeVisible();
  await page.getByLabel("Demo-Rolle").selectOption("player");
  await expect(
    page.getByRole("heading", { name: "Dein Konto. Alles im Blick." }),
  ).toBeVisible();
  await expect(page.getByText("Erik Demo", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Strafe erfassen", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Verwaltung", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("Manuelle Strafe, Zahlung, Guthaben, Rückbuchung und Storno", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Strafe erfassen", exact: true })
    .click();
  await page
    .getByLabel("Spieler", { exact: true })
    .selectOption({ label: "Max Becker · MK-003" });
  await page.getByLabel("Betrag in Euro").fill("7,50");
  await page
    .getByLabel("Grund", { exact: true })
    .fill("Test ohne private Daten");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Speichern", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Zahlungen").click();
  await page
    .getByRole("button", { name: "Zahlung erfassen", exact: true })
    .click();
  await page.getByLabel("Betrag in Euro").fill("15,00");
  await page
    .getByLabel("Zahlung Spieler 1")
    .selectOption({ label: "Max Becker · MK-003" });
  await page.getByLabel("Verwendungszweck", { exact: true }).fill("E2E-DEMO");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Speichern", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "E2E-DEMO" });
  await expect(row).toContainText("15,00");
  await row.getByRole("button", { name: "Zahlung zurückbuchen" }).click();
  await page.getByLabel("Grund", { exact: true }).fill("Test-Rückbuchung");
  await page.getByRole("button", { name: "Zurückbuchen", exact: true }).click();
  await expect(
    page.getByText("Test-Rückbuchung", { exact: true }),
  ).toBeVisible();
  await nav(page, "Strafen").click();
  await page
    .getByRole("row")
    .filter({ hasText: "Test ohne private Daten" })
    .getByRole("button", { name: "Strafe stornieren" })
    .click();
  await page
    .getByLabel("Begründung / Vermerk")
    .fill("Test erfolgreich beendet");
  await page.getByRole("button", { name: "Stornieren", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Test ohne private Daten" }),
  ).toContainText("Storniert");
});
test("Sammelzahlung wird korrekt aufgeteilt und exportiert", async ({
  page,
}) => {
  await page.goto("/");
  await nav(page, "Zahlungen").click();
  await page
    .getByRole("button", { name: "Zahlung erfassen", exact: true })
    .click();
  await page.getByLabel("Betrag in Euro").fill("10,00");
  await page.getByLabel("Sammelzahlung").check();
  await page.getByLabel("Teilbetrag 1").fill("6,00");
  await page
    .getByRole("button", { name: "Weiteren Spieler hinzufügen" })
    .click();
  await page.getByLabel("Teilbetrag 2").fill("4,00");
  await page
    .getByLabel("Verwendungszweck", { exact: true })
    .fill("DEMO-SAMMEL");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Speichern", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "DEMO-SAMMEL" });
  await expect(row).toContainText("Jonas Weber · 6,00");
  await expect(row).toContainText("Leon Fischer · 4,00");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV exportieren" }).click();
  expect((await download).suggestedFilename()).toContain("teamkasse-payments");
});
test("Mobile Layout, Dark Mode und sichere PWA", async ({
  page,
  context,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Eure Kasse. Klarer Überblick." }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: `test-results/dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dunkles Design" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const keys = await page.evaluate(async () => {
    const cache = await caches.open("teamkasse-shell-v1");
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(keys.sort()).toEqual(["/icon.svg", "/offline.html"]);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Du bist gerade offline." }),
  ).toBeVisible();
  await context.setOffline(false);
});
test("API verweigert fremde Ursprünge und beschreibt Demo ehrlich", async ({
  request,
}) => {
  const state = await request.get("/api/state");
  expect(await state.json()).toEqual({ mode: "demo" });
  const blocked = await request.post("/api/commands", {
    headers: { Origin: "https://untrusted.example" },
    data: { type: "updateSettings", retentionDays: 90 },
  });
  expect(blocked.status()).toBe(403);
  const demo = await request.post("/api/commands", {
    headers: { Origin: "http://localhost:3100" },
    data: { type: "updateSettings", retentionDays: 90 },
  });
  expect(demo.status()).toBe(409);
});
test("Katalogpflege und bestätigte Anonymisierung erhalten die Finanzhistorie", async ({
  page,
}) => {
  await page.goto("/");
  await nav(page, "Verwaltung").click();
  await page.getByRole("button", { name: "Kategorie", exact: true }).click();
  await page.getByLabel("Kategorie", { exact: true }).fill("Demo-Vergehen");
  await page.getByLabel("Betrag in Euro").fill("4,00");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Speichern", exact: true })
    .click();
  await expect(page.getByText("Demo-Vergehen", { exact: true })).toBeVisible();
  await nav(page, "Spieler").click();
  const row = page.getByRole("row").filter({ hasText: "Jonas Weber" });
  await row.getByRole("button", { name: "Jonas Weber anonymisieren" }).click();
  await page
    .getByLabel("Zur Bestätigung ANONYMISIEREN eingeben")
    .fill("ANONYMISIEREN");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Speichern", exact: true })
    .click();
  await expect(
    page.getByText("Anonymisierter Spieler", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Anonymisierter Spieler" }),
  ).toContainText("Deaktiviert");
  await nav(page, "Zahlungen").click();
  await expect(
    page.getByText("Verwendungszweck anonymisiert", { exact: true }),
  ).toBeVisible();
});

test("WhatsApp-Kurzmeldung nutzt Katalogbetrag, benötigt Freigabe und verhindert erneuten Import", async ({
  page,
}) => {
  await page.goto("/");
  await nav(page, "Verwaltung").click();
  await page
    .getByRole("button", { name: "Kronkorken fallen lassen bearbeiten" })
    .click();
  await page.getByLabel("Betrag in Euro").fill("3,50");
  await page
    .getByLabel("Erkennungsbegriffe (kommagetrennt)")
    .fill("Deckel, Kronkorken, Bierdeckel");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Speichern", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Importe").click();
  const file = {
    name: "chat.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("08.10.26, 19:30 - Trainer: Jo Deckel"),
  };
  await page.getByLabel("WhatsApp-TXT auswählen").setInputFiles(file);
  await expect(
    page.getByText("Eindeutiger Vorschlag", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Spieler für Vorschlag")).toHaveValue(
    "20000000-0000-4000-8000-000000000001",
  );
  await expect(page.getByText(/Katalogbetrag: 3,50/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Als Vorschlag übernehmen" }).click();
  await expect(
    page.getByText("Alle angezeigten Vorschläge wurden übernommen."),
  ).toBeVisible();
  await page.reload();
  await nav(page, "Importe").click();
  await page.getByLabel("WhatsApp-TXT auswählen").setInputFiles({
    ...file,
    buffer: Buffer.from("[08.10.2026, 19:30:00] Trainer: Jo Deckel"),
  });
  await expect(
    page.getByText(/Keine neuen möglichen Strafmeldungen/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Als Vorschlag übernehmen" }),
  ).toHaveCount(0);
  await nav(page, "Strafen").click();
  const row = page
    .getByRole("row")
    .filter({ hasText: "Kronkorken fallen lassen" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("3,50");
  await expect(row).toContainText("Vorschlag");
  await row.getByRole("button", { name: "Strafe bestätigen" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "WhatsApp-Beleg: Jo Deckel",
  );
  await page
    .getByLabel("Begründung / Vermerk")
    .fill("Beleg und Katalog geprüft");
  await page.getByRole("button", { name: "Bestätigen", exact: true }).click();
  await expect(row).toContainText("Offen");
});

test("WhatsApp-Import weist ungültige Dateien zurück und lässt unklare Spieler prüfen", async ({
  page,
}) => {
  await page.goto("/");
  await nav(page, "Importe").click();
  const input = page.getByLabel("WhatsApp-TXT auswählen");
  await input.setInputFiles({
    name: "chat.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("bad"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "Bitte einen WhatsApp" }),
  ).toContainText("TXT");
  await input.setInputFiles({
    name: "chat.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(2_000_001),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "2 MB" }),
  ).toContainText("2 MB");
  await input.setInputFiles({
    name: "chat.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("08.10.26, 19:30 - Trainer: Jo und Leo Deckel?"),
  });
  await expect(
    page.getByText("Zuordnung prüfen", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Mehrere Spieler passen zur Nachricht."),
  ).toBeVisible();
  await expect(page.getByLabel("Spieler für Vorschlag")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Als Vorschlag übernehmen" }),
  ).toBeDisabled();
  await page
    .getByLabel("Spieler für Vorschlag")
    .selectOption({ label: "Jonas Weber · MK-001" });
  await expect(
    page.getByRole("button", { name: "Als Vorschlag übernehmen" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Vorschau verwerfen" }).click();
  await expect(
    page.getByRole("button", { name: "Als Vorschlag übernehmen" }),
  ).toHaveCount(0);
});

test("WhatsApp-Zeitraum filtert den gesamten Export und entfernt veraltete Vorschauen", async ({
  page,
}) => {
  await page.goto("/");
  await nav(page, "Importe").click();
  await page.getByLabel("Zeitraum von").fill("2026-10-01");
  await page.getByLabel("Zeitraum bis").fill("2026-10-08");
  await page.getByLabel("WhatsApp-TXT auswählen").setInputFiles({
    name: "gesamter-chat.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      [
        "[30.09.2026, 23:59:59] Trainer: Jo Kronkorken",
        "01.10.26, 00:00 - Trainer: Jo Deckel",
        "[08.10.2026, 23:59:59] Trainer: Jo Bierdeckel",
        "09.10.26, 00:00 - Trainer: Jo Deckel",
      ].join("\n"),
    ),
  });
  const proposals = page.getByRole("form", { name: /^Strafenvorschlag:/ });
  await expect(proposals).toHaveCount(2);
  await expect(proposals.nth(0)).toContainText("2026-10-01");
  await expect(proposals.nth(1)).toContainText("2026-10-08");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.getByLabel("Zeitraum von").fill("2026-10-08");
  await expect(proposals).toHaveCount(0);
  await page.getByRole("button", { name: "Zeitraum anwenden" }).click();
  await expect(proposals).toHaveCount(1);
  await expect(proposals).toContainText("Jo Bierdeckel");
  await page.getByLabel("Zeitraum von").fill("2026-10-09");
  await expect(proposals).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({ hasText: "Von-Datum" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Zeitraum anwenden" }),
  ).toBeDisabled();
  await page.getByLabel("Zeitraum von").fill("2026-10-08");
  await page.getByRole("button", { name: "Zeitraum anwenden" }).click();
  await expect(proposals).toHaveCount(1);
  await proposals
    .getByRole("button", { name: "Als Vorschlag übernehmen" })
    .click();
  await expect(
    page.getByText("Alle angezeigten Vorschläge wurden übernommen."),
  ).toBeVisible();
  await page.getByLabel("Zeitraum von").fill("");
  await page.getByLabel("Zeitraum bis").fill("");
  await page.getByRole("button", { name: "Zeitraum anwenden" }).click();
  await expect(proposals).toHaveCount(3);
  await expect(
    page.getByRole("form", { name: "Strafenvorschlag: Jo Bierdeckel" }),
  ).toHaveCount(0);
});

for (const extension of ["xlsx", "pdf"]) {
  test(`Strafenkatalog aus ${extension.toUpperCase()} importiert geprüfte Kategorien und verhindert Dubletten`, async ({
    page,
  }) => {
    await page.goto("/");
    await nav(page, "Verwaltung").click();
    const panel = page.getByRole("region", {
      name: "Strafenkatalog importieren",
    });
    await panel
      .getByLabel("Katalogdatei auswählen")
      .setInputFiles(`tests/fixtures/catalog.${extension}`);
    await expect(panel.getByLabel("Kategorie 1", { exact: true })).toHaveValue(
      "Testvergehen",
    );
    await expect(panel.getByLabel("Betrag 1", { exact: true })).toHaveValue(
      extension === "xlsx" ? "3.5" : "3,50",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await panel
      .getByRole("button", { name: "Geprüfte Kategorien übernehmen" })
      .click();
    await expect(
      panel.getByText("Diese Katalogdatei wurde bereits übernommen."),
    ).toBeVisible();
    await expect(page.getByText("Testvergehen", { exact: true })).toBeVisible();
    await page.reload();
    await nav(page, "Verwaltung").click();
    await panel
      .getByLabel("Katalogdatei auswählen")
      .setInputFiles(`tests/fixtures/catalog.${extension}`);
    await expect(
      panel.getByText("Diese Katalogdatei wurde bereits übernommen."),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Geprüfte Kategorien übernehmen" }),
    ).toHaveCount(0);
  });
}

test("Getränkefoto braucht Freigabe pro Bild, prüft Zuordnung und verhindert Doppelbuchungen (Erkennung gemockt)", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/drinks/analyze", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          available: true,
          reason: "Fiktiver Anbieter für diesen Browsertest.",
        },
      });
    expect(route.request().postDataJSON().consent).toBe(true);
    calls++;
    return route.fulfill({
      json: {
        rows: [
          {
            name: "Jo",
            cells: [{ date: "08.10.", count: 3, uncertain: false }],
          },
          {
            name: "Unbekannt",
            cells: [{ date: "08.10.2026", count: null, uncertain: true }],
          },
        ],
        notes: ["Fiktive Erkennung im Browsertest"],
      },
    });
  });
  await page.goto("/");
  await nav(page, "Importe").click();
  const panel = page.getByRole("region", { name: "Getränkeliste prüfen" });
  await panel.getByLabel("Listenkennung").fill("training-oktober-2026");
  await panel.getByLabel("Preis pro Getränk in Euro").fill("1,50");
  await panel.getByLabel("Jahr der Datumsüberschriften").fill("2026");
  await panel
    .getByLabel("Getränkefoto auswählen")
    .setInputFiles("tests/fixtures/drinks.png");
  await expect(panel.getByRole("img")).toBeVisible();
  const consent = panel.getByLabel(/Ich gebe dieses Foto/);
  await expect(consent).not.toBeChecked();
  await expect(
    panel.getByRole("button", { name: "Foto automatisch erkennen" }),
  ).toBeDisabled();
  expect(calls).toBe(0);
  await consent.check();
  await panel
    .getByRole("button", { name: "Foto automatisch erkennen" })
    .click();
  await expect(panel.getByLabel("Getränke Teammitglied 1")).toHaveValue(
    "20000000-0000-4000-8000-000000000001",
  );
  await expect(panel.getByLabel("Anzahl Getränke 1")).toHaveValue("3");
  await expect(panel.getByLabel("Getränkedatum 1")).toHaveValue("2026-10-08");
  await expect(panel.getByLabel("Getränke Teammitglied 2")).toHaveValue("");
  await expect(panel.getByLabel("Anzahl Getränke 2")).toHaveValue("");
  await expect(panel.getByText(/Gesamtbetrag:/)).toContainText("4,50");
  await expect(
    panel.getByRole("button", {
      name: "Geprüfte Getränkeforderungen übernehmen",
    }),
  ).toBeDisabled();
  await panel.getByLabel(/Ich habe Personen/).check();
  await panel
    .getByRole("button", { name: "Geprüfte Getränkeforderungen übernehmen" })
    .click();
  await expect(
    panel.getByText("Bereits erfasst – wird übersprungen"),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    localStorage.getItem("teamkasse-demo-v1"),
  );
  expect(saved).not.toContain("data:image/");
  expect(JSON.parse(saved!).state.drinkConsumptions).toHaveLength(1);
  await panel
    .getByLabel("Getränkefoto auswählen")
    .setInputFiles("tests/fixtures/drinks.png");
  await expect(consent).not.toBeChecked();
  await nav(page, "Strafen").click();
  await expect(
    page.getByRole("row").filter({ hasText: "Getränkeforderung" }),
  ).toContainText("4,50");
});

test("Getränkemaske funktioniert ohne API-Schlüssel und Foto-Erkennung ist im Demo gesperrt", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await nav(page, "Importe").click();
  const panel = page.getByRole("region", { name: "Getränkeliste prüfen" });
  await expect(
    panel.getByText(/Automatische Fotoerkennung benötigt/),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Verbrauchszelle manuell ergänzen" })
    .click();
  await panel.getByLabel("Name aus der Liste 1").fill("Jo");
  await expect(panel.getByLabel("Getränke Teammitglied 1")).toHaveValue(
    "20000000-0000-4000-8000-000000000001",
  );
  await panel.getByLabel("Listenkennung").fill("manuelle-demo-liste");
  await panel.getByLabel("Preis pro Getränk in Euro").fill("2,00");
  await panel.getByLabel("Getränkedatum 1").fill("2026-10-08");
  await panel.getByLabel("Anzahl Getränke 1").fill("2");
  await panel.getByLabel(/Ich habe Personen/).check();
  await panel
    .getByRole("button", { name: "Geprüfte Getränkeforderungen übernehmen" })
    .click();
  await expect(
    panel.getByText("Bereits erfasst – wird übersprungen"),
  ).toBeVisible();
  const blocked = await request.post("/api/drinks/analyze", {
    headers: { Origin: "https://untrusted.example" },
    data: { consent: true, image: "data:image/png;base64,TEST" },
  });
  expect(blocked.status()).toBe(403);
  const demo = await request.post("/api/drinks/analyze", {
    headers: { Origin: "http://localhost:3100" },
    data: { consent: true, image: "data:image/png;base64,TEST" },
  });
  expect(demo.status()).toBe(409);
  await page.getByLabel("Demo-Rolle").selectOption("player");
  await expect(panel).toHaveCount(0);
});
