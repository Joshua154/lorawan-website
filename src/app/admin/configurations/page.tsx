import { redirect } from "next/navigation";

import { AdminConfigurationsPanel } from "@/components/admin/admin-configurations-panel";
import { getCurrentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function AdminConfigurationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/");
  }

  return <AdminConfigurationsPanel viewer={user} />;
}
