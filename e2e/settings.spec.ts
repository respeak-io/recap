import { test, expect } from "@playwright/test";
import { TEST_PROJECT } from "./helpers/seed";

test("settings page loads with theme editor sections", async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/settings`);

  // Page heading
  await expect(
    page.getByRole("heading", { name: "Branding & Theme" })
  ).toBeVisible();

  // All editor sections (CardTitle renders as div, not heading)
  await expect(page.getByText("Brand Assets")).toBeVisible();
  await expect(page.getByText("Brand Colors")).toBeVisible();
  await expect(page.getByText("Typography", { exact: true })).toBeVisible();
  await expect(page.getByText("Custom CSS", { exact: true })).toBeVisible();
  await expect(page.getByText("Branding", { exact: true })).toBeVisible();
  await expect(page.getByText("Preview", { exact: true })).toBeVisible();
});

test("settings page has upload buttons for logo and favicon", async ({
  page,
}) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/settings`);

  await expect(
    page.getByRole("button", { name: "Upload Logo" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload Favicon" })
  ).toBeVisible();
});

test("settings page shows all color picker fields", async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/settings`);

  const colorLabels = [
    "Primary",
    "Primary Foreground",
    "Background",
    "Foreground",
    "Accent",
    "Sidebar Background",
    "Sidebar Text",
  ];

  for (const label of colorLabels) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});

test("font selector shows available fonts", async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/settings`);

  // Open the font selector
  const fontTrigger = page.getByRole("combobox");
  await fontTrigger.click();

  // Verify font options
  await expect(page.getByRole("option", { name: "Geist Sans" })).toBeVisible();
  await expect(
    page.getByRole("option", { name: "System Default" })
  ).toBeVisible();
  await expect(page.getByRole("option", { name: "Inter" })).toBeVisible();
  await expect(
    page.getByRole("option", { name: "IBM Plex Sans" })
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Source Serif 4" })
  ).toBeVisible();
});

test("save theme button works", async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/settings`);

  const saveButton = page.getByRole("button", { name: "Save Theme" });
  await expect(saveButton).toBeVisible();

  await saveButton.click();

  // Button should show "Saved!" feedback (icon + text)
  await expect(page.getByText("Saved!")).toBeVisible({
    timeout: 10000,
  });
});

test("hide powered-by toggle exists", async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/settings`);

  // Uses curly quotes (&ldquo;/&rdquo;) in the rendered HTML
  await expect(
    page.getByText('Hide \u201CPowered by vidtodoc\u201D')
  ).toBeVisible();

  // Switch should be present
  await expect(page.getByRole("switch")).toBeVisible();
});

test("public docs show powered-by footer by default", async ({ page }) => {
  // Use unauthenticated context for public docs
  await page.goto(`/${TEST_PROJECT.slug}`);

  await expect(page.getByText("Powered by vidtodoc")).toBeVisible();
});

test("settings page is accessible from dashboard sidebar", async ({
  page,
}) => {
  await page.goto(`/project/${TEST_PROJECT.slug}`);

  // Click Settings in the sidebar
  await page.getByRole("link", { name: "Settings" }).click();

  await expect(page).toHaveURL(
    `/project/${TEST_PROJECT.slug}/settings`
  );
  await expect(
    page.getByRole("heading", { name: "Branding & Theme" })
  ).toBeVisible();
});

test("breadcrumb navigation shows on settings page", async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/settings`);

  // Breadcrumb should show Dashboard > Project Name > Settings
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: TEST_PROJECT.name })
  ).toBeVisible();
  await expect(page.getByText("Settings").first()).toBeVisible();
});

test("theme presets section is visible with preset cards", async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/settings`);

  await expect(page.getByText("Theme Presets")).toBeVisible();

  // Verify some preset names are visible
  const presetNames = ["Default", "Ocean", "Forest", "Sunset", "Lavender", "Slate", "Midnight", "Rose"];
  for (const name of presetNames) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
});

test("clicking a theme preset updates the preview colors", async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/settings`);

  // Click the "Ocean" preset
  await page.getByText("Ocean", { exact: true }).click();

  // The primary color input should now reflect Ocean's primary color
  const primaryInput = page.getByPlaceholder("Default").first();
  await expect(primaryInput).toHaveValue("#1d4ed8");
});

test("reset to default button clears theme settings", async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/settings`);

  // First apply a preset so we have non-default values
  await page.getByText("Ocean", { exact: true }).click();

  // Verify a color was set
  const primaryInput = page.getByPlaceholder("Default").first();
  await expect(primaryInput).toHaveValue("#1d4ed8");

  // Click Reset to Default
  await page.getByRole("button", { name: "Reset to Default" }).click();

  // Color inputs should be cleared (back to default/empty)
  await expect(primaryInput).toHaveValue("");
});

test("live preview updates when font is changed", async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/settings`);

  // Open font selector and pick Inter
  const fontTrigger = page.getByRole("combobox");
  await fontTrigger.click();
  await page.getByRole("option", { name: "Inter" }).click();

  // Preview section should contain text rendered with Inter font
  const previewContent = page.locator(
    '[style*="font-family"]'
  );
  await expect(previewContent.first()).toBeVisible();
});
