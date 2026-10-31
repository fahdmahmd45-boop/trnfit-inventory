import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFileSync } from "node:fs";

test("generates a print-ready PDF of labels (bulk, with copies)", async ({ page }) => {
  await page.goto("/barcodes");
  await page.getByText("تحديد الكل").click();
  await expect(page.locator("img[alt='label preview']")).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("pdf-btn").click()]);
  const pdf = await PDFDocument.load(readFileSync((await dl.path())!));
  expect(pdf.getPageCount()).toBe(4); // 4 SKUs × 1 copy, one 50×25 mm label per page
  const { width, height } = pdf.getPage(0).getSize();
  expect(Math.round((width / 72) * 25.4)).toBe(50);
  expect(Math.round((height / 72) * 25.4)).toBe(25);
});
