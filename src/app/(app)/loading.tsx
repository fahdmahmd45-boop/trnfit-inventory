/** Immediately visible while a protected page's server payload is loading.
 * The layout/sidebar stays mounted, so navigation feels responsive even on a slow connection.
 */
export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label="جارٍ تحميل القسم">
      <div className="flex items-center gap-3">
        <div className="size-5 animate-spin rounded-full border-2 border-olive-light border-t-transparent" />
        <span className="text-sm font-semibold text-muted">جارٍ تحميل القسم...</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />)}
      </div>
      <div className="h-48 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}
