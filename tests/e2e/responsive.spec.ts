import { test, expect } from "@playwright/test";

const SHOTS = process.env.SHOT_DIR;
const viewports = [
  { name: "iphone-se", width: 375, height: 667, mobile: true },
  { name: "iphone-14", width: 390, height: 844, mobile: true },
  { name: "ipad", width: 820, height: 1180, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];
const pages = ["/", "/items", "/movements", "/barcodes", "/settings", "/items/new", "/items/__first__"];

for (const vp of viewports) {
  test(`no horizontal overflow @ ${vp.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile,
      storageState: "tests/e2e/.auth.json", locale: "ar-SA",
    });
    const page = await ctx.newPage();
    const first = (await (await page.request.get("/api/items")).json()).items[0].id;
    for (const p0 of pages) {
      const p = p0.replace("__first__", first);
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      // Compare against the *device* width: mobile emulation would otherwise widen the layout viewport to fit overflow.
      const overflow = await page.evaluate((w) => Math.max(document.documentElement.scrollWidth, window.innerWidth) - w, vp.width);
      expect(overflow, `${p} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vp.name}${p0.replace(/\//g, "_")}.png`, fullPage: true });
    }
    await ctx.close();
  });
}
