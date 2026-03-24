"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminStatisticsCharts } from "@/components/admin/statistics/admin-statistics-charts";
import { AdminStatisticsHeader } from "@/components/admin/statistics/admin-statistics-header";
import { AdminStatisticsOverview } from "@/components/admin/statistics/admin-statistics-overview";
import {
  POINTS_OVER_TIME_DAYS,
  buildDeviceSegments,
  buildPointsOverTime,
  getDataQualityEntries,
  getGatewayEntries,
  getPointsOverTimeSummary,
  getTopBoards,
  getUserStats,
  type TimeSeriesEntry,
} from "@/components/admin/statistics/admin-statistics-utils";
import { FormMessage } from "@/components/ui/form-message";
import type { DatasetResponse, ManagedUser, PingSummary, SessionUser } from "@/lib/types";
import { useTranslation } from "@/i18n/useTranslation";
import { useSessionActions } from "@/hooks/use-session-actions";

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

export function AdminStatisticsPanel({ viewer }: AdminStatisticsPanelProps) {
  const [summary, setSummary] = useState<PingSummary | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [pointsOverTime, setPointsOverTime] = useState<TimeSeriesEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);

  const { t } = useTranslation();
  const { logout, redirectHome, redirectToLogin } = useSessionActions();

  const loadStatistics = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    try {
      // TODO: implement base Path for API calls
      const [summaryResponse, usersResponse, pingsResponse] = await Promise.all([
        fetch("/api/pings/summary", { cache: "no-store" }),
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/pings", { cache: "no-store" }),
      ]);

      if (summaryResponse.status === 401 || usersResponse.status === 401 || pingsResponse.status === 401) {
        redirectToLogin();
        return;
      }

      if (summaryResponse.status === 403 || usersResponse.status === 403 || pingsResponse.status === 403) {
        redirectHome();
        return;
      }

      if (!summaryResponse.ok || !usersResponse.ok || !pingsResponse.ok) {
        setFeedback({ kind: "error", message: t("admin.stats.feedback.loadFailed") });
        return;
      }

      const summaryPayload = (await summaryResponse.json()) as PingSummary;
      const usersPayload = (await usersResponse.json()) as UserListResponse;
      const pingsPayload = (await pingsResponse.json()) as DatasetResponse;

      const pingsFeatures = pingsPayload.accessMode === "authenticated" ? pingsPayload.collection.features : [];

      setSummary(summaryPayload);
      setUsers(usersPayload.users);
      setPointsOverTime(buildPointsOverTime(pingsFeatures, POINTS_OVER_TIME_DAYS));
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
  const gatewayEntries = useMemo(() => getGatewayEntries(summary), [summary]);
  const userStats = useMemo(() => getUserStats(users), [users]);
  const topBoards = useMemo(() => getTopBoards(summary), [summary]);
  const dataQualityEntries = useMemo(() => getDataQualityEntries(summary, t), [summary, t]);
  const pointsSummary = useMemo(() => getPointsOverTimeSummary(pointsOverTime), [pointsOverTime]);

  return (
    <main className="admin-page">
      <section className="admin-page-shell stats-page-shell">
        <AdminStatisticsHeader onLogout={() => void logout()} t={t} username={viewer.username} />

        <AdminStatisticsOverview summary={summary} t={t} userStats={userStats} />

        <AdminStatisticsCharts
          dataQualityEntries={dataQualityEntries}
          deviceSegments={deviceSegments}
          gatewayEntries={gatewayEntries}
          isLoading={isLoading}
          onRefresh={() => void loadStatistics()}
          pointsOverTime={pointsOverTime}
          pointsSummary={pointsSummary}
          summary={summary}
          t={t}
          topBoards={topBoards}
          userStats={userStats}
        />

        <FormMessage feedback={feedback} />
      </section>
    </main>
  );
}
