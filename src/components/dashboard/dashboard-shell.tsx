"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AUTO_REFRESH_SECONDS, DEFAULT_HEX_MIN_POINTS, DEFAULT_HEX_SIZE, EMPTY_COLLECTION, buildFeatureKey, formatTimestamp, getSignalCategory, getStabilityCategory, isValidCoordinate, sortFeatures } from "@/lib/pings";
import { extractManualPings } from "@/lib/ping-import";
import type {
  CalculationMode,
  DatasetResponse,
  PingFeatureCollection,
  PingNetwork,
  RestrictedHexagon,
  SessionUser,
  SignalCategory,
  StabilityCategory,
  ViewMode,
} from "@/lib/types";
import { mergeSelectableOptions, sortNumericStrings, toggleStringSelection } from "@/lib/users";
import { ControlPanel } from "@/components/dashboard/control-panel";
import { TimelineControls, type TimeFilter } from "@/components/dashboard/timeline-controls";
import { LoraWanMap } from "@/components/map/lorawan-map";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/i18n/useTranslation";
import { useSessionActions } from "@/hooks/use-session-actions";

type RangeState = {
  start: number;
  end: number;
};

type DashboardShellProps = {
  viewer: SessionUser | null;
  releaseMillisecondsRemaining: number | null;
};

const PLAYBACK_SPEEDS = [1, 5, 10, 20, 50] as const;
const DEFAULT_SIGNAL_CATEGORIES: SignalCategory[] = ["good", "medium", "bad", "deadzone"];
const DEFAULT_STABILITY_CATEGORIES: StabilityCategory[] = ["0", "unregular", "good", "stable"];
const DEFAULT_NETWORK: PingNetwork = "ttn";

export function DashboardShell({ viewer, releaseMillisecondsRemaining }: DashboardShellProps) {
  const { t } = useTranslation();
  const { logout, redirectToLogin } = useSessionActions();
  const isGuest = viewer === null;
  const isAdmin = viewer?.role === "admin";
  const [collection, setCollection] = useState<PingFeatureCollection>(EMPTY_COLLECTION);
  const [mode, setMode] = useState<ViewMode>(isGuest ? "hexagon" : "markers");
  const [calculationMode, setCalculationMode] = useState<CalculationMode>("stabilized");
  const [selectedCategories, setSelectedCategories] = useState<SignalCategory[]>(DEFAULT_SIGNAL_CATEGORIES);
  const [selectedStability, setSelectedStability] = useState<StabilityCategory[]>(DEFAULT_STABILITY_CATEGORIES);
  const [selectedNetwork, setSelectedNetwork] = useState<PingNetwork>(isGuest ? "chirpstack" : DEFAULT_NETWORK);
  const [selectedBoards, setSelectedBoards] = useState<string[] | null>(null);
  const [selectedGateways, setSelectedGateways] = useState<string[] | null>(null);
  const [hexSize, setHexSize] = useState(DEFAULT_HEX_SIZE);
  const [minHexPoints, setMinHexPoints] = useState(DEFAULT_HEX_MIN_POINTS);
  const [range, setRange] = useState<RangeState>({ start: 0, end: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusMessage, setStatusMessage] = useState(t("dashboard.status.ready"));
  const [followedBoardId, setFollowedBoardId] = useState<string | null>(null);
  const [activeTimeFilter, setActiveTimeFilter] = useState<TimeFilter | null>(null);
  const [newFeatureKeys, setNewFeatureKeys] = useState<string[]>([]);
  const [restrictedHexagons, setRestrictedHexagons] = useState<RestrictedHexagon[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bonusInfoOpen, setBonusInfoOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [driverInfoOpen, setDriverInfoOpen] = useState(false);

  const knownBoardsRef = useRef<string[]>([]);
  const knownGatewaysRef = useRef<string[]>([]);
  const previousMaxIndexRef = useRef(0);
  const latestTimestampRef = useRef<string | null>(null);

  const sortedFeatures = useMemo(
    () => sortFeatures(collection.features).filter((feature) => isValidCoordinate(feature.geometry.coordinates)),
    [collection.features],
  );

  const networkSortedFeatures = useMemo(
    () => sortedFeatures.filter((feature) => (feature.properties.network === "chirpstack" ? "chirpstack" : "ttn") === selectedNetwork),
    [sortedFeatures, selectedNetwork],
  );

  const boardCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const feature of sortedFeatures) {
      const network: PingNetwork = feature.properties.network === "chirpstack" ? "chirpstack" : "ttn";
      if (network !== selectedNetwork) continue;
      const boardId = String(feature.properties.boardID);
      counts[boardId] = (counts[boardId] ?? 0) + 1;
    }
    return counts;
  }, [sortedFeatures, selectedNetwork]);
  const gatewayCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const feature of sortedFeatures) {
      const network: PingNetwork = feature.properties.network === "chirpstack" ? "chirpstack" : "ttn";
      if (network !== selectedNetwork) continue;
      const gateway = feature.properties.gateway ?? t("map.sources.offlineImport");
      counts[gateway] = (counts[gateway] ?? 0) + 1;
    }
    return counts;
  }, [sortedFeatures, selectedNetwork, t]);
  const boardOptions = useMemo(
    () => sortNumericStrings(Object.keys(boardCounts)),
    [boardCounts],
  );
  const gatewayOptions = useMemo(
    () => Object.keys(gatewayCounts).sort((left, right) => left.localeCompare(right)),
    [gatewayCounts],
  );

  const rangedFeatures = useMemo(() => {
    if (networkSortedFeatures.length === 0) {
      return [];
    }

    return networkSortedFeatures.slice(range.start, range.end + 1);
  }, [range.end, range.start, networkSortedFeatures]);

  const filteredFeatures = useMemo(() => {
    return rangedFeatures.filter((feature) => {
      const gateway = feature.properties.gateway ?? t("map.sources.offlineImport");
      const category = getSignalCategory(
        feature.properties.rssi,
        calculationMode === "stabilized" ? feature.properties.rssi_stabilized : undefined,
      );
      const stabilityCategory = getStabilityCategory(feature.properties.rssi_bonus);
      const network: PingNetwork = feature.properties.network === "chirpstack" ? "chirpstack" : "ttn";

      return (
        network === selectedNetwork &&
        (selectedBoards === null || selectedBoards.includes(String(feature.properties.boardID))) &&
        (selectedGateways === null || selectedGateways.includes(gateway)) &&
        selectedCategories.includes(category) &&
        selectedStability.includes(stabilityCategory)
      );
    });
  }, [calculationMode, rangedFeatures, selectedBoards, selectedCategories, selectedGateways, selectedNetwork, selectedStability, t]);

  const followedFeature = useMemo(() => {
    if (!followedBoardId) {
      return null;
    }

    const boardFeatures = networkSortedFeatures.filter(
      (feature) => String(feature.properties.boardID) === followedBoardId,
    );
    return boardFeatures.at(-1) ?? null;
  }, [followedBoardId, networkSortedFeatures]);

  const rangeLabel = useMemo(() => {
    const startLabel = formatTimestamp(networkSortedFeatures[range.start]?.properties.time);
    const endLabel = formatTimestamp(networkSortedFeatures[range.end]?.properties.time);
    return t("dashboard.range.fromTo", { start: startLabel, end: endLabel });
  }, [range.end, range.start, networkSortedFeatures, t]);

  const fetchDataset = useCallback(async (checkForNew = false) => {
    const searchParams = new URLSearchParams();

    if (isGuest) {
      searchParams.set("hexSize", String(hexSize));
      searchParams.set("minHexPoints", String(minHexPoints));
      searchParams.set("network", selectedNetwork);
    }

    const response = await fetch(`/api/pings${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`, { cache: "no-store" });

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    const data = (await response.json()) as DatasetResponse;

    if (data.accessMode === "guest") {
      setCollection(EMPTY_COLLECTION);
      setRestrictedHexagons(data.restrictedHexagons);
      setCountdown(data.nextUpdateInSeconds || AUTO_REFRESH_SECONDS);
      setNewFeatureKeys([]);
      latestTimestampRef.current = null;
      previousMaxIndexRef.current = 0;
      setRange({ start: 0, end: 0 });
      return;
    }

    const nextSortedFeatures = sortFeatures(data.collection.features).filter((feature) =>
      isValidCoordinate(feature.geometry.coordinates),
    );
    const nextNetworkFeatures = nextSortedFeatures.filter(
      (f) => (f.properties.network === "chirpstack" ? "chirpstack" : "ttn") === selectedNetwork,
    );
    const newMaxIndex = Math.max(nextNetworkFeatures.length - 1, 0);

    let nextNewFeatureKeys: string[] = [];
    if (checkForNew && latestTimestampRef.current) {
      nextNewFeatureKeys = nextNetworkFeatures
        .filter((feature) => Date.parse(feature.properties.time) > Date.parse(latestTimestampRef.current ?? ""))
        .map(buildFeatureKey);
    }

    setCollection(data.collection);
    // setRestrictedHexagons([]);
    setCountdown(data.nextUpdateInSeconds || AUTO_REFRESH_SECONDS);
    setNewFeatureKeys(nextNewFeatureKeys);
    latestTimestampRef.current = nextNetworkFeatures.at(-1)?.properties.time ?? null;

    const previousMaxIndex = previousMaxIndexRef.current;
    
    setRange((currentRange) => {
      const wasAtEnd = currentRange.end >= Math.max(previousMaxIndex - 1, 0) || !checkForNew;
      return {
        start: checkForNew ? Math.min(currentRange.start, newMaxIndex) : 0,
        end: wasAtEnd ? newMaxIndex : Math.min(currentRange.end, newMaxIndex),
      };
    });
    
    previousMaxIndexRef.current = newMaxIndex;
  }, [hexSize, isGuest, minHexPoints, redirectToLogin, selectedNetwork]);

  useEffect(() => {
    if (isGuest && mode !== "hexagon") {
      setMode("hexagon");
    }
  }, [isGuest, mode]);

  useEffect(() => {
    void fetchDataset();
  }, [fetchDataset]);

  useEffect(() => {
    if (!isGuest) {
      const newMaxIndex = Math.max(networkSortedFeatures.length - 1, 0);
      previousMaxIndexRef.current = newMaxIndex;
      setRange({ start: 0, end: newMaxIndex });
    }
  }, [selectedNetwork]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const knownBoards = knownBoardsRef.current;
    setSelectedBoards((previous) => mergeSelectableOptions(boardOptions, previous, knownBoards));
    knownBoardsRef.current = boardOptions;
  }, [boardOptions]);

  useEffect(() => {
    const knownGateways = knownGatewaysRef.current;
    setSelectedGateways((previous) => mergeSelectableOptions(gatewayOptions, previous, knownGateways));
    knownGatewaysRef.current = gatewayOptions;
  }, [gatewayOptions]);

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setRange((currentRange) => {
        if (currentRange.end >= networkSortedFeatures.length - 1) {
          window.clearInterval(interval);
          setIsPlaying(false);
          return currentRange;
        }

        return { ...currentRange, end: currentRange.end + 1 };
      });
    }, 200 / playbackSpeed);

    return () => window.clearInterval(interval);
  }, [isPlaying, playbackSpeed, sortedFeatures.length]);

  const runRemoteUpdate = useCallback(async () => {
    if (isUpdating) {
      return;
    }

    setIsUpdating(true);
    setStatusMessage(t("dashboard.status.loading"));

    try {
      await fetchDataset(true);
      setStatusMessage(t("dashboard.status.current"));
    } catch {
      setStatusMessage(t("dashboard.status.unreachable"));
    } finally {
      setIsUpdating(false);
      window.setTimeout(() => setStatusMessage(t("dashboard.status.ready")), 5_000);
    }
  }, [fetchDataset, isUpdating, t]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCountdown((currentCountdown) => {
        if (isUpdating) {
          return currentCountdown;
        }

        if (currentCountdown <= 1) {
          void runRemoteUpdate();
          return AUTO_REFRESH_SECONDS;
        }

        return currentCountdown - 1;
      });
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [isUpdating, runRemoteUpdate]);

  const toggleSignalCategory = (value: SignalCategory) => {
    setSelectedCategories((previous) =>
      previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value],
    );
  };

  const toggleStabilityCategory = (value: StabilityCategory) => {
    setSelectedStability((previous) =>
      previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value],
    );
  };

  const selectNetwork = (network: PingNetwork) => {
    setSelectedNetwork(network);
  };

  const toggleBoard = (boardId: string) => {
    setSelectedBoards((previous) => {
      const currentSelection = previous ?? boardOptions;
      return toggleStringSelection(currentSelection, boardId);
    });
  };

  const toggleGateway = (gateway: string) => {
    setSelectedGateways((previous) => {
      const currentSelection = previous ?? gatewayOptions;
      return toggleStringSelection(currentSelection, gateway);
    });
  };

  const toggleFollowBoard = (boardId: string) => {
    if (isGuest) {
      return;
    }

    setFollowedBoardId((previous) => (previous === boardId ? null : boardId));
    if (selectedBoards === null || !selectedBoards.includes(boardId)) {
      setSelectedBoards((previous) => {
        const currentSelection = previous ?? boardOptions;
        return currentSelection.includes(boardId) ? currentSelection : [...currentSelection, boardId];
      });
    }
  };

  const applyTimeFilter = (filter: TimeFilter | null) => {
    setActiveTimeFilter(filter);
    setIsPlaying(false);
    if (!filter) return;
    const windowMs = filter === "1h" ? 3_600_000 : filter === "24h" ? 86_400_000 : 604_800_000;
    const cutoff = Date.now() - windowMs;
    const firstIndex = networkSortedFeatures.findIndex((f) => Date.parse(f.properties.time) >= cutoff);
    const startIndex = firstIndex === -1 ? networkSortedFeatures.length - 1 : firstIndex;
    window.setTimeout(() => {
      setRange((current) => ({ start: startIndex, end: current.end }));
    }, 50);
  };

  const cyclePlaybackSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed as (typeof PLAYBACK_SPEEDS)[number]);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    setPlaybackSpeed(PLAYBACK_SPEEDS[nextIndex]);
  };

  const togglePlayback = () => {
    if (!isPlaying) {
      setRange((currentRange) => ({ ...currentRange, end: currentRange.start }));
    }
    setIsPlaying((currentValue) => !currentValue);
  };

  const readFromBoard = async () => {
    setImportModalOpen(false);

    if (!("serial" in navigator)) {
      window.alert(t("dashboard.import.serialUnsupported"));
      return;
    }

    let port: SerialPort | undefined;

    try {
      port = await navigator.serial?.requestPort();
      await port?.open({ baudRate: 115200 });
      await port?.setSignals?.({ dataTerminalReady: true, requestToSend: true });

      const encoder = new TextEncoder();
      const writer = port?.writable.getWriter();
      await writer?.write(encoder.encode("d"));
      writer?.releaseLock();

      const reader = port?.readable.getReader();
      let csvData = "";
      setStatusMessage(t("dashboard.import.readingBoard"));

      try {
        while (reader) {
          const readPromise = reader.read();
          const timeoutPromise = new Promise<{ timeout: true }>((resolve) => {
            window.setTimeout(() => resolve({ timeout: true }), 2_000);
          });
          const result = await Promise.race([readPromise, timeoutPromise]);

          if ("timeout" in result) {
            if (csvData.includes("--- END DUMP ---") || csvData.length > 0) {
              break;
            }
            continue;
          }

          if (result.done) {
            break;
          }

          csvData += new TextDecoder().decode(result.value);
          if (csvData.includes("--- END DUMP ---")) {
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            break;
          }
        }
      } finally {
        reader?.releaseLock();
      }

      if (csvData.trim()) {
        await processEepromData(csvData);
      }
    } catch (error) {
      if (
        !(error instanceof DOMException) ||
        (error.name !== "NotFoundError" && error.name !== "AbortError")
      ) {
        window.alert(t("dashboard.import.error"));
      }
    } finally {
      await port?.close().catch(() => undefined);
    }
  };

  const processEepromData = async (data: string) => {
    const extractedPings = extractManualPings(data, sortedFeatures, t("map.sources.offlineImport"));

    if (extractedPings.length === 0) {
      window.alert(t("dashboard.import.noNewPoints"));
      setStatusMessage(t("dashboard.status.ready"));
      return;
    }

    const response = await fetch("/api/pings/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(extractedPings),
    });

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    if (!response.ok) {
      const result = (await response.json()) as { message?: string };
      throw new Error(result.message ?? t("dashboard.import.error"));
    }

    const result = (await response.json()) as { added: number; updated: number };
    await fetchDataset(true);

    if (result.added > 0 && result.updated > 0) {
      window.alert(t("dashboard.import.results.addedUpdated", { added: result.added, updated: result.updated }));
    } else if (result.added > 0) {
      window.alert(t("dashboard.import.results.added", { added: result.added }));
    } else if (result.updated > 0) {
      window.alert(t("dashboard.import.results.updated", { updated: result.updated }));
    } else {
      window.alert(t("dashboard.import.results.none"));
    }

    setStatusMessage(t("dashboard.import.completed"));
    window.setTimeout(() => setStatusMessage(t("dashboard.status.ready")), 5_000);
  };

  const maxRangeIndex = Math.max(networkSortedFeatures.length - 1, 0);
  const isAtLiveEdge = range.end >= maxRangeIndex;

  return (
    <main className="dashboard-shell">
      <ControlPanel
        boardCounts={boardCounts}
        // canImport={isAdmin}
        canImport={!isGuest && true}
        calculationMode={calculationMode}
        countdown={countdown}
        followedBoardId={followedBoardId}
        gatewayCounts={gatewayCounts}
        hexSize={hexSize}
        isGuest={isGuest}
        releaseMillisecondsRemaining={releaseMillisecondsRemaining}
        isUpdating={isUpdating}
        menuOpen={menuOpen}
        minHexPoints={minHexPoints}
        mode={mode}
        onCalculationModeChange={setCalculationMode}
        onFollowBoard={toggleFollowBoard}
        onHexSizeChange={setHexSize}
        onImportClick={() => setImportModalOpen(true)}
        onMinHexPointsChange={setMinHexPoints}
        onModeChange={setMode}
        onShowBonusInfo={() => setBonusInfoOpen(true)}
        onToggleBoard={toggleBoard}
        onToggleCategory={toggleSignalCategory}
        onToggleGateway={toggleGateway}
        selectedNetwork={selectedNetwork}
        onSelectNetwork={selectNetwork}
        onToggleMenu={() => setMenuOpen((currentValue) => !currentValue)}
        onToggleStability={toggleStabilityCategory}
        selectedBoards={selectedBoards}
        selectedCategories={selectedCategories}
        selectedGateways={selectedGateways}
        selectedStability={selectedStability}
        statusMessage={statusMessage}
        handleLogout={logout}
        isAdmin={Boolean(isAdmin)}
      />

      <section className="map-stage">
        <LoraWanMap
          calculationMode={calculationMode}
          features={filteredFeatures}
          followedFeature={followedFeature}
          isAtLiveEdge={isAtLiveEdge}
          hexSize={hexSize}
          minHexPoints={minHexPoints}
          mode={mode}
          newFeatureKeys={newFeatureKeys}
          restrictedHexagons={restrictedHexagons}
        />

        {!isGuest ? (
          <TimelineControls
            currentRangeLabel={rangeLabel}
            end={range.end}
            isPlaying={isPlaying}
            max={maxRangeIndex}
            onCycleSpeed={cyclePlaybackSpeed}
            activeTimeFilter={activeTimeFilter}
            onEndChange={(value) => setRange((currentRange) => ({ ...currentRange, end: Math.max(value, currentRange.start) }))}
            onPlayPause={togglePlayback}
            onStartChange={(value) => { setActiveTimeFilter(null); setRange((currentRange) => ({ ...currentRange, start: Math.min(value, currentRange.end) })); }}
            onTimeFilter={applyTimeFilter}
            playbackSpeed={playbackSpeed}
            pointCountLabel={t("dashboard.timeline.pointsInRange", { count: filteredFeatures.length })}
            start={range.start}
          />
        ) : null}
      </section>

      <Modal onClose={() => setBonusInfoOpen(false)} open={bonusInfoOpen} title={t("dashboard.help.bonus.title")}>
        <p>{t("dashboard.help.bonus.description")}</p>
        <ul>
          {[5, 4, 3, 2, 1].map((bonus) => (
            <li key={bonus}>{t(`dashboard.help.bonus.tiers.${bonus}`)}</li>
          ))}
        </ul>
      </Modal>

      <Modal closeIcon="x" onClose={() => setImportModalOpen(false)} open={importModalOpen} title={t("dashboard.import.modal.title")}>
        <ol>
          {[1, 2, 3, 4].map((step) => (
            <li key={step}>{t(`dashboard.import.modal.steps.${step}`)}</li>
          ))}
        </ol>
        <div className="modal-actions">
          <button className="primary-button" onClick={() => void readFromBoard()} type="button">
            {t("dashboard.import.modal.readBoard")}
          </button>
          <button className="secondary-button" onClick={() => setDriverInfoOpen(true)} type="button">
            {t("dashboard.import.modal.driverInfo")}
          </button>
        </div>
      </Modal>

      <Modal closeIcon="x" onClose={() => setDriverInfoOpen(false)} open={driverInfoOpen} title={t("dashboard.help.driver.title")}>
        <p>{t("dashboard.help.driver.description")}</p>
        <a
          className="text-link"
          href="https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers?tab=downloads"
          rel="noreferrer"
          target="_blank"
        >
          {t("dashboard.help.driver.linkText")}
        </a>
      </Modal>
    </main>
  );
}
