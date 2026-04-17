"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n/useTranslation";

export type TimeFilter = "1h" | "24h" | "7d" | "30d";

// Desktop filter buttons – labels are the same in all languages
const TIME_FILTERS: { label: string; value: TimeFilter }[] = [
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
];

// Keys for the mobile dropdown – resolved via i18n at render time
const MOBILE_TIME_OPTION_KEYS: { key: string; value: TimeFilter | null }[] = [
  { key: "dashboard.timeline.filter.allTime", value: null },
  { key: "dashboard.timeline.filter.30d",     value: "30d" },
  { key: "dashboard.timeline.filter.7d",      value: "7d" },
  { key: "dashboard.timeline.filter.24h",     value: "24h" },
  { key: "dashboard.timeline.filter.1h",      value: "1h" },
];

type TimelineControlsProps = {
  start: number;
  end: number;
  max: number;
  isPlaying: boolean;
  playbackSpeed: number;
  currentRangeLabel: string;
  pointCountLabel: string;
  activeTimeFilter: TimeFilter | null;
  onPlayPause: () => void;
  onCycleSpeed: () => void;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
  onTimeFilter: (value: TimeFilter | null) => void;
};

export function TimelineControls({
  start,
  end,
  max,
  isPlaying,
  playbackSpeed,
  currentRangeLabel,
  pointCountLabel,
  activeTimeFilter,
  onPlayPause,
  onCycleSpeed,
  onStartChange,
  onEndChange,
  onTimeFilter,
}: TimelineControlsProps) {
  const safeMax = Math.max(max, 1);
  const left = (start / safeMax) * 100;
  const right = (end / safeMax) * 100;
  const startOnTop = start > max / 2;

  const { t } = useTranslation();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const activeOptionKey =
    MOBILE_TIME_OPTION_KEYS.find((o) => o.value === activeTimeFilter)?.key ??
    "dashboard.timeline.filter.allTime";
  const activeLabel = t(activeOptionKey);

  return (
    <div className="timeline-shell">
      <div className="timeline-meta">
        <div>
          <strong>{currentRangeLabel}</strong>
          <p>{pointCountLabel}</p>
        </div>
        <div className="timeline-actions">
          <div className="timeline-time-filters">
            {TIME_FILTERS.map((f) => (
              <button
                className={`timeline-button timeline-filter-btn${activeTimeFilter === f.value ? " active" : ""}`}
                key={f.value}
                onClick={() => onTimeFilter(activeTimeFilter === f.value ? null : f.value)}
                type="button"
              >
                {f.label}
              </button>
            ))}
          </div>
          <button className="timeline-button" onClick={onPlayPause} type="button">
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button className="timeline-button" onClick={onCycleSpeed} type="button">
            {playbackSpeed}x
          </button>
          <div className="timeline-mobile-filter" ref={dropdownRef}>
            <button
              className={`timeline-button timeline-mobile-filter-btn${activeTimeFilter !== null ? " active" : ""}`}
              onClick={() => setDropdownOpen((prev) => !prev)}
              type="button"
            >
              {activeLabel}
            </button>
            {dropdownOpen && (
              <div className="timeline-mobile-dropdown">
                {MOBILE_TIME_OPTION_KEYS.map((opt) => (
                  <button
                    className={`timeline-mobile-dropdown-item${activeTimeFilter === opt.value ? " active" : ""}`}
                    key={opt.value ?? "all"}
                    onClick={() => {
                      onTimeFilter(opt.value);
                      setDropdownOpen(false);
                    }}
                    type="button"
                  >
                    {t(opt.key)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="range-shell">
        <div className="range-track" />
        <div className="range-fill" style={{ left: `${left}%`, width: `${Math.max(right - left, 0)}%` }} />
        <input
          max={max}
          min={0}
          onChange={(event) => onStartChange(Number(event.target.value))}
          style={{ zIndex: startOnTop ? 2 : 1 }}
          type="range"
          className="start"
          value={start}
        />
        <input
          max={max}
          min={0}
          onChange={(event) => onEndChange(Number(event.target.value))}
          style={{ zIndex: startOnTop ? 1 : 2 }}
          type="range"
          className="end"
          value={end}
        />
      </div>
    </div>
  );
}
