import { test, expect } from "@playwright/test";

// Fake camera = sequence.y4m: BLK (1 s) → blank (1.2 s) → OLV (1 s) → blank (1.2 s), looping.
test("instant mode: rapid alternating scans, each appearance recorded exactly once", async ({ page }) => {
  const before = await (await page.request.get("/api/movements?limit=1")).json();
  const lastId: number = before.items[0]?.id ?? 0;

  await page.goto("/scan?mode=in");
  await page.getByTestId("fast-btn").click();
  await expect(page.getByTestId("fast-btn")).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(9000);
  await page.getByRole("link", { name: "إغلاق" }).click();
  await page.waitForTimeout(800); // let in-flight saves land

  const { items } = await (await page.request.get("/api/movements?limit=100")).json() as { items: { id: number; sku: string; createdAt: string; quantity: number; type: string }[] };
  const fresh = items.filter((m) => m.id > lastId).reverse();
  const blk = fresh.filter((m) => m.sku === "TRN-WWRAP-BLK");
  const olv = fresh.filter((m) => m.sku === "TRN-WWRAP-OLV");
  console.log(`[rapid] recorded ${fresh.length} movements: ${fresh.map((m) => m.sku.slice(-3) + "@" + m.createdAt.slice(17, 23)).join(", ")}`);
  expect(blk.length).toBeGreaterThanOrEqual(1);
  expect(olv.length).toBeGreaterThanOrEqual(1);
  expect(fresh.length).toBeGreaterThanOrEqual(3);
  // ≈ one record per appearance: 9 s / 4.4 s period → at most 3 appearances per SKU
  expect(blk.length).toBeLessThanOrEqual(3);
  expect(olv.length).toBeLessThanOrEqual(3);
  expect(fresh.every((m) => m.type === "in" && m.quantity === 1)).toBe(true);
  // No duplicate of the same SKU within one appearance (appearances are 4.4 s apart)
  for (const list of [blk, olv]) {
    for (let i = 1; i < list.length; i++) {
      expect(Date.parse(list[i].createdAt) - Date.parse(list[i - 1].createdAt)).toBeGreaterThan(2500);
    }
  }
});
