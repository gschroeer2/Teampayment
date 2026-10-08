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
