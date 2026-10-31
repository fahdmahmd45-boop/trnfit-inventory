"use client";
import { createContext, useCallback, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { dictionaries, type Dict, type Lang } from "@/lib/i18n";

type Ctx = { lang: Lang; t: Dict; setLang: (l: Lang) => void; fmt: (n: number) => string; fmtDate: (iso: string) => string };
const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const router = useRouter();
  const setLang = useCallback((l: Lang) => {
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
    router.refresh();
  }, [router]);
  const value = useMemo<Ctx>(() => {
    // Western digits in both languages: easier to match against printed SKUs and quantities.
    const nf = new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US");
    const df = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh",
    });
    return { lang, t: dictionaries[lang], setLang, fmt: (n) => nf.format(n), fmtDate: (iso) => df.format(new Date(iso)) };
  }, [lang, setLang]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}
