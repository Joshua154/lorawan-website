"use client";

import type { CalculationMode, SignalCategory, StabilityCategory, ViewMode } from "@/lib/types";
import Link from "next/link";
import { useState } from "react";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { FormMessage } from "@/components/ui/form-message";
import { RoleBadge } from "@/components/ui/role-badge";
import { useTranslation } from "@/i18n/useTranslation";
import { sortNumericStrings } from "@/lib/users";

type ControlPanelProps = {
  canImport: boolean;
  isGuest: boolean;
  mode: ViewMode;
  calculationMode: CalculationMode;
  minHexPoints: number;
  hexSize: number;
  selectedCategories: SignalCategory[];
  selectedStability: StabilityCategory[];
  selectedBoards: string[] | null;
  selectedGateways: string[] | null;
  boardCounts: Record<string, number>;
  gatewayCounts: Record<string, number>;
  followedBoardId: string | null;
  countdown: number;
  isUpdating: boolean;
  statusMessage: string;
  menuOpen: boolean;
  isAdmin: boolean;
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
  handleLogout: () => Promise<void>;
};

const CATEGORY_OPTIONS: Array<{ value: SignalCategory; key: string; color: string }> = [
  { value: "good", key: "dashboard.quality.categories.good", color: "#2e7d32" },
  { value: "medium", key: "dashboard.quality.categories.medium", color: "#f59e0b" },
  { value: "bad", key: "dashboard.quality.categories.bad", color: "#dc2626" },
  { value: "deadzone", key: "dashboard.quality.categories.deadzone", color: "#111827" },
];

const STABILITY_OPTIONS: Array<{ value: StabilityCategory; key: string }> = [
  { value: "0", key: "dashboard.stability.levels.0" },
  { value: "unregular", key: "dashboard.stability.levels.unregular" },
  { value: "good", key: "dashboard.stability.levels.good" },
  { value: "stable", key: "dashboard.stability.levels.stable" },
];

const HEX_SIZES = [
  { value: 0.0008, key: "dashboard.hex.sizes.small" },
  { value: 0.0015, key: "dashboard.hex.sizes.medium" },
  { value: 0.0035, key: "dashboard.hex.sizes.large" },
  { value: 0.007, key: "dashboard.hex.sizes.xlarge" },
];

const HEX_MIN_POINTS = [1, 5, 10, 25];

export function ControlPanel({
  canImport,
  isGuest,
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
  handleLogout,
  isAdmin,
}: ControlPanelProps) {
  const { t } = useTranslation();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const roleLabel = isGuest
    ? t("common.roles.guest")
    : isAdmin
      ? t("common.roles.admin")
      : t("common.roles.user");

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handlePasswordChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordFeedback(null);

    if (newPassword.trim().length < 6) {
      setPasswordFeedback({ kind: "error", message: t("dashboard.account.password.errors.minLength") });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ kind: "error", message: t("dashboard.account.password.errors.mismatch") });
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const response = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setPasswordFeedback({
          kind: "error",
          message: payload.message ?? t("dashboard.account.password.errors.generic"),
        });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({ kind: "success", message: t("dashboard.account.password.feedback.updated") });
    } catch {
      setPasswordFeedback({ kind: "error", message: t("dashboard.account.password.errors.generic") });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <>
      <button className="menu-toggle" onClick={onToggleMenu} type="button">
        {menuOpen ? "✕" : "☰"}
      </button>
      <aside className={`control-panel ${menuOpen ? "is-open" : ""}`}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">
              LoRaWAN
              <RoleBadge className="inline" label={roleLabel} role={isAdmin ? "admin" : "user"} />
            </p>
            <h1>{t("dashboard.panel.heading")}</h1>
            {isGuest ? <p className="helper-text">{t("dashboard.guest.notice")}</p> : null}
          </div>
          {canImport ? (
            <button className="primary-button" onClick={onImportClick} type="button">
              {t("dashboard.panel.importFromBoard")}
            </button>
          ) : null}
        </div>

        <div className="status-card">
          <div className="viewer-links">
            {isGuest ? (
              <Link className="secondary-button nav-link-button" href="/login">
                {t("common.actions.login")}
              </Link>
            ) : null}
            {!isGuest && isAdmin ? (
              <Link className="secondary-button nav-link-button" href="/admin">
                {t("dashboard.panel.adminArea")}
              </Link>
            ) : null}
            {!isGuest ? (
              <button className="secondary-button" onClick={() => void handleLogout()} type="button">
                {t("common.actions.logout")}
              </button>
            ) : null}
          </div>
        </div>

        <div className="status-card">
          <div>
            <span className="status-label">{t("dashboard.status.autoUpdate")}</span>
            <strong>{isUpdating ? t("dashboard.status.running") : t("dashboard.status.inSeconds", { count: countdown })}</strong>
          </div>
          <span className={`status-pill ${isUpdating ? "busy" : "ready"}`}>{statusMessage || t("dashboard.status.ready")}</span>
        </div>

        {!isGuest ? (
          <CollapsibleSection
            collapsed={Boolean(collapsedSections["display"])}
            onToggle={() => toggleSection("display")}
            title={<h2 style={{ margin: 0 }}>{t("dashboard.display.title")}</h2>}
          >
            {isGuest ? (
              <p className="helper-text">{t("dashboard.guest.hexagonOnly")}</p>
            ) : (
              <div className="stacked-options">
                {[
                  ["markers", t("dashboard.display.modes.markers")],
                  ["heatmap", t("dashboard.display.modes.heatmap")],
                  ["hexagon", t("dashboard.display.modes.hexagon")],
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
            )}
            {mode === "hexagon" ? (
              <div className="sub-grid" style={{ marginTop: "0.65rem" }}>
                <label>
                  <span>{t("dashboard.hex.minPoints")}</span>
                  <select value={minHexPoints} onChange={(event) => onMinHexPointsChange(Number(event.target.value))}>
                    {HEX_MIN_POINTS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("dashboard.hex.size")}</span>
                  <select value={hexSize} onChange={(event) => onHexSizeChange(Number(event.target.value))}>
                    {HEX_SIZES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.key)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </CollapsibleSection>
        ) : null}

        {!isGuest ? (
          <CollapsibleSection
            collapsed={Boolean(collapsedSections["calculation"])}
            onToggle={() => toggleSection("calculation")}
            title={<h2 style={{ margin: 0 }}>{t("dashboard.calculation.title")}</h2>}
            titleAccessory={
              <button
                className="help-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onShowBonusInfo();
                }}
                style={{ width: "1.5rem", height: "1.5rem", fontSize: "0.8rem", padding: 0 }}
                type="button"
              >
                ?
              </button>
            }
          >
            <div className="stacked-options compact">
              <label>
                <input
                  checked={calculationMode === "stabilized"}
                  onChange={() => onCalculationModeChange("stabilized")}
                  type="radio"
                />
                <span>{t("dashboard.calculation.withBonus")}</span>
              </label>
              <label>
                <input
                  checked={calculationMode === "raw"}
                  onChange={() => onCalculationModeChange("raw")}
                  type="radio"
                />
                <span>{t("dashboard.calculation.withoutBonus")}</span>
              </label>
            </div>
          </CollapsibleSection>
        ) : null}

        {!isGuest ? (
          <CollapsibleSection
            collapsed={Boolean(collapsedSections["quality"])}
            onToggle={() => toggleSection("quality")}
            title={<h2 style={{ margin: 0 }}>{t("dashboard.quality.title")}</h2>}
          >
            <div className="stacked-options compact">
              {CATEGORY_OPTIONS.map((option) => (
                <label key={option.value}>
                  <input
                    checked={selectedCategories.includes(option.value)}
                    onChange={() => onToggleCategory(option.value)}
                    type="checkbox"
                  />
                  <span className="legend-dot" style={{ backgroundColor: option.color }} />
                  <span>{t(option.key)}</span>
                </label>
              ))}
            </div>
          </CollapsibleSection>
        ) : null}

        {!isGuest ? (
          <CollapsibleSection
            collapsed={Boolean(collapsedSections["stability"])}
            onToggle={() => toggleSection("stability")}
            title={<h2 style={{ margin: 0 }}>{t("dashboard.stability.title")}</h2>}
          >
            <div className="stacked-options compact">
              {STABILITY_OPTIONS.map((option) => (
                <label key={option.value}>
                  <input
                    checked={selectedStability.includes(option.value)}
                    onChange={() => onToggleStability(option.value)}
                    type="checkbox"
                  />
                  <span>{t(option.key)}</span>
                </label>
              ))}
            </div>
          </CollapsibleSection>
        ) : null}

        {!isGuest ? (
          <CollapsibleSection
            collapsed={Boolean(collapsedSections["boards"])}
            onToggle={() => toggleSection("boards")}
            title={<h2 style={{ margin: 0 }}>{t("dashboard.filters.boardsTitle")}</h2>}
          >
            <div className="filter-list">
              {sortNumericStrings(Object.keys(boardCounts)).map((boardId) => {
                const following = followedBoardId === boardId;
                return (
                  <div className="filter-row" key={boardId}>
                    <label>
                      <input
                        checked={selectedBoards === null || selectedBoards.includes(boardId)}
                        onChange={() => onToggleBoard(boardId)}
                        type="checkbox"
                      />
                      <span>{t("dashboard.filters.boardLabel", { id: boardId, count: boardCounts[boardId] })}</span>
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
          </CollapsibleSection>
        ) : null}

        {!isGuest ? (
          <CollapsibleSection
            collapsed={Boolean(collapsedSections["gateways"])}
            onToggle={() => toggleSection("gateways")}
            title={<h2 style={{ margin: 0 }}>{t("dashboard.filters.gatewaysTitle")}</h2>}
          >
            <div className="filter-list gateways">
              {Object.keys(gatewayCounts)
                .sort((left, right) => left.localeCompare(right))
                .map((gateway) => (
                  <label key={gateway} title={gateway}>
                    <input
                      checked={selectedGateways === null || selectedGateways.includes(gateway)}
                      onChange={() => onToggleGateway(gateway)}
                      type="checkbox"
                    />
                    <span>{t("dashboard.filters.gatewayLabel", { gateway, count: gatewayCounts[gateway] })}</span>
                  </label>
                ))}
            </div>
          </CollapsibleSection>
        ) : null}

        {!isGuest ? (
          <CollapsibleSection
            collapsed={Boolean(collapsedSections["account"])}
            onToggle={() => toggleSection("account")}
            title={<h2 style={{ margin: 0 }}>{t("dashboard.account.title")}</h2>}
          >
            <form className="stacked-options compact" onSubmit={handlePasswordChange}>
              <label>
                <span>{t("dashboard.account.password.current")}</span>
                <input
                  autoComplete="current-password"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  type="password"
                  value={currentPassword}
                />
              </label>
              <label>
                <span>{t("dashboard.account.password.new")}</span>
                <input
                  autoComplete="new-password"
                  minLength={6}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  type="password"
                  value={newPassword}
                />
              </label>
              <label>
                <span>{t("dashboard.account.password.confirm")}</span>
                <input
                  autoComplete="new-password"
                  minLength={6}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  type="password"
                  value={confirmPassword}
                />
              </label>
              <FormMessage feedback={passwordFeedback} />
              <button className="primary-button" disabled={isUpdatingPassword} type="submit">
                {isUpdatingPassword ? t("dashboard.account.password.submitting") : t("dashboard.account.password.submit")}
              </button>
            </form>
          </CollapsibleSection>
        ) : null}
      </aside>
    </>
  );
}
	