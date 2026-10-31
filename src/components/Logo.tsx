import Image from "next/image";

export function Logo({ className = "", slogan = false }: { className?: string; slogan?: boolean }) {
  return (
    <div className={`flex flex-col leading-none ${className}`} dir="ltr">
      <Image
        src="/icons/trn-brand.svg"
        alt="TRN FIT"
        width={165}
        height={71}
        priority
        unoptimized
        className={`block h-auto object-contain ${slogan ? "w-[166px]" : "w-[106px]"}`}
      />
      {slogan && (
        <span className="mt-2 text-[10px] font-semibold tracking-[0.22em] text-olive-light">
          TRAIN. RISE. NEVER QUIT.
        </span>
      )}
    </div>
  );
}
