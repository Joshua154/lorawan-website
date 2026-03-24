import type { PieSegment } from "@/components/admin/statistics/admin-statistics-piechart";
import type { ManagedUser, PingFeature, PingSummary } from "@/lib/types";

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export type ChartBarEntry = {
  label: string;
  value: number;
  color: string;
};

export type TimeSeriesEntry = {
  key: string;
  shortLabel: string;
  fullLabel: string;
  count: number;
};

export type UserStats = {
  admins: number;
  local: number;
  oauth: number;
  total: number;
};

export type PointsOverTimeSummary = {
  total: number;
  average: number;
  peakEntry: TimeSeriesEntry | null;
};

export const PIE_COLORS = ["#4caf50", "#06b6d4", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444", "#64748b"];
export const POINTS_OVER_TIME_DAYS = 14;

function toDayKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function buildPointsOverTime(features: PingFeature[], dayCount: number): TimeSeriesEntry[] {
  const dayFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });

  const dayBuckets = new Map<string, { date: Date; count: number }>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    dayBuckets.set(toDayKey(date), { date, count: 0 });
  }

  for (const feature of features) {
    const pingDate = new Date(feature.properties.time);

    if (Number.isNaN(pingDate.getTime())) {
      continue;
    }

    pingDate.setHours(0, 0, 0, 0);
    const bucket = dayBuckets.get(toDayKey(pingDate));

    if (!bucket) {
      continue;
    }

    bucket.count += 1;
  }

  return [...dayBuckets.entries()].map(([key, bucket]) => ({
    key,
    shortLabel: dayFormatter.format(bucket.date),
    fullLabel: bucket.date.toLocaleDateString(),
    count: bucket.count,
  }));
}

export function buildDeviceSegments(summary: PingSummary | null, t: TranslateFn): PieSegment[] {
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

export function getGatewayEntries(summary: PingSummary | null): Array<[string, number]> {
  if (!summary) {
    return [];
  }

  return Object.entries(summary.gatewayCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);
}

export function getTopBoards(summary: PingSummary | null): Array<[string, number]> {
  if (!summary) {
    return [];
  }

  return Object.entries(summary.boardCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);
}

export function getDataQualityEntries(summary: PingSummary | null, t: TranslateFn): ChartBarEntry[] {
  const totalFeatures = summary?.totalFeatures ?? 0;
  const validFeatures = summary?.validFeatures ?? 0;
  const invalidFeatures = Math.max(totalFeatures - validFeatures, 0);

  return [
    {
      label: t("admin.stats.charts.dataQuality.valid"),
      value: validFeatures,
      color: "#4caf50",
    },
    {
      label: t("admin.stats.charts.dataQuality.invalid"),
      value: invalidFeatures,
      color: "#ef4444",
    },
  ];
}

export function getUserStats(users: ManagedUser[]): UserStats {
  let admins = 0;
  let local = 0;
  let oauth = 0;

  for (const user of users) {
    if (user.role === "admin") {
      admins += 1;
    }

    if (user.auth_type === "local") {
      local += 1;
    }

    if (user.auth_type === "oauth") {
      oauth += 1;
    }
  }

  return {
    admins,
    local,
    oauth,
    total: users.length,
  };
}

export function getPointsOverTimeSummary(pointsOverTime: TimeSeriesEntry[]): PointsOverTimeSummary {
  if (pointsOverTime.length === 0) {
    return {
      total: 0,
      average: 0,
      peakEntry: null,
    };
  }

  let total = 0;
  let peakEntry = pointsOverTime[0];

  for (const entry of pointsOverTime) {
    total += entry.count;

    if (entry.count > peakEntry.count) {
      peakEntry = entry;
    }
  }

  return {
    total,
    average: total / pointsOverTime.length,
    peakEntry,
  };
}
