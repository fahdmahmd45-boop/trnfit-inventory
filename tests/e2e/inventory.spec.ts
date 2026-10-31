import { test, expect, type Page } from "@playwright/test";
import * as XLSX from "./xlsx-read";

const statValue = (page: Page, label: string) => page.getByTestId(`stat-${label}`);

test("dashboard shows database stats for the three seeded products", async ({ page }) => {
  await page.goto("/");
  await expect(statValue(page, "عدد المنتجات")).toHaveText("3");
  await expect(statValue(page, "إجمالي الوحدات")).toHaveText("0");
  await expect(statValue(page, "نفد المخزون")).toHaveText("3");
  await expect(page.getByText("TRN-WWRAP-OLV").first()).toBeVisible();
});

test("stock in, stock out, negative prevention, adjustment, persistence", async ({ page }) => {
  await page.goto("/items");
  await page.getByTestId("items-search").fill("olv");
  const rows = page.getByTestId("item-row").filter({ visible: true });
  await expect(rows).toHaveCount(1);
  await rows.getByRole("link").first().click();
  await expect(page.getByTestId("item-title")).toContainText("Olive Green");

  // Stock in 12
  await page.getByTestId("btn-in").click();
  await page.getByTestId("qty-input").fill("12");
  await page.getByTestId("confirm-movement").click();
  await expect(page.getByText("تم تسجيل الحركة بنجاح")).toBeVisible();
  await expect(page.getByTestId("detail-qty")).toHaveText("12");

  // Stock out 5
  await page.getByTestId("btn-out").click();
  await page.getByTestId("qty-input").fill("5");
  await page.getByTestId("confirm-movement").click();
  await expect(page.getByTestId("detail-qty")).toHaveText("7");

  // Out more than available → blocked in the UI
  await page.getByTestId("btn-out").click();
  await page.getByTestId("qty-input").fill("8");
  await expect(page.getByTestId("confirm-movement")).toBeDisabled();
  await expect(page.getByText("الكمية غير كافية — المتوفر: 7")).toBeVisible();
  await page.keyboard.press("Escape");

  // …and by the API even if the UI is bypassed
  const id = page.url().split("/").pop()!;
  const api = await page.request.post("/api/movements", { data: { type: "out", quantity: 8, variantId: id, requestId: crypto.randomUUID() } });
  expect(api.status()).toBe(409);
  expect(await api.json()).toEqual({ error: "INSUFFICIENT_STOCK", available: 7 });

  // Adjustment requires a reason
  await page.getByTestId("btn-adjust").click();
  await page.getByTestId("qty-input").fill("6");
  await expect(page.getByTestId("confirm-movement")).toBeDisabled();
  await page.getByTestId("reason-input").fill("جرد فعلي");
  await page.getByTestId("confirm-movement").click();
  await expect(page.getByTestId("detail-qty")).toHaveText("6");

  // History + persistence after refresh
  await page.reload();
  await expect(page.getByTestId("detail-qty")).toHaveText("6");
  const history = page.getByTestId("movement-row");
  await expect(history).toHaveCount(3);
  await expect(history.first()).toContainText("جرد فعلي");
  await expect(history.first()).toContainText("7 → 6");

  await page.goto("/");
  await expect(statValue(page, "إجمالي الوحدات")).toHaveText("6");
  await expect(statValue(page, "نفد المخزون")).toHaveText("2");
});

test("create a product with generated SKUs and edit it", async ({ page }) => {
  await page.goto("/items/new");
  await page.getByTestId("np-name").fill("Lifting Belt");
  await page.getByTestId("nv-variant-0").fill("Black");
  await page.getByTestId("nv-gen-0").click();
  await expect(page.getByTestId("nv-sku-0")).toHaveValue("TRN-LBELT-BLK");
  await page.getByTestId("nv-qty-0").fill("4");
  await page.getByTestId("np-save").click();
  await expect(page.getByTestId("item-title")).toHaveText("Lifting Belt — Black");
  await expect(page.getByTestId("detail-qty")).toHaveText("4");

  await page.getByTestId("edit-btn").click();
  await page.getByTestId("edit-lowStockThreshold").fill("10");
  await page.getByTestId("edit-size").fill("M");
  await page.getByTestId("save-edit").click();
  await expect(page.getByText("تم الحفظ")).toBeVisible();
  await page.reload();
  await expect(page.getByText("منخفض").first()).toBeVisible(); // 4 ≤ 10 → low stock

  // Duplicate SKU is rejected
  await page.goto("/items/new");
  await page.getByTestId("np-name").fill("Another");
  await page.getByTestId("nv-sku-0").fill("TRN-LBELT-BLK");
  await page.getByTestId("np-save").click();
  await expect(page.getByText("SKU مستخدم مسبقاً")).toBeVisible();
});

test("exports CSV and Excel", async ({ page }) => {
  const csv = await page.request.get("/api/export?format=csv&dataset=inventory");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain("TRN-WWRAP-OLV");
  expect(text.split("\r\n").filter(Boolean)).toHaveLength(1 + 4);

  const xlsx = await page.request.get("/api/export?format=xlsx&dataset=movements");
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  const rows = await XLSX.firstSheetRows(await xlsx.body());
  expect(rows[0]).toContain("SKU");
  expect(rows.length).toBeGreaterThan(3);
});

test("language switch to English flips direction", async ({ page }) => {
  await page.goto("/settings");
  await page.getByTestId("lang-en").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByTestId("lang-ar").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
