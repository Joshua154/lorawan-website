

export type PieSegment = {
  label: string;
  value: number;
  percentage: number;
  color: string;
};

export type PieChartProps = {
  /** The total number to display in the center of the donut/pie */
  totalCenterValue: number;
  /** Array of data segments to populate the chart and legend */
  segments: PieSegment[];
  /** The CSS background value (usually a conic-gradient) */
  pieGradient: string;
  /** Dictionary for localized strings */
  labels: {
    title: string;
    centerSubtext: string;
    noData: string;
  };
  /** Optional class name to override or extend layout styles */
  className?: string;
};
export function PieChart({
  totalCenterValue = 0,
  segments = [],
  pieGradient,
  labels,
  className = "",
}: PieChartProps) {
  return (
    <div className={`stats-pie-layout ${className}`}>
      {/* Chart Graphic */}
      <div
        aria-label={labels.title}
        className="stats-pie"
        role="img"
        style={{ background: pieGradient }}
      >
        <div className="stats-pie-center">
          <strong>{totalCenterValue}</strong>
          <span>{labels.centerSubtext}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="stats-legend">
        {segments.length === 0 && (
          <p className="helper-text">{labels.noData}</p>
        )}

        {segments.map((segment) => (
          <article className="stats-legend-item" key={segment.label}>
            <span
              className="stats-legend-dot"
              style={{ background: segment.color }}
            />
            <div>
              <strong>{segment.label}</strong>
              <p className="helper-text">
                {segment.value} &middot; {segment.percentage.toFixed(1)}%
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
