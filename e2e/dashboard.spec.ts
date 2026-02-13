import { test, expect } from "@playwright/test";
import { TEST_PROJECT, TEST_CHAPTER, TEST_ARTICLES } from "./helpers/seed";

test("dashboard shows the seeded project", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Projects" })
  ).toBeVisible();
  await expect(page.getByText(TEST_PROJECT.name)).toBeVisible();
});

test("project overview shows stats and recent articles", async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT.slug}`);

  // Stats cards
  await expect(page.getByText("Articles").first()).toBeVisible();
  await expect(page.getByText("Published").first()).toBeVisible();

  // Recent articles section
  await expect(page.getByText("Recent Articles")).toBeVisible();
  await expect(page.getByText(TEST_ARTICLES.en.title).first()).toBeVisible();
});

test("article tree shows chapter and article with language badges", async ({
  page,
}) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/articles`);

  // Chapter title visible
  await expect(page.getByText(TEST_CHAPTER.title)).toBeVisible();

  // Article title visible
  await expect(page.getByText(TEST_ARTICLES.en.title)).toBeVisible();

  // Language badges
  await expect(page.getByText("en").first()).toBeVisible();
  await expect(page.getByText("de").first()).toBeVisible();
});

test("status filter by Draft shows no articles", async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT.slug}/articles`);

  // Open status filter and select Draft
  const statusTrigger = page.locator("button").filter({ hasText: "All statuses" });
  await statusTrigger.click();
  await page.getByRole("option", { name: "Draft" }).click();

  // No articles should be visible (both are published)
  await expect(page.getByText(TEST_ARTICLES.en.title)).not.toBeVisible();
});
