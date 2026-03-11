import { redirect } from "next/navigation";

import { DashboardShell } from "../components/dashboard/dashboard-shell";
import { getCurrentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return <DashboardShell viewer={user} />;
}
