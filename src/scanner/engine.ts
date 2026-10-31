"use client";
// Camera + decoding pipeline. Loaded lazily (dynamic import) only when the scanner is opened.

export type ScanResult = { text: string; format: string };
type Reply = { id: number; results: ScanResult[]; ms: number; error?: string };

/* ---------------- decoder worker (singleton, reused across sessions) ---------------- */
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: Reply) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./decoder.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<Reply>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  return worker;
}

function post(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<Reply> {
  const id = ++seq;
  return new Promise((res) => {
    pending.set(id, res);
    getWorker().postMessage({ ...msg, id }, transfer);
  });
}

let warmPromise: Promise<Reply> | null = null;
/** Starts the worker and compiles the WASM module ahead of the first frame. Idempotent. */
export function prewarm() {
  return (warmPromise ??= post({ kind: "warm" }));
}

function decodeImageData(kind: "frame" | "image", d: ImageData) {
  return post({ kind, width: d.width, height: d.height, buffer: d.data.buffer }, [d.data.buffer]);
}

/** Decodes a photo/screenshot chosen by the user (any browser-decodable format). */
export async function decodeFile(file: Blob): Promise<ScanResult[]> {
  const bmp = await createImageBitmap(file);
  const max = 2200;
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return (await decodeImageData("image", ctx.getImageData(0, 0, w, h))).results;
}

/* ---------------- camera ---------------- */
export type CamErrorKind = "insecure" | "unsupported" | "denied" | "notfound" | "busy" | "error";
export class CameraError extends Error {
  constructor(public kind: CamErrorKind, msg?: string) { super(msg ?? kind); }
}

function mapError(e: unknown): CameraError {
  const name = (e as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return new CameraError("denied");
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return new CameraError("notfound");
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return new CameraError("busy");
  return new CameraError("error", String((e as Error)?.message ?? e));
}

export function cameraSupport(): CamErrorKind | null {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  return null;
}

export type ScannerStats = { decodeMs: number; fps: number; roi: string; frames: number; firstDetectMs: number | null };

type Opts = {
  video: HTMLVideoElement;
  frame: HTMLElement;              // the green targeting frame: only this region is decoded
  onDetect: (r: ScanResult) => void;
  onDecoderError?: (msg: string) => void;
  cooldownMs?: number;
  deviceId?: string;
};

type TrackCaps = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[]; zoom?: { min: number; max: number } };

export class Scanner {
  private static current: Scanner | null = null;
  private stream: MediaStream | null = null;
  private stopped = false;
  private paused = false;
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d", { willReadFrequently: true, alpha: false })!;
  private lastText = "";
  private lastAt = 0;
  private roi: { x: number; y: number; w: number; h: number; dw: number; dh: number } | null = null;
  private roiDirty = true;
  private startedAt = 0;
  private fpsWindow: number[] = [];
  readonly stats: ScannerStats = { decodeMs: 0, fps: 0, roi: "", frames: 0, firstDetectMs: null };
  torch = false;
  zoom: { min: number; max: number } | null = null;

  constructor(private o: Opts) {
    this.onResize = this.onResize.bind(this);
  }

  private onResize() { this.roiDirty = true; }

  async start(): Promise<void> {
    // Only one live session at a time.
    if (Scanner.current && Scanner.current !== this) Scanner.current.stop();
    Scanner.current = this;
    const unsupported = cameraSupport();
    if (unsupported) throw new CameraError(unsupported);
    prewarm();

    const base: MediaTrackConstraints = {
      width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 },
    };
    const video: MediaTrackConstraints = this.o.deviceId
      ? { ...base, deviceId: { exact: this.o.deviceId } }
      : { ...base, facingMode: { ideal: "environment" } };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" || (this.o.deviceId && name === "NotFoundError")) {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment" } }); }
        catch (e2) { throw mapError(e2); }
      } else throw mapError(e);
    }
    if (this.stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
    this.stream = stream;

    const v = this.o.video;
    v.setAttribute("playsinline", "");
    v.setAttribute("muted", "");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;
    try { await v.play(); } catch (e) {
      if (this.stopped) return;
      throw mapError(e);
    }
    await this.tuneTrack();
    window.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);
    this.startedAt = performance.now();
    this.schedule();
  }

  private async tuneTrack() {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    const caps = (track.getCapabilities?.() ?? {}) as TrackCaps;
    const advanced: Record<string, unknown>[] = [];
    if (caps.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" });
    if (advanced.length) await track.applyConstraints({ advanced } as MediaTrackConstraints).catch(() => {});
    this.torch = !!caps.torch;
    this.zoom = caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: caps.zoom.max } : null;
  }

  async setTorch(on: boolean) {
    const track = this.stream?.getVideoTracks()[0];
    await track?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => {});
  }

  async setZoom(z: number) {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || !this.zoom) return;
    const zoom = Math.min(this.zoom.max, Math.max(this.zoom.min, z));
    await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] }).catch(() => {});
  }

  /** Pause decoding (camera keeps running so resuming is instant). */
  pause() { this.paused = true; }
  resume() {
    this.paused = false;
    // The barcode that was just handled is probably still in view: require it to leave the frame first.
    this.lastAt = performance.now();
  }

  stop() {
    this.stopped = true;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const v = this.o.video;
    try { v.pause(); } catch {}
    v.srcObject = null;
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
    if (Scanner.current === this) Scanner.current = null;
  }

  private schedule() {
    if (this.stopped) return;
    const v = this.o.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    // Only process genuinely new frames when the browser can tell us about them.
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => this.tick());
    else requestAnimationFrame(() => this.tick());
  }

  private computeRoi() {
    const v = this.o.video;
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return null;
    const vr = v.getBoundingClientRect();
    const fr = this.o.frame.getBoundingClientRect();
    // <video> uses object-fit: cover → map the on-screen frame back into video pixels.
    const scale = Math.max(vr.width / vw, vr.height / vh);
    const offX = (vr.width - vw * scale) / 2, offY = (vr.height - vh * scale) / 2;
    let w = fr.width / scale, h = fr.height / scale;
    let x = (fr.left - vr.left - offX) / scale, y = (fr.top - vr.top - offY) / scale;
    // Small tolerance around the frame so codes touching the border still decode.
    x -= w * 0.06; w *= 1.12; y -= h * 0.2; h *= 1.4;
    x = Math.max(0, x); y = Math.max(0, y);
    w = Math.min(vw - x, w); h = Math.min(vh - y, h);
    // Cap decode resolution: plenty for Code 128 while keeping each decode a few ms.
    const MAX_W = 1000;
    const s = Math.min(1, MAX_W / w);
    const roi = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), dw: Math.round(w * s), dh: Math.round(h * s) };
    this.stats.roi = `${vw}x${vh} → ${roi.w}x${roi.h} → ${roi.dw}x${roi.dh}`;
    return roi;
  }

  private async tick() {
    if (this.stopped) return;
    const v = this.o.video;
    if (this.paused || v.readyState < 2) return this.schedule();
    if (this.roiDirty || !this.roi || this.stats.frames % 30 === 0) { this.roi = this.computeRoi(); this.roiDirty = false; }
    const r = this.roi;
    if (!r || r.dw < 8 || r.dh < 8) return this.schedule();
    if (this.canvas.width !== r.dw || this.canvas.height !== r.dh) { this.canvas.width = r.dw; this.canvas.height = r.dh; }
    this.ctx.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, r.dw, r.dh);
    const img = this.ctx.getImageData(0, 0, r.dw, r.dh);
    const reply = await decodeImageData("frame", img);
    if (this.stopped) return;
    if (reply.error) {
      this.o.onDecoderError?.(reply.error);
      setTimeout(() => this.schedule(), 500);
      return;
    }
    const now = performance.now();
    this.stats.frames++;
    this.stats.decodeMs = Math.round(reply.ms * 10) / 10;
    this.fpsWindow.push(now);
    while (this.fpsWindow.length && now - this.fpsWindow[0] > 1000) this.fpsWindow.shift();
    this.stats.fps = this.fpsWindow.length;
    const hit = reply.results[0];
    if (hit && !this.paused) {
      const cooldown = this.o.cooldownMs ?? 1200;
      if (hit.text === this.lastText && now - this.lastAt < cooldown) {
        this.lastAt = now; // still in view → keep suppressing the duplicate
      } else {
        this.lastText = hit.text;
        this.lastAt = now;
        if (this.stats.firstDetectMs === null) this.stats.firstDetectMs = Math.round(now - this.startedAt);
        this.o.onDetect(hit);
      }
    }
    this.schedule();
  }
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  } catch { return []; }
}

/* ---------------- feedback ---------------- */
let audio: AudioContext | null = null;
export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio ??= new AC();
    if (audio.state === "suspended") void audio.resume();
  } catch {}
}
export function feedback(beep: boolean) {
  try { navigator.vibrate?.(60); } catch {}
  if (!beep) return;
  try {
    unlockAudio();
    if (!audio) return;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "square"; o.frequency.value = 1760;
    g.gain.setValueAtTime(0.06, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.09);
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.1);
  } catch {}
}
