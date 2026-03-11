import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/server/auth";
import { signIn } from "@/server/next-auth";

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
        <p className="login-copy">
          Admins can manage all boards and create users. Regular users only see their assigned boards.
        </p>
        <LoginForm />

        <div className="login-divider" style={{ margin: "2rem 0", textAlign: "center", position: "relative" }}>
          <span style={{ backgroundColor: "var(--background, #fff)", padding: "0 10px", color: "var(--text-muted, #666)", position: "relative", zIndex: 1 }}>or</span>
          <hr style={{ position: "absolute", top: "50%", left: 0, right: 0, margin: 0, border: "none", borderTop: "1px solid var(--border, #eee)" }} />
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("keycloak", { redirectTo: "/" });
          }}
        >
          <button style={{ width: "100%", marginTop: "1rem" }} className="secondary-button login-submit" type="submit">
            Sign in with Keycloak
          </button>
        </form>
      </section>
    </main>
  );
}
