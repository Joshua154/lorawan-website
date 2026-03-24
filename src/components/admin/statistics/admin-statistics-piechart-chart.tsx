"use client";

import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";
import { memo, useMemo } from "react";
import { Doughnut } from "react-chartjs-2";

import type { PieChartLabels, PieSegment } from "@/components/admin/statistics/admin-statistics-piechart.types";

ChartJS.register(ArcElement, Tooltip, Legend);

type AdminStatisticsPieChartCanvasProps = {
  totalCenterValue: number;
  segments: PieSegment[];
  labels: PieChartLabels;
};

function AdminStatisticsPieChartCanvasComponent({
  totalCenterValue,
  segments,
  labels,
}: AdminStatisticsPieChartCanvasProps) {
  const chartData = useMemo(() => {
    if (segments.length === 0) {
      return {
        labels: [labels.noData],
        datasets: [
          {
            data: [1],
            backgroundColor: ["#e2e8f0"],
            borderWidth: 0,
          },
        ],
      };
    }

    return {
      labels: segments.map((segment) => segment.label),
      datasets: [
        {
          data: segments.map((segment) => segment.value),
          backgroundColor: segments.map((segment) => segment.color),
          borderWidth: 0,
        },
      ],
    };
  }, [labels.noData, segments]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: {
          display: true,
          position: "bottom" as const,
          labels: {
            usePointStyle: true,
            boxWidth: 10,
            boxHeight: 10,
            padding: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: (context: { label?: string; parsed: number }) => {
              if (segments.length === 0) {
                return labels.noData;
              }

              const value = context.parsed;
              const percentage = totalCenterValue === 0 ? 0 : (value / totalCenterValue) * 100;
              return `${context.label ?? ""}: ${value} · ${percentage.toFixed(1)}%`;
            },
          },
        },
      },
    }),
    [labels.noData, segments.length, totalCenterValue],
  );

  return (
    <div aria-label={labels.title} className="stats-pie">
      <Doughnut data={chartData} options={chartOptions} />
      {/* <div className="stats-pie-center">
        <strong>{totalCenterValue}</strong>
        <span>{labels.centerSubtext}</span>
      </div> */}
    </div>
  );
}

export const AdminStatisticsPieChartCanvas = memo(AdminStatisticsPieChartCanvasComponent);
