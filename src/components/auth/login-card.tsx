"use client";

import type { ReactNode } from "react";

import { useTranslation } from "@/i18n/useTranslation";

import { LoginForm } from "./login-form";

type LoginCardProps = {
  keycloakAction: () => Promise<void>;
};

export function LoginCard({ keycloakAction }: LoginCardProps) {
  const { t } = useTranslation();

  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">{t("login.title")}</p>
        <h1>{t("login.heading")}</h1>
        <p className="login-copy">{t("login.copy")}</p>
        <LoginForm />

        <Divider>{t("login.divider")}</Divider>

        <form action={keycloakAction}>
          <button style={{ width: "100%", marginTop: "1rem" }} className="secondary-button login-submit" type="submit">
            {t("login.sign.keycloak")}
          </button>
        </form>
      </section>
    </main>
  );
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="login-divider" style={{ margin: "2rem 0", textAlign: "center", position: "relative" }}>
      <span
        style={{
          backgroundColor: "var(--surface-strong)",
          padding: "0 10px",
          color: "var(--muted)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {children}
      </span>
      <hr
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          margin: 0,
          border: "none",
          borderTop: "1px solid var(--border, #eee)",
        }}
      />
    </div>
  );
}