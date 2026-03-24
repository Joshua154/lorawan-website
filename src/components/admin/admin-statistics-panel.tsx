"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import type { ManagedUser, PingSummary, SessionUser } from "@/lib/types";
import { useTranslation } from "@/i18n/useTranslation";
import { useSessionActions } from "@/hooks/use-session-actions";
import { PieChart, PieSegment } from "@/components/stats/piechart";

type AdminStatisticsPanelProps = {
  viewer: SessionUser;
};

type UserListResponse = {
  users: ManagedUser[];
};

type FormFeedback = {
  kind: "success" | "error";
  message: string;
};

const PIE_COLORS = ["#4caf50", "#06b6d4", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444", "#64748b"];

function buildDeviceSegments(summary: PingSummary | null, t: (key: string, vars?: Record<string, string | number>) => string): PieSegment[] {
  if (!summary) {
    return [];
  }

  const entries = Object.entries(summary.boardCounts)
    .map(([boardId, value]) => ({
      label: t("admin.boards.boardLabel", { id: boardId }),
      value,
    }))
    .sort((left, right) => right.value - left.value);

  if (entries.length === 0) {
    return [];
  }

  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  const topEntries = entries.slice(0, 6);
  const remainingTotal = entries.slice(6).reduce((sum, entry) => sum + entry.value, 0);

  const segments = topEntries.map((entry, index) => ({
    ...entry,
    percentage: total === 0 ? 0 : (entry.value / total) * 100,
    color: PIE_COLORS[index % PIE_COLORS.length],
  }));

  if (remainingTotal > 0) {
    segments.push({
      label: t("admin.stats.charts.others"),
      value: remainingTotal,
      percentage: total === 0 ? 0 : (remainingTotal / total) * 100,
      color: PIE_COLORS[PIE_COLORS.length - 1],
    });
  }

  return segments;
}

export function AdminStatisticsPanel({ viewer }: AdminStatisticsPanelProps) {
  const [summary, setSummary] = useState<PingSummary | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);

  const { t } = useTranslation();
  const { logout, redirectHome, redirectToLogin } = useSessionActions();

  const loadStatistics = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    try {
      // TODO: implement base Path for API calls
      const [summaryResponse, usersResponse] = await Promise.all([
        fetch("/api/pings/summary", { cache: "no-store" }),
        fetch("/api/users", { cache: "no-store" }),
      ]);

      if (summaryResponse.status === 401 || usersResponse.status === 401) {
        redirectToLogin();
        return;
      }

      if (summaryResponse.status === 403 || usersResponse.status === 403) {
        redirectHome();
        return;
      }

      if (!summaryResponse.ok || !usersResponse.ok) {
        setFeedback({ kind: "error", message: t("admin.stats.feedback.loadFailed") });
        return;
      }

      const summaryPayload = (await summaryResponse.json()) as PingSummary;
      const usersPayload = (await usersResponse.json()) as UserListResponse;

      setSummary(summaryPayload);
      setUsers(usersPayload.users);
    } catch {
      setFeedback({ kind: "error", message: t("admin.stats.feedback.loadFailed") });
    } finally {
      setIsLoading(false);
    }
  }, [redirectHome, redirectToLogin, t]);

  useEffect(() => {
    void loadStatistics();
  }, [loadStatistics]);

  const deviceSegments = useMemo(() => buildDeviceSegments(summary, t), [summary, t]);

  const pieGradient = useMemo(() => {
    if (deviceSegments.length === 0) {
      return "conic-gradient(#e2e8f0 0deg 360deg)";
    }

    let currentAngle = 0;
    const slices: string[] = [];

    for (const segment of deviceSegments) {
      const segmentAngle = (segment.percentage / 100) * 360;
      const endAngle = currentAngle + segmentAngle;
      slices.push(`${segment.color} ${currentAngle}deg ${endAngle}deg`);
      currentAngle = endAngle;
    }

    return `conic-gradient(${slices.join(", ")})`;
  }, [deviceSegments]);

  const gatewayEntries = useMemo(() => {
    if (!summary) {
      return [];
    }

    return Object.entries(summary.gatewayCounts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6);
  }, [summary]);

  const maxGatewayValue = gatewayEntries[0]?.[1] ?? 1;

  const userStats = useMemo(() => {
    const admins = users.filter((user) => user.role === "admin").length;
    const local = users.filter((user) => user.auth_type === "local").length;
    const oauth = users.filter((user) => user.auth_type === "oauth").length;

    return {
      admins,
      local,
      oauth,
      total: users.length,
    };
  }, [users]);

  const topBoards = useMemo(() => {
    if (!summary) {
      return [];
    }

    return Object.entries(summary.boardCounts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8);
  }, [summary]);

  return (
    <main className="admin-page">
      <section className="admin-page-shell stats-page-shell">
        <header className="admin-toolbar">
          <div>
            <p className="eyebrow">{t("admin.stats.header.eyebrow")}</p>
            <h1>{t("admin.stats.header.title")}</h1>
            <p className="login-copy">{t("admin.stats.header.subtitle", { username: viewer.username })}</p>
          </div>
          <div className="viewer-actions admin-toolbar-actions">
            <span className="role-badge admin">{t("common.roles.admin")}</span>
            <div className="admin-toolbar-links">
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

        <section className="stats-overview-grid">
          <article className="admin-card">
            <span>{t("admin.stats.metrics.totalPings")}</span>
            <strong>{summary?.totalFeatures ?? 0}</strong>
          </article>
          <article className="admin-card">
            <span>{t("admin.stats.metrics.validPings")}</span>
            <strong>{summary?.validFeatures ?? 0}</strong>
          </article>
          <article className="admin-card">
            <span>{t("admin.stats.metrics.boards")}</span>
            <strong>{Object.keys(summary?.boardCounts ?? {}).length}</strong>
          </article>
          <article className="admin-card">
            <span>{t("admin.stats.metrics.gateways")}</span>
            <strong>{Object.keys(summary?.gatewayCounts ?? {}).length}</strong>
          </article>
          <article className="admin-card">
            <span>{t("admin.stats.metrics.admins")}</span>
            <strong>{userStats.admins}</strong>
          </article>
          <article className="admin-card">
            <span>{t("admin.users.stats.total")}</span>
            <strong>{userStats.total}</strong>
          </article>
        </section>

        <section className="stats-charts-grid">
          <article className="admin-card stats-chart-card">
            <div className="admin-card-header">
              <div>
                <p className="eyebrow">{t("admin.stats.charts.deviceContribution.eyebrow")}</p>
                <h3>{t("admin.stats.charts.deviceContribution.title")}</h3>
              </div>
              <button className="secondary-button" onClick={() => void loadStatistics()} type="button">
                {isLoading ? t("admin.stats.actions.loading") : t("admin.stats.actions.refresh")}
              </button>
            </div>

            <PieChart
                totalCenterValue={summary?.totalFeatures ?? 0}
                segments={deviceSegments}
                pieGradient={pieGradient}
                labels={{
                  title: t("admin.stats.charts.deviceContribution.title"),
                  centerSubtext: t("admin.stats.charts.deviceContribution.centerSubtext"),
                  noData: t("admin.stats.charts.noData"),
                }}
            />
          </article>

          <article className="admin-card stats-chart-card">
            <div>
              <p className="eyebrow">{t("admin.stats.charts.gatewayTraffic.eyebrow")}</p>
              <h3>{t("admin.stats.charts.gatewayTraffic.title")}</h3>
            </div>
            <div className="stats-bar-list">
              {gatewayEntries.length === 0 ? <p className="helper-text">{t("admin.stats.charts.noData")}</p> : null}
              {gatewayEntries.map(([gateway, value]) => (
                <article className="stats-bar-item" key={gateway}>
                  <div className="stats-bar-meta">
                    <strong>{gateway}</strong>
                    <span>{value}</span>
                  </div>
                  <div className="stats-bar-track">
                    <div className="stats-bar-fill" style={{ width: `${Math.max((value / maxGatewayValue) * 100, 5)}%` }} />
                  </div>
                </article>
              ))}
            </div>
          </article>

          <article className="admin-card stats-chart-card">
            <div>
              <p className="eyebrow">{t("admin.stats.charts.topBoards.eyebrow")}</p>
              <h3>{t("admin.stats.charts.topBoards.title")}</h3>
            </div>
            <div className="stats-table">
              {topBoards.length === 0 ? <p className="helper-text">{t("admin.stats.charts.noData")}</p> : null}
              {topBoards.map(([boardId, count], index) => (
                <article className="stats-table-row" key={boardId}>
                  <span>{index + 1}.</span>
                  <strong>{t("admin.boards.boardLabel", { id: boardId })}</strong>
                  <span>{count}</span>
                </article>
              ))}
            </div>
          </article>

          <article className="admin-card stats-chart-card">
            <div>
              <p className="eyebrow">{t("admin.stats.system.eyebrow")}</p>
              <h3>{t("admin.stats.system.title")}</h3>
            </div>
            <div className="summary-grid stats-summary-grid">
              <article>
                <span>{t("admin.stats.system.latestPing")}</span>
                <strong>{summary?.latestTimestamp ? new Date(summary.latestTimestamp).toLocaleString("de-DE") : "--"}</strong>
              </article>
              <article>
                <span>{t("admin.stats.system.earliestPing")}</span>
                <strong>{summary?.earliestTimestamp ? new Date(summary.earliestTimestamp).toLocaleString("de-DE") : "--"}</strong>
              </article>
              <article>
                <span>{t("admin.stats.system.localUsers")}</span>
                <strong>{userStats.local}</strong>
              </article>
              <article>
                <span>{t("admin.stats.system.oauthUsers")}</span>
                <strong>{userStats.oauth}</strong>
              </article>
            </div>
          </article>
        </section>

        <FormMessage feedback={feedback} />
      </section>
    </main>
  );
}
