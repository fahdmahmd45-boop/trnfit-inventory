export function Logo({ className = "", slogan = false }: { className?: string; slogan?: boolean }) {
  return (
    <div className={`flex flex-col leading-none ${className}`} dir="ltr">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
          <rect width="32" height="32" rx="8" fill="#4A5728" />
          <path d="M8 10h16v3.2h-6.2V24h-3.6V13.2H8z" fill="#F5F3F0" />
          <rect x="8" y="21" width="4" height="3" fill="#C8B89A" />
          <rect x="20" y="21" width="4" height="3" fill="#C8B89A" />
        </svg>
        <span className="text-lg font-bold tracking-[0.18em]">TRN&nbsp;FIT</span>
      </div>
      {slogan && <span className="mt-2 text-[10px] font-semibold tracking-[0.3em] text-olive-light">TRAIN. RISE. NEVER QUIT.</span>}
    </div>
  );
}
