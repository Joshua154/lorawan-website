"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { useSessionActions } from "@/hooks/use-session-actions";
import { useTranslation } from "@/i18n/useTranslation";
import { apiUrl } from "@/lib/api-url";
import type { SessionUser } from "@/lib/types";

type AdminConfigurationsPanelProps = {
  viewer: SessionUser;
};

type RuntimeConfigEntry = {
  key: string;
  label: string;
  description: string;
  value: string;
  sensitive?: boolean;
  requiresRestart?: boolean;
  source: "database" | "environment" | "default";
};

type ConfigResponse = {
  entries: RuntimeConfigEntry[];
  message?: string;
};

type FormFeedback = {
  kind: "success" | "error";
  message: string;
};

export function AdminConfigurationsPanel({ viewer }: AdminConfigurationsPanelProps) {
  const [entries, setEntries] = useState<RuntimeConfigEntry[]>([]);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);

  const { t } = useTranslation();
  const { logout, redirectHome, redirectToLogin } = useSessionActions();

  const hasChanges = useMemo(
    () => entries.some((entry) => (draftValues[entry.key] ?? "") !== entry.value),
    [draftValues, entries],
  );

  const loadConfigurations = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    try {
      const response = await fetch(apiUrl("/api/admin/configurations"), { cache: "no-store" });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (response.status === 403) {
        redirectHome();
        return;
      }

      if (!response.ok) {
        setFeedback({ kind: "error", message: t("admin.config.feedback.loadFailed") });
        return;
      }

      const payload = (await response.json()) as ConfigResponse;
      const nextEntries = payload.entries ?? [];
      setEntries(nextEntries);
      setDraftValues(Object.fromEntries(nextEntries.map((entry) => [entry.key, entry.value])));
    } catch {
      setFeedback({ kind: "error", message: t("admin.config.feedback.loadFailed") });
    } finally {
      setIsLoading(false);
    }
  }, [redirectHome, redirectToLogin, t]);

  useEffect(() => {
    void loadConfigurations();
  }, [loadConfigurations]);

  const saveConfigurations = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch(apiUrl("/api/admin/configurations"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: entries.map((entry) => ({
            key: entry.key,
            value: draftValues[entry.key] ?? "",
          })),
        }),
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (response.status === 403) {
        redirectHome();
        return;
      }

      const payload = (await response.json()) as ConfigResponse;

      if (!response.ok) {
        setFeedback({ kind: "error", message: payload.message ?? t("admin.config.feedback.saveFailed") });
        return;
      }

      const nextEntries = payload.entries ?? [];
      setEntries(nextEntries);
      setDraftValues(Object.fromEntries(nextEntries.map((entry) => [entry.key, entry.value])));
      setFeedback({ kind: "success", message: t("admin.config.feedback.saved") });
    } catch {
      setFeedback({ kind: "error", message: t("admin.config.feedback.saveFailed") });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="admin-page">
      <section className="admin-page-shell">
        <header className="admin-toolbar">
          <div>
            <p className="eyebrow">{t("admin.config.header.eyebrow")}</p>
            <h1>{t("admin.config.header.title")}</h1>
            <p className="login-copy">{t("admin.config.header.subtitle", { username: viewer.username })}</p>
          </div>
          <div className="viewer-actions admin-toolbar-actions">
            <span className="role-badge admin">{t("common.roles.admin")}</span>
            <div className="admin-toolbar-links">
              <Link className="secondary-button nav-link-button" href="/admin">
                {t("admin.users.navigation.backToStatistics")}
              </Link>
              <Link className="secondary-button nav-link-button" href="/admin/users">
                {t("admin.stats.navigation.manageUsers")}
              </Link>
              <Link className="secondary-button nav-link-button" href="/">
                {t("admin.navigation.backToDashboard")}
              </Link>
              <button className="secondary-button" onClick={() => void logout()} type="button">
                {t("common.actions.logout")}
              </button>
            </div>
          </div>
        </header>

        <article className="admin-card admin-form-card">
          <div className="admin-card-header">
            <div>
              <p className="eyebrow">{t("admin.config.form.eyebrow")}</p>
              <h3>{t("admin.config.form.title")}</h3>
            </div>
            <span className="admin-count">{t("admin.config.form.count", { count: entries.length })}</span>
          </div>

          <form className="admin-form" onSubmit={saveConfigurations}>
            {entries.map((entry) => (
              <label key={entry.key}>
                <span>{entry.label}</span>
                <small>{entry.description}</small>
                <input
                  onChange={(event) =>
                    setDraftValues((current) => ({
                      ...current,
                      [entry.key]: event.target.value,
                    }))
                  }
                  placeholder={entry.key}
                  type={entry.sensitive ? "password" : "text"}
                  value={draftValues[entry.key] ?? ""}
                />
                <small>
                  {t("admin.config.form.source", { source: entry.source })}
                  {entry.requiresRestart ? ` · ${t("admin.config.form.restartRequired")}` : ""}
                </small>
              </label>
            ))}

            <div className="admin-form-actions">
              <button className="primary-button" disabled={isLoading || isSaving || !hasChanges} type="submit">
                {isSaving ? t("admin.config.form.saving") : t("admin.config.form.save")}
              </button>
              <button
                className="secondary-button"
                disabled={isLoading || isSaving}
                onClick={() => void loadConfigurations()}
                type="button"
              >
                {t("admin.users.list.refresh")}
              </button>
            </div>
          </form>

          <FormMessage feedback={feedback} />
        </article>
      </section>
    </main>
  );
}
