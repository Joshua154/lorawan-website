import { redirect } from "next/navigation";

import { LoginCard } from "@/components/auth/login-card";
import { getCurrentUser } from "@/server/auth";
import { signIn } from "@/server/next-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  return (
    <LoginCard
      keycloakAction={async () => {
        "use server";
        await signIn("keycloak", { redirectTo: "/" });
      }}
    />
  );
}
