import { test, expect } from "@playwright/test";
import { TEST_PROJECT, TEST_ARTICLES } from "./helpers/seed";

const editorUrl = `/project/${TEST_PROJECT.slug}/article/${TEST_ARTICLES.en.slug}/edit?audience=${TEST_ARTICLES.en.audience}&lang=en`;
const editorUrlDe = `/project/${TEST_PROJECT.slug}/article/${TEST_ARTICLES.de.slug}/edit?audience=${TEST_ARTICLES.de.audience}&lang=de`;

test("editor loads with article title, audience badge, and action buttons", async ({
  page,
}) => {
  await page.goto(editorUrl);

  await expect(
    page.getByRole("heading", { name: TEST_ARTICLES.en.title })
  ).toBeVisible();
  await expect(page.getByText(TEST_ARTICLES.en.audience)).toBeVisible();
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
