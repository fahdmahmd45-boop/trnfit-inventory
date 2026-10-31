export type Item = {
  id: string; productId: string; name: string; nameAr: string | null; category: string;
  sku: string; barcode: string; variantName: string; color: string; size: string;
  quantity: number; lowStockThreshold: number; createdAt: string; updatedAt: string;
};
export type Movement = {
  id: number; variantId: string; sku: string; type: "in" | "out" | "adjust";
  quantity: number; quantityBefore: number; quantityAfter: number; note: string | null; reason: string | null;
  employeeName: string; productName: string; variantName: string; createdAt: string;
  cancelled: boolean; isReversal: boolean;
};
export type DashboardStats = {
  products: number; skus: number; units: number; lowStock: number; outOfStock: number;
  movementsToday: number; unitsInToday: number; unitsOutToday: number;
};
export type MovementResult = { movement: Movement; item: Item; duplicate: boolean };
