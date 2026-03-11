"use client";

type TimelineControlsProps = {
  start: number;
  end: number;
  max: number;
  isPlaying: boolean;
  playbackSpeed: number;
  currentRangeLabel: string;
  pointCountLabel: string;
  onPlayPause: () => void;
  onCycleSpeed: () => void;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
};

export function TimelineControls({
  start,
  end,
  max,
  isPlaying,
  playbackSpeed,
  currentRangeLabel,
  pointCountLabel,
  onPlayPause,
  onCycleSpeed,
  onStartChange,
  onEndChange,
}: TimelineControlsProps) {
  const safeMax = Math.max(max, 1);
  const left = (start / safeMax) * 100;
  const right = (end / safeMax) * 100;
  const areThumbsOverlapping = start === end;

  return (
    <div className="timeline-shell">
      <div className="timeline-meta">
        <div>
          <strong>{currentRangeLabel}</strong>
          <p>{pointCountLabel}</p>
        </div>
        <div className="timeline-actions">
          <button className="timeline-button" onClick={onPlayPause} type="button">
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button className="timeline-button" onClick={onCycleSpeed} type="button">
            {playbackSpeed}x
          </button>
        </div>
      </div>
      <div className="range-shell">
        <div className="range-track" />
        <div className="range-fill" style={{ left: `${left}%`, width: `${Math.max(right - left, 0)}%` }} />
        <input
          max={max}
          min={0}
          onChange={(event) => onStartChange(Number(event.target.value))}
          style={{ zIndex: areThumbsOverlapping ? 2 : 1 }}
          type="range"
          className="start"
          value={start}
        />
        <input
          max={max}
          min={0}
          onChange={(event) => onEndChange(Number(event.target.value))}
          style={{ zIndex: areThumbsOverlapping ? 1 : 2 }}
          type="range"
          className="end"
          value={end}
        />
      </div>
    </div>
  );
}
