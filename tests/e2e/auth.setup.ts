import { test as setup, expect } from "@playwright/test";

setup("sign in with the initial access code", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByTestId("login-code").fill("trnfit19");
  await page.getByTestId("login-submit").click();
  await expect(page.getByRole("heading", { name: "لوحة المخزون" })).toBeVisible();
  await page.context().storageState({ path: "tests/e2e/.auth.json" });
});
