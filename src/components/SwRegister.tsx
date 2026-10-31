"use client";
import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const id = setTimeout(() => navigator.serviceWorker.register("/sw.js").catch(() => {}), 2000);
    return () => clearTimeout(id);
  }, []);
  return null;
}
