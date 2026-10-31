import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { PrintLabels } from "@/components/PrintLabels";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await getSessionUser())) redirect("/login");
  return <PrintLabels />;
}
