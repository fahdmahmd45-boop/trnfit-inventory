"use client";
import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { api, ApiClientError, uuid } from "@/lib/api";
import type { Item, MovementResult } from "@/lib/types";

export type MoveType = "in" | "out" | "adjust";
export type MoveArgs = { item: Item; type: MoveType; quantity: number; note?: string; reason?: string };

const isItemsKey = (k: unknown) => typeof k === "string" && k.startsWith("/api/items");

/**
 * Records a stock movement with an optimistic cache update. Network failures are retried with the
 * same requestId (server dedupes), so a flaky connection can never double-count stock.
 */
export function useMovement() {
  const { mutate } = useSWRConfig();

  const patchItem = useCallback((id: string, fn: (i: Item) => Item) => {
    mutate(isItemsKey, (data: unknown) => {
      if (!data || typeof data !== "object") return data;
      const d = data as { items?: Item[]; item?: Item };
      if (d.items) return { ...d, items: d.items.map((i) => (i.id === id ? fn(i) : i)) };
      if (d.item && d.item.id === id) return { ...d, item: fn(d.item) };
      return data;
    }, { revalidate: false });
  }, [mutate]);

  return useCallback(async ({ item, type, quantity, note, reason }: MoveArgs): Promise<MovementResult> => {
    const requestId = uuid();
    const optimistic = type === "in" ? item.quantity + quantity : type === "out" ? item.quantity - quantity : quantity;
    patchItem(item.id, (i) => ({ ...i, quantity: Math.max(0, optimistic) }));
    const body = { type, variantId: item.id, requestId, quantity, note: note || undefined, reason: type === "adjust" ? reason : undefined };
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await api<MovementResult>("/api/movements", { body, timeoutMs: 12_000 });
        patchItem(item.id, () => res.item);
        mutate((k) => typeof k === "string" && (k.startsWith("/api/dashboard") || k.startsWith("/api/movements")));
        return res;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof ApiClientError) || (e.status !== 0 && e.status < 500)) break;
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      }
    }
    // Roll back to server truth.
    mutate(isItemsKey);
    throw lastErr;
  }, [mutate, patchItem]);
}
