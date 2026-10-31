// Copies the ZXing reader WASM binary into /public so the scanner worker can load it
// from our own origin (no CDN dependency, cacheable by the service worker).
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
try {
  const src = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
  if (!existsSync(src)) throw new Error("zxing_reader.wasm not found at " + src);
  mkdirSync("public/zxing", { recursive: true });
  copyFileSync(src, "public/zxing/zxing_reader.wasm");
  console.log("[copy-wasm] zxing_reader.wasm -> public/zxing/");
} catch (e) {
  console.warn("[copy-wasm] skipped:", e.message);
}
