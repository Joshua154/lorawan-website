"use client";

import type { CalculationMode, SignalCategory, StabilityCategory, ViewMode } from "@/lib/types";

type ControlPanelProps = {
  mode: ViewMode;
  calculationMode: CalculationMode;
  minHexPoints: number;
  hexSize: number;
  selectedCategories: SignalCategory[];
  selectedStability: StabilityCategory[];
  selectedBoards: string[];
  selectedGateways: string[];
  boardCounts: Record<string, number>;
  gatewayCounts: Record<string, number>;
  followedBoardId: string | null;
  countdown: number;
  isUpdating: boolean;
  statusMessage: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onImportClick: () => void;
  onShowBonusInfo: () => void;
  onModeChange: (value: ViewMode) => void;
  onCalculationModeChange: (value: CalculationMode) => void;
  onHexSizeChange: (value: number) => void;
  onMinHexPointsChange: (value: number) => void;
  onToggleCategory: (value: SignalCategory) => void;
  onToggleStability: (value: StabilityCategory) => void;
  onToggleBoard: (value: string) => void;
  onToggleGateway: (value: string) => void;
  onFollowBoard: (value: string) => void;
};

const CATEGORY_OPTIONS: Array<{ value: SignalCategory; label: string; color: string }> = [
  { value: "good", label: "Sehr gut", color: "#2e7d32" },
  { value: "medium", label: "Mittel", color: "#f59e0b" },
  { value: "bad", label: "Schlecht", color: "#dc2626" },
  { value: "deadzone", label: "Funkloch", color: "#111827" },
];

const STABILITY_OPTIONS: Array<{ value: StabilityCategory; label: string }> = [
  { value: "0", label: "Schlecht / Keine Aussage" },
  { value: "unregular", label: "Unregelmäßig" },
  { value: "good", label: "Gut" },
  { value: "stable", label: "Sehr stabil" },
];

const HEX_SIZES = [
  { value: 0.0008, label: "Klein" },
  { value: 0.0015, label: "Mittel" },
  { value: 0.0035, label: "Groß" },
  { value: 0.007, label: "Sehr groß" },
];

const HEX_MIN_POINTS = [1, 5, 10, 25];

export function ControlPanel({
  mode,
  calculationMode,
  minHexPoints,
  hexSize,
  selectedCategories,
  selectedStability,
  selectedBoards,
  selectedGateways,
  boardCounts,
  gatewayCounts,
  followedBoardId,
  countdown,
  isUpdating,
  statusMessage,
  menuOpen,
  onToggleMenu,
  onImportClick,
  onShowBonusInfo,
  onModeChange,
  onCalculationModeChange,
  onHexSizeChange,
  onMinHexPointsChange,
  onToggleCategory,
  onToggleStability,
  onToggleBoard,
  onToggleGateway,
  onFollowBoard,
}: ControlPanelProps) {
  return (
    <>
      <button className="menu-toggle" onClick={onToggleMenu} type="button">
        {menuOpen ? "✕" : "☰"}
      </button>
      <aside className={`control-panel ${menuOpen ? "is-open" : ""}`}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">LoRaWAN x Next.js</p>
            <h1>GPS Dashboard</h1>
          </div>
          <button className="primary-button" onClick={onImportClick} type="button">
            📥 Vom Board importieren
          </button>
        </div>

        <div className="status-card">
          <div>
            <span className="status-label">Automatisches Update</span>
            <strong>{isUpdating ? "Läuft…" : `in ${countdown}s`}</strong>
          </div>
          <span className={`status-pill ${isUpdating ? "busy" : "ready"}`}>{statusMessage || "Bereit"}</span>
        </div>

        <section className="panel-section">
          <h2>Anzeigemodus</h2>
          <div className="stacked-options">
            {[
              ["markers", "Messpunkte"],
              ["heatmap", "Heatmap"],
              ["hexagon", "Hexagon-Netz"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  checked={mode === value}
                  name="mode"
                  onChange={() => onModeChange(value as ViewMode)}
                  type="radio"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {mode === "hexagon" ? (
            <div className="sub-grid">
              <label>
                <span>Min. Punkte pro Wabe</span>
                <select value={minHexPoints} onChange={(event) => onMinHexPointsChange(Number(event.target.value))}>
                  {HEX_MIN_POINTS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Hexagon-Größe</span>
                <select value={hexSize} onChange={(event) => onHexSizeChange(Number(event.target.value))}>
                  {HEX_SIZES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </section>

        <section className="panel-section">
          <div className="section-title-row">
            <h2>Signalberechnung</h2>
            <button className="help-button" onClick={onShowBonusInfo} type="button">
              ?
            </button>
          </div>
          <div className="stacked-options compact">
            <label>
              <input
                checked={calculationMode === "stabilized"}
                onChange={() => onCalculationModeChange("stabilized")}
                type="radio"
              />
              <span>Mit Stabilitäts-Bonus</span>
            </label>
            <label>
              <input
                checked={calculationMode === "raw"}
                onChange={() => onCalculationModeChange("raw")}
                type="radio"
              />
              <span>Ohne Bonus</span>
            </label>
          </div>
        </section>

        <section className="panel-section">
          <h2>Signalqualität</h2>
          <div className="stacked-options compact">
            {CATEGORY_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  checked={selectedCategories.includes(option.value)}
                  onChange={() => onToggleCategory(option.value)}
                  type="checkbox"
                />
                <span className="legend-dot" style={{ backgroundColor: option.color }} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <h2>Signalstabilität</h2>
          <div className="stacked-options compact">
            {STABILITY_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  checked={selectedStability.includes(option.value)}
                  onChange={() => onToggleStability(option.value)}
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <h2>Boards</h2>
          <div className="filter-list">
            {Object.keys(boardCounts)
              .sort((left, right) => Number(left) - Number(right))
              .map((boardId) => {
                const following = followedBoardId === boardId;
                return (
                  <div className="filter-row" key={boardId}>
                    <label>
                      <input
                        checked={selectedBoards.includes(boardId)}
                        onChange={() => onToggleBoard(boardId)}
                        type="checkbox"
                      />
                      <span>{`Board ${boardId} (${boardCounts[boardId]})`}</span>
                    </label>
                    <button
                      className={`follow-button ${following ? "active" : ""}`}
                      onClick={() => onFollowBoard(boardId)}
                      type="button"
                    >
                      🎯
                    </button>
                  </div>
                );
              })}
          </div>
        </section>

        <section className="panel-section">
          <h2>Gateways</h2>
          <div className="filter-list gateways">
            {Object.keys(gatewayCounts)
              .sort((left, right) => left.localeCompare(right))
              .map((gateway) => (
                <label key={gateway} title={gateway}>
                  <input
                    checked={selectedGateways.includes(gateway)}
                    onChange={() => onToggleGateway(gateway)}
                    type="checkbox"
                  />
                  <span>{`${gateway} (${gatewayCounts[gateway]})`}</span>
                </label>
              ))}
          </div>
        </section>
      </aside>
    </>
  );
}
