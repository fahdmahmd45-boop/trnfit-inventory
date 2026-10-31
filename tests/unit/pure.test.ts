import { describe, it, expect } from "vitest";
import { suggestSkuBase } from "@/lib/sku";
import { toCsv } from "@/lib/csv";
import { hashSecret, verifySecret } from "@/lib/password";
import { movementInput, productCreate, SKU_RE } from "@/lib/validation";

describe("SKU generation", () => {
  it("reproduces the TRN FIT naming scheme", () => {
    expect(suggestSkuBase("Wrist Wraps", "Black")).toBe("TRN-WWRAP-BLK");
    expect(suggestSkuBase("Wrist Wraps", "Olive Green")).toBe("TRN-WWRAP-OLV");
    expect(suggestSkuBase("Cowhide Leather Lifting Straps", "Tan Leather")).toBe("TRN-LSTRAP-TAN");
  });
  it("always yields a valid SKU, even for Arabic names", () => {
    for (const [n, v] of [["رباط", "أسود"], ["Knee Sleeves", "7mm"], ["", ""], ["Belt", "Camo Desert"]]) {
      expect(suggestSkuBase(n, v)).toMatch(SKU_RE);
    }
    expect(suggestSkuBase("رباط", "أسود")).toBe("TRN-ITEM-BLK");
  });
});

describe("CSV", () => {
  it("adds BOM, escapes quotes/commas and neutralises formulas", () => {
    const out = toCsv([["a,b", 'he said "hi"', "=SUM(A1)", 5]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain('"a,b","he said ""hi""",\'=SUM(A1),5');
  });
});

describe("access code hashing", () => {
  it("hashes with scrypt and verifies", async () => {
    const h = await hashSecret("trnfit19");
    expect(h).not.toContain("trnfit19");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifySecret("trnfit19", h)).toBe(true);
    expect(await verifySecret("trnfit18", h)).toBe(false);
    expect(await verifySecret("trnfit19", "garbage")).toBe(false);
  });
});

describe("validation", () => {
  const id = "7a369a74-acab-480b-96cc-a08d1b2b824b";
  it("rejects zero/negative/fractional quantities", () => {
    for (const q of [0, -1, 1.5]) {
      expect(movementInput.safeParse({ type: "in", variantId: id, requestId: id, quantity: q }).success).toBe(false);
    }
  });
  it("requires a reason for adjustments", () => {
    expect(movementInput.safeParse({ type: "adjust", variantId: id, requestId: id, quantity: 3 }).success).toBe(false);
    expect(movementInput.safeParse({ type: "adjust", variantId: id, requestId: id, quantity: 0, reason: "count" }).success).toBe(true);
  });
  it("normalises SKUs to upper case and rejects invalid ones", () => {
    const ok = productCreate.parse({ name: "Belt", variants: [{ sku: "trn-belt-blk" }] });
    expect(ok.variants[0].sku).toBe("TRN-BELT-BLK");
    expect(productCreate.safeParse({ name: "Belt", variants: [{ sku: "bad sku!" }] }).success).toBe(false);
  });
});
