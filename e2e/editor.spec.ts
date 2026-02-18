import { test, expect } from "@playwright/test";
import { TEST_PROJECT, TEST_ARTICLES } from "./helpers/seed";

const editorUrl = `/project/${TEST_PROJECT.slug}/article/${TEST_ARTICLES.en.slug}/edit?lang=en`;
const editorUrlDe = `/project/${TEST_PROJECT.slug}/article/${TEST_ARTICLES.de.slug}/edit?lang=de`;

test("editor loads with article title and action buttons", async ({
  page,
}) => {
  await page.goto(editorUrl);

  await expect(
    page.getByRole("heading", { name: TEST_ARTICLES.en.title })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save" })
  ).toBeVisible();
  // With multiple languages, publish becomes a dropdown showing "Published"
  await expect(
    page.getByRole("button", { name: /Published|Unpublish/ })
  ).toBeVisible();
});

test("language tabs are visible with EN and DE", async ({ page }) => {
  await page.goto(editorUrl);

  const tabsList = page.getByRole("tablist");
  await expect(tabsList).toBeVisible();
  await expect(tabsList.getByText("EN")).toBeVisible();
  await expect(tabsList.getByText("DE")).toBeVisible();
});

test("slash command menu appears on / keystroke", async ({ page }) => {
  await page.goto(editorUrl);

  const editor = page.locator(".ProseMirror");
  await editor.click();

  // Move to end then add a new line to ensure clean context
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");

  await expect(page.getByText("Heading 2")).toBeVisible({ timeout: 3000 });
  await expect(page.getByText("Bullet List")).toBeVisible();
  await expect(page.getByText("Code Block")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText("Heading 2")).not.toBeVisible();
});

test("slash command filters items by query", async ({ page }) => {
  await page.goto(editorUrl);

  const editor = page.locator(".ProseMirror");
  await editor.click();

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/call");

  await expect(page.getByText("Info Callout")).toBeVisible({ timeout: 3000 });
  await expect(page.getByText("Heading 2")).not.toBeVisible();
});

test("bubble menu appears on text selection", async ({ page }) => {
  await page.goto(editorUrl);

  const editor = page.locator(".ProseMirror");
  const firstParagraph = editor.locator("p").first();
  await firstParagraph.click({ clickCount: 3 });

  // Bubble menu should show formatting buttons
  await expect(page.locator(".rounded-lg.border.bg-popover").first()).toBeVisible({
    timeout: 3000,
  });
});

test("translate button not visible on EN, visible on DE", async ({ page }) => {
  // EN editor — no translate button
  await page.goto(editorUrl);
  await expect(
    page.getByRole("button", { name: /translate/i })
  ).not.toBeVisible();

  // DE editor — translate button visible
  await page.goto(editorUrlDe);
  await expect(
    page.getByRole("button", { name: "Re-translate from English" })
  ).toBeVisible();
});
