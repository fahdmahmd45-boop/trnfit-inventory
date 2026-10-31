"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { LogOut, Languages, Moon, Sun, KeyRound, Users, Download, Barcode, Volume2 } from "lucide-react";
import Link from "next/link";
import { useI18n } from "./I18n";
import { useToast } from "./Toast";
import { useUser } from "./Shell";
import { PageHeader, Spinner, errorText } from "./ui";
import { api } from "@/lib/api";

type Emp = { id: string; name: string; username: string; role: "admin" | "staff"; active: boolean; lastLoginAt: string | null };
type BIPEvent = Event & { prompt: () => Promise<void> };

export function SettingsView() {
  const { t, lang, setLang, fmtDate } = useI18n();
  const user = useUser();
  const router = useRouter();
  const toast = useToast();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [beep, setBeep] = useState(true);
  const [codes, setCodes] = useState({ currentCode: "", newCode: "" });
  const [busy, setBusy] = useState(false);
  const [install, setInstall] = useState<BIPEvent | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    try { setBeep(localStorage.getItem("trn.scan.beep") !== "0"); } catch {}
    const h = (e: Event) => { e.preventDefault(); setInstall(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  const applyTheme = (th: "dark" | "light") => {
    setTheme(th);
    document.documentElement.dataset.theme = th;
    document.cookie = `theme=${th}; path=/; max-age=31536000; samesite=lax`;
  };
  const logout = async () => { await api("/api/auth/logout", { body: {} }).catch(() => {}); router.replace("/login"); };
  const changeCode = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await api("/api/auth/change-code", { body: codes });
      toast("success", t.codeChanged);
      setTimeout(() => router.replace("/login"), 1200);
    } catch (err) { toast("error", errorText(t, err)); } finally { setBusy(false); }
  };

  const row = "flex items-center justify-between gap-3 p-4";
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title={t.navSettings} />
      <section className="card divide-y divide-line">
        <div className={row}>
          <span className="flex items-center gap-3"><Languages className="size-5 text-muted" />{t.language}</span>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(["ar", "en"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={`h-9 rounded-lg px-4 text-sm font-semibold ${lang === l ? "bg-accent text-accent-fg" : "text-muted"}`} data-testid={`lang-${l}`}>
                {l === "ar" ? "العربية" : "English"}
              </button>
            ))}
          </div>
        </div>
        <div className={row}>
          <span className="flex items-center gap-3">{theme === "dark" ? <Moon className="size-5 text-muted" /> : <Sun className="size-5 text-muted" />}{t.theme}</span>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(["dark", "light"] as const).map((th) => (
              <button key={th} onClick={() => applyTheme(th)} className={`h-9 rounded-lg px-4 text-sm font-semibold ${theme === th ? "bg-accent text-accent-fg" : "text-muted"}`}>{th === "dark" ? t.dark : t.light}</button>
            ))}
          </div>
        </div>
        <label className={row}>
          <span className="flex items-center gap-3"><Volume2 className="size-5 text-muted" />{t.beep}</span>
          <input type="checkbox" className="size-6 accent-[var(--accent)]" checked={beep}
            onChange={(e) => { setBeep(e.target.checked); try { localStorage.setItem("trn.scan.beep", e.target.checked ? "1" : "0"); } catch {} }} />
        </label>
        <Link href="/barcodes" className={`${row} md:hidden`}><span className="flex items-center gap-3"><Barcode className="size-5 text-muted" />{t.navBarcodes}</span></Link>
        {install && (
          <button className={`${row} w-full`} onClick={() => install.prompt().then(() => setInstall(null))}>
            <span className="flex items-center gap-3"><Download className="size-5 text-muted" />{t.installApp}</span>
          </button>
        )}
      </section>
      {!install && <p className="px-1 text-xs text-muted">{t.installHint}</p>}

      <form onSubmit={changeCode} className="card space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-bold"><KeyRound className="size-5" />{t.changeCode}</h2>
        <input className="input" type="password" autoComplete="current-password" placeholder={t.currentCode} value={codes.currentCode} onChange={(e) => setCodes({ ...codes, currentCode: e.target.value })} required />
        <input className="input" type="password" autoComplete="new-password" placeholder={t.newCode} minLength={6} value={codes.newCode} onChange={(e) => setCodes({ ...codes, newCode: e.target.value })} required />
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : t.save}</button>
      </form>

      {user.role === "admin" && <Employees fmtDate={fmtDate} />}

      <button onClick={logout} className="btn-ghost w-full text-danger" data-testid="logout"><LogOut className="size-5" />{t.logout}</button>
    </div>
  );
}

function Employees({ fmtDate }: { fmtDate: (s: string) => string }) {
  const { t } = useI18n();
  const toast = useToast();
  const user = useUser();
  const { data, mutate } = useSWR<{ employees: Emp[] }>("/api/employees");
  const [f, setF] = useState({ name: "", username: "", code: "", role: "staff" as "staff" | "admin" });
  const [busy, setBusy] = useState(false);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api("/api/employees", { body: f }); setF({ name: "", username: "", code: "", role: "staff" }); mutate(); toast("success", t.saved); }
    catch (err) { toast("error", errorText(t, err)); } finally { setBusy(false); }
  };
  const toggle = async (emp: Emp) => {
    try { await api(`/api/employees/${emp.id}`, { method: "PATCH", body: { active: !emp.active } }); mutate(); }
    catch (err) { toast("error", errorText(t, err)); }
  };
  return (
    <section className="card p-4">
      <h2 className="mb-3 flex items-center gap-2 font-bold"><Users className="size-5" />{t.employees}</h2>
      <ul className="mb-4 divide-y divide-line">
        {data?.employees.map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{e.name} <span className="text-xs text-muted">@{e.username} · {e.role === "admin" ? t.admin : t.staff}</span></div>
              <div className="text-xs text-muted">{e.lastLoginAt ? fmtDate(e.lastLoginAt) : "—"}</div>
            </div>
            <button disabled={e.id === user.id} onClick={() => toggle(e)} className={`chip py-1.5 ${e.active ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger"}`}>{e.active ? t.active : t.inactive}</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-2">
        <input className="input" placeholder={t.name} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} />
        <input className="input" dir="ltr" placeholder={t.username} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required pattern="[a-zA-Z0-9._\-]{2,40}" />
        <input className="input" type="password" autoComplete="new-password" placeholder={t.newCode} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required minLength={6} />
        <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as "staff" | "admin" })}>
          <option value="staff">{t.staff}</option><option value="admin">{t.admin}</option>
        </select>
        <button className="btn-olive sm:col-span-2" disabled={busy}>{busy ? <Spinner /> : t.addEmployee}</button>
      </form>
    </section>
  );
}
