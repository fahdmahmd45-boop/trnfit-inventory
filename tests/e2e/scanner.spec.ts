import { test, expect } from "@playwright/test";

// Fake camera = tests/e2e/fixtures/static-blk.y4m: the app-generated TRN-WWRAP-BLK label, blurred + noisy, always in view.
test.describe.configure({ mode: "serial" });

test("camera scan → identify → stock in → ready for next scan", async ({ page }) => {
  await page.goto("/");
  const t0 = Date.now();
  await page.getByTestId("dash-scan").click();
  await expect(page.getByTestId("scan-hint")).toHaveText("ضع الباركود داخل الإطار الأخضر");
  await expect(page.getByTestId("scan-frame")).toBeVisible();

  const title = page.getByTestId("sheet-title");
  await expect(title).toHaveText("رباط المعصم — Black", { timeout: 10_000 });
  const tapToSheetMs = Date.now() - t0;
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/scan-sheet.png` });
  await expect(page.getByTestId("sheet-qty")).toHaveText("0");
  const stats = await page.evaluate(() => (window as unknown as { __scanStats: Record<string, unknown> }).__scanStats);
  console.log(`[scanner] tap→product sheet ${tapToSheetMs} ms; camera-start→first decode ${stats.firstDetectMs} ms; ` +
    `last decode ${stats.decodeMs} ms; ${stats.fps} decodes/s; roi ${stats.roi}`);
  expect(stats.firstDetectMs as number).toBeLessThan(1500);

  // Choose quantity 3 and confirm (scan → +2 → confirm)
  await page.getByRole("button", { name: "+1", exact: true }).click();
  await page.getByRole("button", { name: "+1", exact: true }).click();
  await page.getByTestId("confirm-movement").click();
  await expect(title).toBeHidden();
  await expect(page.getByTestId("last-scan")).toContainText("3");
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/scan-live.png` });
  await expect(page.getByText(/تم تسجيل الحركة بنجاح/)).toBeVisible();

  // The same code is still in front of the camera: it must NOT be re-recorded / re-opened.
  await page.waitForTimeout(3000);
  await expect(title).toBeHidden();

  const res = await page.request.get("/api/lookup?code=TRN-WWRAP-BLK");
  expect((await res.json()).item.quantity).toBe(3);
});

test("camera tracks stop immediately when the scanner closes", async ({ page }) => {
  await page.goto("/scan");
  await expect(page.getByTestId("sheet-title")).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    const w = window as unknown as { __tracks: MediaStreamTrack[] };
    w.__tracks = (document.querySelector("video")!.srcObject as MediaStream).getTracks();
  });
  await page.keyboard.press("Escape"); // close sheet
  await page.getByRole("link", { name: "إغلاق" }).click();
  await expect(page).toHaveURL(/\/$/);
  const states = await page.evaluate(() => (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.map((t) => t.readyState));
  expect(states.length).toBeGreaterThan(0);
  expect(states.every((s) => s === "ended")).toBe(true);
  // Re-open: a fresh session starts and decodes again (no duplicate sessions / stale worker).
  await page.getByTestId("dash-scan").click();
  await expect(page.getByTestId("sheet-title")).toBeVisible({ timeout: 10_000 });
  expect(await page.locator("video").count()).toBe(1);
});

test("manual entry, unknown barcode and image upload fallbacks", async ({ page }) => {
  await page.goto("/scan");
  await expect(page.getByTestId("sheet-title")).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");

  await page.getByTestId("manual-btn").click();
  await page.getByTestId("manual-input").fill("trn-lstrap-tan");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sheet-title")).toContainText("Tan Leather");
  await page.keyboard.press("Escape");

  await page.getByTestId("manual-btn").click();
  await page.getByTestId("manual-input").fill("UNKNOWN-123");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("unknown-sheet")).toContainText("UNKNOWN-123");
  await page.getByRole("button", { name: "مسح التالي" }).click();

  await page.getByTestId("image-input").setInputFiles("tests/e2e/fixtures/TRN-WWRAP-OLV.png");
  await expect(page.getByTestId("sheet-title")).toContainText("Olive Green");
  // Stock out more than available is blocked
  await page.getByRole("tab", { name: "صادر" }).click();
  await page.getByTestId("qty-input").fill("999");
  await expect(page.getByTestId("confirm-movement")).toBeDisabled();
});
