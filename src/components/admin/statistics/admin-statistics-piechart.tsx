"use client";

import { memo } from "react";

import { AdminStatisticsPieChartCanvas } from "@/components/admin/statistics/admin-statistics-piechart-chart";
import type { AdminStatisticsPieChartProps } from "@/components/admin/statistics/admin-statistics-piechart.types";

function AdminStatisticsPieChartComponent({
  totalCenterValue,
  segments,
  labels,
  className = "",
}: AdminStatisticsPieChartProps) {
  return (
    <div className={className}>
      <AdminStatisticsPieChartCanvas labels={labels} segments={segments} totalCenterValue={totalCenterValue} />
    </div>
  );
}

export const AdminStatisticsPieChart = memo(AdminStatisticsPieChartComponent);
export type { AdminStatisticsPieChartProps, PieChartLabels, PieSegment } from "@/components/admin/statistics/admin-statistics-piechart.types";
