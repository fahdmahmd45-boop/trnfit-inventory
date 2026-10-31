"use client";
import { useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useI18n } from "./I18n";
import { Logo } from "./Logo";
import { Spinner, errorText } from "./ui";
import { api } from "@/lib/api";

export function LoginForm() {
  const { t, lang, setLang } = useI18n();
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api("/api/auth/login", { body: { code } });
      window.location.replace("/"); // full load so the server layout sees the new cookie
    } catch (e) {
      setErr(errorText(t, e)); setBusy(false); setCode("");
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,87,40,.35),transparent_60%)]" />
      <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="absolute end-4 top-4 rounded-full bg-surface-2 px-3 py-1.5 text-sm text-muted safe-t">
        {lang === "ar" ? "English" : "العربية"}
      </button>
      <form onSubmit={submit} className="card relative w-full max-w-sm p-6 anim-pop">
        <Logo slogan className="mb-8 items-center" />
        <h1 className="mb-5 text-center text-xl font-bold">{t.loginTitle}</h1>
        <label className="label" htmlFor="code">{t.accessCode}</label>
        <div className="relative">
          <input id="code" name="code" className="input pe-12 text-center tracking-widest" type={show ? "text" : "password"} autoComplete="current-password"
            autoFocus required value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.accessCodePh} dir="ltr" data-testid="login-code" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-2 top-1/2 -translate-y-1/2 p-2 text-muted" aria-label="toggle">
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
        {err && <p className="mt-3 rounded-lg bg-danger/15 p-2 text-center text-sm text-danger" role="alert" data-testid="login-error">{err}</p>}
        <button className="btn-primary mt-5 w-full" disabled={busy || !code} data-testid="login-submit">
          {busy ? <Spinner /> : <><LogIn className="size-5" />{t.login}</>}
        </button>
      </form>
    </main>
  );
}
