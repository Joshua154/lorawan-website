import { memo, useMemo } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

import {
  type ChartBarEntry,
  type PointsOverTimeSummary,
  type TimeSeriesEntry,
  type TranslateFn,
  type UserStats,
  POINTS_OVER_TIME_DAYS,
} from "@/components/admin/statistics/admin-statistics-utils";
import {
  BAR_CHART_OPTIONS,
  POINTS_OVER_TIME_CHART_OPTIONS,
} from "@/components/admin/statistics/chart-options";
import {
  AdminStatisticsPieChart,
  type PieSegment,
} from "@/components/admin/statistics/admin-statistics-piechart";
import type { PingSummary } from "@/lib/types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
);

type AdminStatisticsChartsProps = {
  t: TranslateFn;
  isLoading: boolean;
  summary: PingSummary | null;
  deviceSegments: PieSegment[];
  gatewayEntries: Array<[string, number]>;
  topBoards: Array<[string, number]>;
  dataQualityEntries: ChartBarEntry[];
  pointsOverTime: TimeSeriesEntry[];
  pointsSummary: PointsOverTimeSummary;
  userStats: UserStats;
  onRefresh: () => void;
};

function AdminStatisticsChartsComponent({
  t,
  isLoading,
  summary,
  deviceSegments,
  gatewayEntries,
  topBoards,
  dataQualityEntries,
  pointsOverTime,
  pointsSummary,
  userStats,
  onRefresh,
}: AdminStatisticsChartsProps) {
  const totalFeatures = summary?.totalFeatures ?? 0;

  const pieChartLabels = useMemo(
    () => ({
      title: t("admin.stats.charts.deviceContribution.title"),
      centerSubtext: t("admin.stats.charts.deviceContribution.centerSubtext"),
      noData: t("admin.stats.charts.noData"),
    }),
    [t],
  );

  const gatewayChartData = useMemo(
    () => ({
      labels: gatewayEntries.map(([gateway]) => gateway),
      datasets: [
        {
          label: t("admin.stats.charts.gatewayTraffic.title"),
          data: gatewayEntries.map(([, value]) => value),
          backgroundColor: "rgba(59, 130, 246, 0.75)",
          borderRadius: 8,
          maxBarThickness: 36,
        },
      ],
    }),
    [gatewayEntries, t],
  );

  const dataQualityChartData = useMemo(
    () => ({
      labels: dataQualityEntries.map((entry) => entry.label),
      datasets: [
        {
          label: t("admin.stats.charts.dataQuality.title"),
          data: dataQualityEntries.map((entry) => entry.value),
          backgroundColor: dataQualityEntries.map((entry) => entry.color),
          borderRadius: 8,
          maxBarThickness: 48,
        },
      ],
    }),
    [dataQualityEntries, t],
  );

  const pointsOverTimeChartData = useMemo(
    () => ({
      labels: pointsOverTime.map((entry) => entry.shortLabel),
      datasets: [
        {
          label: t("admin.stats.charts.pointsOverTime.title"),
          data: pointsOverTime.map((entry) => entry.count),
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.22)",
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
          fill: true,
          tension: 0.3,
        },
      ],
    }),
    [pointsOverTime, t],
  );

  return (
    <section className="stats-charts-grid">
      <article className="admin-card stats-chart-card">
        <div className="admin-card-header">
          <div>
            <p className="eyebrow">
              {t("admin.stats.charts.deviceContribution.eyebrow")}
            </p>
            <h3>{t("admin.stats.charts.deviceContribution.title")}</h3>
          </div>
          <button
            className="secondary-button"
            disabled={isLoading}
            onClick={onRefresh}
            type="button"
          >
            {isLoading
              ? t("admin.stats.actions.loading")
              : t("admin.stats.actions.refresh")}
          </button>
        </div>

        <AdminStatisticsPieChart
          labels={pieChartLabels}
          segments={deviceSegments}
          totalCenterValue={totalFeatures}
        />
      </article>

      <article className="admin-card stats-chart-card">
        <div>
          <p className="eyebrow">
            {t("admin.stats.charts.pointsOverTime.eyebrow")}
          </p>
          <h3>{t("admin.stats.charts.pointsOverTime.title")}</h3>
        </div>

        <div className="stats-subsection">
          <p className="stats-subsection-title">
            {t("admin.stats.charts.pointsOverTime.window", {
              days: POINTS_OVER_TIME_DAYS,
            })}
          </p>
          {pointsOverTime.every((entry) => entry.count === 0) ? (
            <p className="helper-text">{t("admin.stats.charts.noData")}</p>
          ) : null}
          <div
            aria-label={t("admin.stats.charts.pointsOverTime.title")}
            className="stats-chart-canvas stats-chart-canvas-sm"
            role="img"
          >
            <Line
              data={pointsOverTimeChartData}
              options={POINTS_OVER_TIME_CHART_OPTIONS}
            />
          </div>
        </div>

        <div className="summary-grid stats-summary-grid">
          <article>
            <span>{t("admin.stats.charts.pointsOverTime.total")}</span>
            <strong>{pointsSummary.total}</strong>
          </article>
          <article>
            <span>{t("admin.stats.charts.pointsOverTime.average")}</span>
            <strong>{pointsSummary.average.toFixed(1)}</strong>
          </article>
          <article>
            <span>{t("admin.stats.charts.pointsOverTime.peak")}</span>
            <strong>
              {pointsSummary.peakEntry
                ? `${pointsSummary.peakEntry.count} (${pointsSummary.peakEntry.shortLabel})`
                : "--"}
            </strong>
          </article>
        </div>
      </article>

      <article className="admin-card stats-chart-card">
        <div>
          <p className="eyebrow">
            {t("admin.stats.charts.gatewayTraffic.eyebrow")}
          </p>
          <h3>{t("admin.stats.charts.gatewayTraffic.title")}</h3>
        </div>
        <div className="stats-chart-canvas">
          {gatewayEntries.length === 0 ? (
            <p className="helper-text">{t("admin.stats.charts.noData")}</p>
          ) : (
            <Bar data={gatewayChartData} options={BAR_CHART_OPTIONS} />
          )}
        </div>
      </article>

      <article className="admin-card stats-chart-card">
        <div>
          <p className="eyebrow">{t("admin.stats.charts.topBoards.eyebrow")}</p>
          <h3>{t("admin.stats.charts.topBoards.title")}</h3>
        </div>
        <div className="stats-table">
          {topBoards.length === 0 ? (
            <p className="helper-text">{t("admin.stats.charts.noData")}</p>
          ) : null}
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
          <p className="eyebrow">
            {t("admin.stats.charts.dataQuality.eyebrow")}
          </p>
          <h3>{t("admin.stats.charts.dataQuality.title")}</h3>
        </div>
        <div className="stats-chart-canvas">
          {totalFeatures === 0 ? (
            <p className="helper-text">{t("admin.stats.charts.noData")}</p>
          ) : (
            <Bar data={dataQualityChartData} options={BAR_CHART_OPTIONS} />
          )}
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
            <strong>
              {summary?.latestTimestamp
                ? new Date(summary.latestTimestamp).toLocaleString("de-DE")
                : "--"}
            </strong>
          </article>
          <article>
            <span>{t("admin.stats.system.earliestPing")}</span>
            <strong>
              {summary?.earliestTimestamp
                ? new Date(summary.earliestTimestamp).toLocaleString("de-DE")
                : "--"}
            </strong>
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
  );
}

export const AdminStatisticsCharts = memo(AdminStatisticsChartsComponent);
