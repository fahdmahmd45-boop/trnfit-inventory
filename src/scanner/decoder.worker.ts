/// <reference lib="webworker" />
// Barcode decoding runs here, off the UI thread. The WASM module is instantiated once per worker
// and the worker is reused for every scan session.
import { prepareZXingModule, readBarcodes, ZXING_WASM_VERSION, type ReaderOptions } from "zxing-wasm/reader";

declare const self: DedicatedWorkerGlobalScope;

const wasmUrl = `${self.location.origin}/zxing/zxing_reader.wasm?v=${ZXING_WASM_VERSION}`;
const ready = prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
  fireImmediately: true,
});

// Live camera frames: the region inside the green frame only, Code 128 first.
// tryHarder scans more rows of the (small) crop, which matters for slightly tilted/partial codes.
const FAST: ReaderOptions = {
  formats: ["Code128", "EAN13", "EAN8", "UPCA", "UPCE", "Code39"],
  tryHarder: true, tryRotate: false, tryInvert: false, tryDownscale: true,
  maxNumberOfSymbols: 1,
};
// Uploaded photos: slower, exhaustive search (any rotation, inverted, all linear + common 2D).
const THOROUGH: ReaderOptions = {
  formats: ["AllLinear", "QRCode", "DataMatrix"],
  tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 4,
};

type In =
  | { id: number; kind: "warm" }
  | { id: number; kind: "frame" | "image"; width: number; height: number; buffer: ArrayBuffer };

self.onmessage = async (ev: MessageEvent<In>) => {
  const msg = ev.data;
  try {
    await ready;
    if (msg.kind === "warm") return self.postMessage({ id: msg.id, results: [], ms: 0 });
    const t0 = performance.now();
    const img = new ImageData(new Uint8ClampedArray(msg.buffer), msg.width, msg.height);
    const out = await readBarcodes(img, msg.kind === "frame" ? FAST : THOROUGH);
    const results = out.filter((r) => r.isValid && r.text).map((r) => ({ text: r.text, format: r.format }));
    self.postMessage({ id: msg.id, results, ms: performance.now() - t0 });
  } catch (e) {
    self.postMessage({ id: msg.id, results: [], ms: 0, error: String(e) });
  }
};
