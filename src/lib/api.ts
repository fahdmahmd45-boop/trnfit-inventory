"use client";

export class ApiClientError extends Error {
  constructor(public status: number, public code: string, public data: Record<string, unknown> = {}) {
    super(code);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
  opts.signal?.addEventListener("abort", () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError(0, "NETWORK");
  } finally {
    clearTimeout(timer);
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    if (res.status === 401 && data.error === "UNAUTHENTICATED" && typeof window !== "undefined") {
      window.location.href = "/login?expired=1";
    }
    throw new ApiClientError(res.status, data.error ?? "SERVER_ERROR", data);
  }
  return data as T;
}

export const fetcher = <T,>(url: string) => api<T>(url);

export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback for older Safari on insecure origins.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
