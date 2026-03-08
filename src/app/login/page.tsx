import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">LoRaWAN Dashboard</p>
        <h1>Sign in</h1>
        <p className="login-copy">Admins can manage all boards and create users. Regular users only see their assigned boards.</p>
        <LoginForm />
      </section>
    </main>
  );
}