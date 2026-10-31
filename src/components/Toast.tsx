"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";

type Kind = "success" | "error" | "info";
type T = { id: number; kind: Kind; text: string };
const Ctx = createContext<(kind: Kind, text: string, ms?: number) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<T[]>([]);
  const n = useRef(0);
  const push = useCallback((kind: Kind, text: string, ms = 2600) => {
    const id = ++n.current;
    setList((l) => [...l.slice(-2), { id, kind, text }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), ms);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-[100] flex flex-col items-center gap-2 p-3 safe-t" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} role="status"
            className={`anim-pop pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-2xl
              ${t.kind === "success" ? "bg-olive text-offwhite" : t.kind === "error" ? "bg-danger text-white" : "bg-surface-2 text-fg border border-line"}`}>
            {t.kind === "success" ? <CheckCircle2 className="size-5 shrink-0" /> : t.kind === "error" ? <AlertTriangle className="size-5 shrink-0" /> : <Info className="size-5 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
