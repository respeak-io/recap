import { test, expect } from "@playwright/test";
import { TEST_PROJECT, TEST_ARTICLES } from "./helpers/seed";

// These tests run unauthenticated (public docs pages)
test.use({ storageState: { cookies: [], origins: [] } });

test("public docs index shows project name and article card", async ({
  page,
}) => {
  await page.goto(`/${TEST_PROJECT.slug}`);

  await expect(
    page.getByRole("heading", { name: TEST_PROJECT.name })
  ).toBeVisible();
  await expect(page.getByText(TEST_ARTICLES.en.title).first()).toBeVisible();
});

test("public article page shows article content", async ({ page }) => {
  await page.goto(`/${TEST_PROJECT.slug}/${TEST_ARTICLES.en.slug}`);

  await expect(page.getByText("Prerequisites").first()).toBeVisible();
  await expect(page.getByText("Node.js 18")).toBeVisible();
});

test("search finds the article", async ({ page }) => {
  await page.goto(`/${TEST_PROJECT.slug}`);

  // Click the search button
  await page.getByRole("button", { name: /search docs/i }).click();

  // Type in search dialog
  await page.getByPlaceholder("Search documentation...").fill("installation");

  // Wait for debounce + results
  await expect(
    page.getByText(TEST_ARTICLES.en.title).first()
  ).toBeVisible({ timeout: 10000 });
});
