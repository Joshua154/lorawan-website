import type { UserStats } from "@/components/admin/statistics/admin-statistics-utils";
import type { PingSummary } from "@/lib/types";

type AdminStatisticsOverviewProps = {
  summary: PingSummary | null;
  userStats: UserStats;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export function AdminStatisticsOverview({ summary, userStats, t }: AdminStatisticsOverviewProps) {
  return (
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
  );
}
