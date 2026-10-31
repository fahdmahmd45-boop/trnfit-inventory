import { test, expect } from "@playwright/test";

test.describe("authentication", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("protects pages and APIs when signed out", async ({ page, request }) => {
    await page.goto("/items");
    await expect(page).toHaveURL(/\/login$/);
    for (const url of ["/api/items", "/api/dashboard", "/api/movements", "/api/export?format=csv"]) {
      expect((await request.get(url)).status(), url).toBe(401);
    }
    const post = await request.post("/api/movements", { data: { type: "in", quantity: 1, variantId: crypto.randomUUID(), requestId: crypto.randomUUID() } });
    expect(post.status()).toBe(401);
  });

  test("access code is not shipped to the browser", async ({ page }) => {
    const bodies: string[] = [];
    page.on("response", async (r) => {
      if (/\.(js|html)$|\/login$/.test(r.url()) || r.request().resourceType() === "script") bodies.push(await r.text().catch(() => ""));
    });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.some((b) => b.includes("trnfit19"))).toBe(false);
  });

  test("rejects a wrong code, accepts the right one, logs out", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("login-code").fill("wrong-code");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toHaveText("رمز الدخول غير صحيح");

    await page.getByTestId("login-code").fill("trnfit19");
    await page.getByTestId("login-submit").click();
    await expect(page.getByRole("heading", { name: "لوحة المخزون" })).toBeVisible();
    const cookie = (await page.context().cookies()).find((c) => c.name === "trn_session")!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");

    await page.goto("/settings");
    await page.getByTestId("logout").click();
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get("/api/items")).status()).toBe(401);
  });
});
