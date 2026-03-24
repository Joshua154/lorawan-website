export type PieSegment = {
  label: string;
  value: number;
  percentage: number;
  color: string;
};

export type PieChartLabels = {
  title: string;
  centerSubtext: string;
  noData: string;
};

export type AdminStatisticsPieChartProps = {
  totalCenterValue: number;
  segments: PieSegment[];
  labels: PieChartLabels;
  className?: string;
};
