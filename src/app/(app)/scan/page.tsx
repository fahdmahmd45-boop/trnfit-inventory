import { ScanView } from "@/components/ScanView";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <ScanView initialMode={mode === "out" ? "out" : mode === "in" ? "in" : undefined} />;
}
