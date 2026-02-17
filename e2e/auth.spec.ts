import { test, expect } from "@playwright/test";
import { TEST_USER } from "./helpers/seed";

// These tests run unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test("unauthenticated user is redirected from /dashboard to /login", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("new user can sign up and reach dashboard", async ({ page }) => {
  await page.goto("/signup");

  await page.getByLabel("Email").fill(`signup-${Date.now()}@vidtodoc.local`);
  await page.getByLabel("Password").fill("SignupTest123!");
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
});

test("existing user can log in and reach dashboard", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
});
