import type { ChartOptions } from "chart.js";

// TODO: fix labels
export const BAR_CHART_OPTIONS: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        autoSkip: true,
        maxRotation: 0,
      },
    },
    y: {
      beginAtZero: true,
      ticks: {
        precision: 0,
        maxTicksLimit: 6,
      },
    },
  },
};

export const POINTS_OVER_TIME_CHART_OPTIONS: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        maxTicksLimit: 7,
        maxRotation: 0,
      },
    },
    y: {
      beginAtZero: true,
      ticks: {
        precision: 0,
        maxTicksLimit: 6,
      },
    },
  },
};
