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
import { apiUrl } from "@/lib/api-url";

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

type CachedStatisticsSnapshot = {
  summary: PingSummary;
  users: ManagedUser[];
  pointsOverTime: TimeSeriesEntry[];
  savedAt: string;
};

const STATISTICS_CACHE_KEY = "admin-statistics-snapshot-v1";

function readStatisticsCache(): CachedStatisticsSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STATISTICS_CACHE_KEY);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as CachedStatisticsSnapshot;
  } catch {
    return null;
  }
}

function writeStatisticsCache(payload: CachedStatisticsSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STATISTICS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore cache write failures (e.g. storage limits or private mode restrictions).
  }
}

export function AdminStatisticsPanel({ viewer }: AdminStatisticsPanelProps) {
  const [summary, setSummary] = useState<PingSummary | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [pointsOverTime, setPointsOverTime] = useState<TimeSeriesEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);

  const { t } = useTranslation();
  const { logout, redirectHome, redirectToLogin } = useSessionActions();

  const loadStatistics = useCallback(async (options?: { background?: boolean }) => {
    const shouldRefreshInBackground = options?.background ?? false;

    if (shouldRefreshInBackground) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
      setFeedback(null);
    }

    try {
      const [summaryResponse, usersResponse, pingsResponse] = await Promise.all([
        fetch(apiUrl("/api/pings/summary"), { cache: "no-store" }),
        fetch(apiUrl("/api/users"), { cache: "no-store" }),
        fetch(apiUrl("/api/pings"), { cache: "no-store" }),
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
      const pointsOverTimeEntries = buildPointsOverTime(pingsFeatures, POINTS_OVER_TIME_DAYS);

      setSummary(summaryPayload);
      setUsers(usersPayload.users);
      setPointsOverTime(pointsOverTimeEntries);

      writeStatisticsCache({
        summary: summaryPayload,
        users: usersPayload.users,
        pointsOverTime: pointsOverTimeEntries,
        savedAt: new Date().toISOString(),
      });
    } catch {
      if (!shouldRefreshInBackground) {
        setFeedback({ kind: "error", message: t("admin.stats.feedback.loadFailed") });
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [redirectHome, redirectToLogin, t]);

  useEffect(() => {
    const cachedSnapshot = readStatisticsCache();
    const hasCachedSnapshot = Boolean(cachedSnapshot);

    if (cachedSnapshot) {
      setSummary(cachedSnapshot.summary);
      setUsers(cachedSnapshot.users);
      setPointsOverTime(cachedSnapshot.pointsOverTime);
      setIsLoading(false);
    }

    void loadStatistics({ background: hasCachedSnapshot });
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
          isLoading={isLoading || isRefreshing}
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
