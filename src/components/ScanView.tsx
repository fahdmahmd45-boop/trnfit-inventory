"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { X, Flashlight, Keyboard, ImageUp, SwitchCamera, ZoomIn, PackagePlus, RotateCcw } from "lucide-react";
import { useI18n } from "./I18n";
import { useToast } from "./Toast";
import { StockSheet, type SheetSubmit } from "./StockSheet";
import { useMovement } from "./useMovement";
import { errorText, itemTitle, Spinner } from "./ui";
import { api, ApiClientError } from "@/lib/api";
import type { Item } from "@/lib/types";
import type { Scanner, CamErrorKind, ScanResult } from "@/scanner/engine";

type Mode = "in" | "out";
type Status = "starting" | "scanning" | "error";

const LS = { mode: "trn.scan.mode", beep: "trn.scan.beep", cam: "trn.scan.cam" };
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

export function ScanView({ initialMode }: { initialMode?: Mode }) {
  const { t, lang, fmt } = useI18n();
  const toast = useToast();
  const move = useMovement();
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Scanner | null>(null);
  const engineRef = useRef<typeof import("@/scanner/engine") | null>(null);

  const [status, setStatus] = useState<Status>("starting");
  const [camErr, setCamErr] = useState<CamErrorKind | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode ?? "in");
  const [beep, setBeep] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [caps, setCaps] = useState({ torch: false, zoom: false, multiCam: false });
  const [zoomed, setZoomed] = useState(false);
  const [flash, setFlash] = useState(0);
  const [item, setItem] = useState<Item | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ title: string; qty: number; sign: string } | null>(null);
  const [restartKey, setRestartKey] = useState(0);

  // Cached list for instant local barcode → item matching (server lookup is the fallback).
  const { data: list, mutate: refreshList } = useSWR<{ items: Item[] }>("/api/items", { revalidateOnMount: true });
  const listRef = useRef(list);
  listRef.current = list;
  const state = useRef({ beep });
  state.current = { beep };

  useEffect(() => {
    if (!initialMode) { const m = ls.get(LS.mode); if (m === "in" || m === "out") setMode(m); }
    setBeep(ls.get(LS.beep) !== "0");
  }, [initialMode]);

  const pause = () => scannerRef.current?.pause();
  const resume = useCallback(() => {
    setItem(null); setUnknown(null); setManual(false);
    scannerRef.current?.resume();
  }, []);

  const findItem = useCallback(async (code: string): Promise<Item | null> => {
    const c = code.trim();
    const local = listRef.current?.items.find((i) => i.barcode === c || i.sku === c.toUpperCase());
    if (local) return local;
    try {
      const r = await api<{ item: Item }>(`/api/lookup?code=${encodeURIComponent(c)}`);
      refreshList();
      return r.item;
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 404) return null;
      throw e;
    }
  }, [refreshList]);

  const record = useCallback(async (it: Item, s: SheetSubmit) => {
    const res = await move({ item: it, ...s });
    const sign = s.type === "in" ? "+" : s.type === "out" ? "−" : "=";
    setLast({ title: itemTitle(res.item, lang), qty: res.item.quantity, sign: `${sign}${s.type === "adjust" ? res.item.quantity : s.quantity}` });
    toast("success", `${t.movementSaved} · ${t.available}: ${fmt(res.item.quantity)}`, 1800);
    return res;
  }, [move, lang, toast, t, fmt]);

  const handleCode = useCallback(async (code: string) => {
    pause();
    let it: Item | null;
    try { it = await findItem(code); } catch (e) { toast("error", errorText(t, e)); resume(); return; }
    if (!it) { setUnknown(code); return; }
    setItem(it);
  }, [findItem, resume, toast, t]);

  const onDetect = useCallback((r: ScanResult) => {
    engineRef.current?.feedback(state.current.beep);
    setFlash((f) => f + 1);
    void handleCode(r.text);
  }, [handleCode]);

  // Camera lifecycle: start on mount, stop tracks immediately on unmount / tab hide.
  useEffect(() => {
    let cancelled = false;
    let sc: Scanner | null = null;
    setStatus("starting"); setCamErr(null);
    (async () => {
      const eng = (engineRef.current ??= await import("@/scanner/engine"));
      if (cancelled) return;
      const support = eng.cameraSupport();
      if (support) { setCamErr(support); setStatus("error"); return; }
      sc = new eng.Scanner({
        video: videoRef.current!, frame: frameRef.current!, onDetect, deviceId: ls.get(LS.cam) ?? undefined,
        onDecoderError: () => toast("error", t.serverError),
      });
      scannerRef.current = sc;
      try {
        await sc.start();
        if (cancelled) return;
        const cams = await eng.listCameras();
        setCaps({ torch: sc.torch, zoom: !!sc.zoom, multiCam: cams.length > 1 });
        setStatus("scanning");
        (window as unknown as { __scanStats: unknown }).__scanStats = sc.stats;
      } catch (e) {
        if (cancelled) return;
        setCamErr((e as { kind?: CamErrorKind }).kind ?? "error");
        setStatus("error");
      }
    })();
    const onVis = () => { if (document.hidden) { sc?.stop(); } else if (sc && !cancelled) setRestartKey((k) => k + 1); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      sc?.stop();
      scannerRef.current = null;
    };
  }, [restartKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unlock = () => engineRef.current?.unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const setModeP = (m: Mode) => { setMode(m); ls.set(LS.mode, m); };
  const toggleTorch = async () => { const on = !torchOn; setTorchOn(on); await scannerRef.current?.setTorch(on); };
  const toggleZoom = async () => {
    const z = !zoomed; setZoomed(z);
    const s = scannerRef.current; if (!s?.zoom) return;
    await s.setZoom(z ? Math.min(2, s.zoom.max) : s.zoom.min);
  };
  const switchCam = async () => {
    const cams = await engineRef.current!.listCameras();
    if (cams.length < 2) return;
    const cur = ls.get(LS.cam);
    const idx = cams.findIndex((c) => c.deviceId === cur);
    ls.set(LS.cam, cams[(idx + 1) % cams.length].deviceId);
    setTorchOn(false); setZoomed(false);
    setRestartKey((k) => k + 1);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    pause();
    try {
      const eng = (engineRef.current ??= await import("@/scanner/engine"));
      const res = await eng.decodeFile(f);
      if (!res.length) { toast("error", t.noBarcodeInImage); resume(); return; }
      eng.feedback(beep);
      await handleCode(res[0].text);
    } catch { toast("error", t.noBarcodeInImage); resume(); }
  };

  const submitSheet = async (s: SheetSubmit) => {
    if (!item) return;
    setBusy(true);
    try {
      await record(item, s);
      resume(); // straight back to scanning the next item
    } catch (e) {
      toast("error", errorText(t, e), 3500);
    } finally { setBusy(false); }
  };

  const camMsg = camErr === "insecure" ? t.camInsecure : camErr === "unsupported" ? t.camUnsupported : camErr === "denied" ? t.camDenied
    : camErr === "notfound" ? t.camNotFound : camErr === "busy" ? t.camBusy : t.camError;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-offwhite">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay aria-hidden />

      {/* Targeting overlay: wide frame for Code 128; the dark mask is the frame's own giant shadow. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div ref={frameRef} data-testid="scan-frame"
          className="relative rounded-2xl"
          style={{ width: "min(86vw, 560px)", height: "min(36vw, 230px)", boxShadow: "0 0 0 200vmax rgba(0,0,0,.55)" }}>
          <div className="absolute inset-0 rounded-2xl border-[3px] border-scan"
            style={{ boxShadow: "0 0 18px rgba(46,232,106,.55), inset 0 0 12px rgba(46,232,106,.25)" }} />
          {flash > 0 && <div key={flash} className="anim-flash absolute inset-0 rounded-2xl bg-scan/35" data-testid="scan-flash" />}
          {(["top-0 start-0 border-t-[6px] border-s-[6px] rounded-ss-2xl", "top-0 end-0 border-t-[6px] border-e-[6px] rounded-se-2xl",
            "bottom-0 start-0 border-b-[6px] border-s-[6px] rounded-es-2xl", "bottom-0 end-0 border-b-[6px] border-e-[6px] rounded-ee-2xl"]).map((c) => (
            <span key={c} className={`absolute size-8 border-scan -m-[3px] ${c}`} />
          ))}
          {status === "scanning" && !item && (
            <span className="absolute inset-x-3 top-2 h-0.5 rounded bg-scan/80 shadow-[0_0_10px_2px_rgba(46,232,106,.6)]"
              style={{ animation: "scanline 2.2s ease-in-out infinite", ["--travel" as string]: "min(32vw, 210px)" }} />
          )}
        </div>
        <p className="mt-6 rounded-full bg-black/55 px-4 py-2 text-center text-[15px] font-semibold" data-testid="scan-hint">{t.scanHint}</p>
        {status === "starting" && <p className="mt-3 flex items-center gap-2 text-sm text-offwhite/80"><Spinner className="size-4" /> {t.startingCamera}</p>}
      </div>

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-3 safe-t">
        <Link href="/" className="flex size-12 items-center justify-center rounded-full bg-black/55 backdrop-blur" aria-label={t.close}><X className="size-6" /></Link>
        <div className="mx-auto grid grid-cols-2 gap-1 rounded-2xl bg-black/55 p-1 backdrop-blur" role="tablist">
          {(["in", "out"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setModeP(m)} data-testid={`mode-${m}`}
              className={`h-11 rounded-xl px-4 text-[15px] font-bold transition-colors ${mode === m ? (m === "in" ? "bg-olive" : "bg-beige text-brand-black") : "text-offwhite/75"}`}>
              {m === "in" ? t.stockIn : t.stockOut}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {caps.torch && <button onClick={toggleTorch} aria-pressed={torchOn} aria-label={t.torch} className={`flex size-12 items-center justify-center rounded-full backdrop-blur ${torchOn ? "bg-scan text-black" : "bg-black/55"}`}><Flashlight className="size-5" /></button>}
          {caps.zoom && <button onClick={toggleZoom} aria-pressed={zoomed} aria-label="zoom" className={`flex size-12 items-center justify-center rounded-full backdrop-blur ${zoomed ? "bg-scan text-black" : "bg-black/55"}`}><ZoomIn className="size-5" /></button>}
          {caps.multiCam && <button onClick={switchCam} aria-label="camera" className="flex size-12 items-center justify-center rounded-full bg-black/55 backdrop-blur"><SwitchCamera className="size-5" /></button>}
        </div>
      </div>

      {/* Camera error panel */}
      {status === "error" && (
        <div className="absolute inset-x-4 top-24 mx-auto max-w-md rounded-2xl bg-surface p-5 text-fg anim-pop" role="alert" data-testid="cam-error">
          <p className="font-semibold">{camMsg}</p>
          {camErr === "denied" && <p className="mt-2 text-sm text-muted">{/iPhone|iPad/.test(navigator.userAgent) ? t.camDeniedIos : t.camDeniedAndroid}</p>}
          <div className="mt-4 flex gap-2">
            {camErr !== "insecure" && camErr !== "unsupported" && <button className="btn-primary flex-1" onClick={() => setRestartKey((k) => k + 1)}><RotateCcw className="size-4" />{t.retry}</button>}
            <button className="btn-ghost flex-1" onClick={() => setManual(true)}><Keyboard className="size-4" />{t.manualEntry}</button>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 p-4 safe-b">
        {last && (
          <div className="mx-auto mb-3 flex max-w-md items-center justify-between gap-3 rounded-2xl bg-black/60 px-4 py-2.5 text-sm backdrop-blur anim-pop" data-testid="last-scan">
            <span className="truncate">{last.title}</span>
            <span className="num shrink-0 font-bold" dir="ltr">{last.sign} → {fmt(last.qty)}</span>
          </div>
        )}
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          <button onClick={() => { pause(); setManual(true); }} className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl bg-black/55 text-xs font-semibold backdrop-blur" data-testid="manual-btn">
            <Keyboard className="size-5" />{t.manualEntry}
          </button>
          <label className="flex h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl bg-black/55 text-xs font-semibold backdrop-blur">
            <ImageUp className="size-5" />{t.scanImage}
            <input type="file" accept="image/*" className="sr-only" data-testid="image-input" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      </div>

      {/* Manual entry */}
      {manual && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={resume}>
          <form className="anim-sheet w-full max-w-lg rounded-t-3xl bg-surface p-5 text-fg safe-b md:rounded-3xl" onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); if (manualCode.trim()) { setManual(false); void handleCode(manualCode); setManualCode(""); } }}>
            <label className="label">{t.manualEntry}</label>
            <div className="flex gap-2">
              <input autoFocus dir="ltr" className="input font-mono uppercase" value={manualCode} onChange={(e) => setManualCode(e.target.value)}
                placeholder={t.manualPh} autoCapitalize="characters" autoCorrect="off" spellCheck={false} data-testid="manual-input" />
              <button className="btn-primary shrink-0" type="submit">{t.find}</button>
            </div>
          </form>
        </div>
      )}

      {/* Unknown barcode */}
      {unknown && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={resume}>
          <div className="anim-sheet w-full max-w-lg rounded-t-3xl bg-surface p-5 text-fg safe-b md:rounded-3xl" onClick={(e) => e.stopPropagation()} data-testid="unknown-sheet">
            <h2 className="text-lg font-bold">{t.unknownBarcode}</h2>
            <p dir="ltr" className="mt-1 break-all font-mono text-muted">{unknown}</p>
            <div className="mt-4 grid gap-2">
              <Link href={`/items/new?barcode=${encodeURIComponent(unknown)}`} className="btn-olive"><PackagePlus className="size-5" />{t.addWithBarcode}</Link>
              <button className="btn-ghost" onClick={resume}>{t.scanNext}</button>
            </div>
          </div>
        </div>
      )}

      {item && (
        <StockSheet item={listRef.current?.items.find((i) => i.id === item.id) ?? item} initialType={mode} busy={busy}
          onClose={resume} onSubmit={submitSheet} />
      )}
    </div>
  );
}
