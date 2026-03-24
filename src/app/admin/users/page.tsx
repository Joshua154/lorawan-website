import { redirect } from "next/navigation";

import { AdminPanel } from "@/components/admin/admin-panel";
import { getCurrentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/");
  }

  return <AdminPanel viewer={user} />;
}
