"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AUTO_REFRESH_SECONDS, DEFAULT_HEX_MIN_POINTS, DEFAULT_HEX_SIZE, EMPTY_COLLECTION, buildFeatureKey, formatTimestamp, getSignalCategory, getStabilityCategory, isValidCoordinate, summarizeCollection, sortFeatures } from "@/lib/pings";
import type {
  CalculationMode,
  DatasetResponse,
  PingFeature,
  PingFeatureCollection,
  PingSummary,
  RestrictedHexagon,
  SessionUser,
  SignalCategory,
  StabilityCategory,
  ViewMode,
} from "@/lib/types";
import { ControlPanel } from "@/components/dashboard/control-panel";
import { TimelineControls } from "@/components/dashboard/timeline-controls";
import { LoraWanMap } from "@/components/map/lorawan-map";
import { useTranslation } from "@/i18n/useTranslation";

type RangeState = {
  start: number;
  end: number;
};

type DashboardShellProps = {
  viewer: SessionUser | null;
};

const PLAYBACK_SPEEDS = [1, 5, 10, 20, 50] as const;
const DEFAULT_SIGNAL_CATEGORIES: SignalCategory[] = ["good", "medium", "bad", "deadzone"];
const DEFAULT_STABILITY_CATEGORIES: StabilityCategory[] = ["0", "unregular", "good", "stable"];

export function DashboardShell({ viewer }: DashboardShellProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const isGuest = viewer === null;
  const isAdmin = viewer?.role === "admin";
  const [collection, setCollection] = useState<PingFeatureCollection>(EMPTY_COLLECTION);
  const [summary, setSummary] = useState<PingSummary>(summarizeCollection(EMPTY_COLLECTION));
  const [mode, setMode] = useState<ViewMode>(isGuest ? "hexagon" : "markers");
  const [calculationMode, setCalculationMode] = useState<CalculationMode>("stabilized");
  const [selectedCategories, setSelectedCategories] = useState<SignalCategory[]>(DEFAULT_SIGNAL_CATEGORIES);
  const [selectedStability, setSelectedStability] = useState<StabilityCategory[]>(DEFAULT_STABILITY_CATEGORIES);
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

  const boardCounts = useMemo(() => summary.boardCounts, [summary.boardCounts]);
  const gatewayCounts = useMemo(() => summary.gatewayCounts, [summary.gatewayCounts]);
  const boardOptions = useMemo(
    () => Object.keys(boardCounts).sort((left, right) => Number(left) - Number(right)),
    [boardCounts],
  );
  const gatewayOptions = useMemo(
    () => Object.keys(gatewayCounts).sort((left, right) => left.localeCompare(right)),
    [gatewayCounts],
  );

  const rangedFeatures = useMemo(() => {
    if (sortedFeatures.length === 0) {
      return [];
    }

    return sortedFeatures.slice(range.start, range.end + 1);
  }, [range.end, range.start, sortedFeatures]);

  const filteredFeatures = useMemo(() => {
    return rangedFeatures.filter((feature) => {
      const gateway = feature.properties.gateway ?? t("map.sources.offlineImport");
      const category = getSignalCategory(
        feature.properties.rssi,
        calculationMode === "stabilized" ? feature.properties.rssi_stabilized : undefined,
      );
      const stabilityCategory = getStabilityCategory(feature.properties.rssi_bonus);

      return (
        (selectedBoards === null || selectedBoards.includes(String(feature.properties.boardID))) &&
        (selectedGateways === null || selectedGateways.includes(gateway)) &&
        selectedCategories.includes(category) &&
        selectedStability.includes(stabilityCategory)
      );
    });
  }, [calculationMode, rangedFeatures, selectedBoards, selectedCategories, selectedGateways, selectedStability, t]);

  const followedFeature = useMemo(() => {
    if (!followedBoardId) {
      return null;
    }

    const boardFeatures = sortedFeatures.filter(
      (feature) => String(feature.properties.boardID) === followedBoardId,
    );
    return boardFeatures.at(-1) ?? null;
  }, [followedBoardId, sortedFeatures]);

  const rangeLabel = useMemo(() => {
    const startLabel = formatTimestamp(sortedFeatures[range.start]?.properties.time);
    const endLabel = formatTimestamp(sortedFeatures[range.end]?.properties.time);
    return t("dashboard.range.fromTo", { start: startLabel, end: endLabel });
  }, [range.end, range.start, sortedFeatures, t]);

  const mergeSelections = useCallback((options: string[], previous: string[] | null, known: string[]) => {
    if (previous === null || (previous.length === 0 && known.length === 0)) {
      return options;
    }

    const previousSet = new Set(previous);
    return options.filter((option) => previousSet.has(option) || !known.includes(option));
  }, []);

  const redirectToLogin = useCallback(() => {
    router.push("/login");
    router.refresh();
  }, [router]);

  const fetchDataset = useCallback(async (checkForNew = false) => {
    const searchParams = new URLSearchParams();

    if (isGuest) {
      searchParams.set("hexSize", String(hexSize));
      searchParams.set("minHexPoints", String(minHexPoints));
    }

    const response = await fetch(`/api/pings${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`, { cache: "no-store" });

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    const data = (await response.json()) as DatasetResponse;

    if (data.accessMode === "guest") {
      setCollection(EMPTY_COLLECTION);
      setSummary(data.summary);
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
    const newMaxIndex = Math.max(nextSortedFeatures.length - 1, 0);

    let nextNewFeatureKeys: string[] = [];
    if (checkForNew && latestTimestampRef.current) {
      nextNewFeatureKeys = nextSortedFeatures
        .filter((feature) => Date.parse(feature.properties.time) > Date.parse(latestTimestampRef.current ?? ""))
        .map(buildFeatureKey);
    }

    setCollection(data.collection);
    setSummary(data.summary);
    // setRestrictedHexagons([]);
    setCountdown(data.nextUpdateInSeconds || AUTO_REFRESH_SECONDS);
    setNewFeatureKeys(nextNewFeatureKeys);
    latestTimestampRef.current = nextSortedFeatures.at(-1)?.properties.time ?? null;

    const previousMaxIndex = previousMaxIndexRef.current;
    
    setRange((currentRange) => {
      const wasAtEnd = currentRange.end >= Math.max(previousMaxIndex - 1, 0) || !checkForNew;
      return {
        start: checkForNew ? Math.min(currentRange.start, newMaxIndex) : 0,
        end: wasAtEnd ? newMaxIndex : Math.min(currentRange.end, newMaxIndex),
      };
    });
    
    previousMaxIndexRef.current = newMaxIndex;
  }, [hexSize, isGuest, minHexPoints, redirectToLogin]);

  useEffect(() => {
    if (isGuest && mode !== "hexagon") {
      setMode("hexagon");
    }
  }, [isGuest, mode]);

  useEffect(() => {
    void fetchDataset();
  }, [fetchDataset]);

  useEffect(() => {
    const knownBoards = knownBoardsRef.current;
    setSelectedBoards((previous) => mergeSelections(boardOptions, previous, knownBoards));
    knownBoardsRef.current = boardOptions;
  }, [boardOptions, mergeSelections]);

  useEffect(() => {
    const knownGateways = knownGatewaysRef.current;
    setSelectedGateways((previous) => mergeSelections(gatewayOptions, previous, knownGateways));
    knownGatewaysRef.current = gatewayOptions;
  }, [gatewayOptions, mergeSelections]);

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setRange((currentRange) => {
        if (currentRange.end >= sortedFeatures.length - 1) {
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

  const toggleBoard = (boardId: string) => {
    setSelectedBoards((previous) => {
      const currentSelection = previous ?? boardOptions;
      return currentSelection.includes(boardId)
        ? currentSelection.filter((item) => item !== boardId)
        : [...currentSelection, boardId];
    });
  };

  const toggleGateway = (gateway: string) => {
    setSelectedGateways((previous) => {
      const currentSelection = previous ?? gatewayOptions;
      return currentSelection.includes(gateway)
        ? currentSelection.filter((item) => item !== gateway)
        : [...currentSelection, gateway];
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

  const cyclePlaybackSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed as (typeof PLAYBACK_SPEEDS)[number]);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    setPlaybackSpeed(PLAYBACK_SPEEDS[nextIndex]);
  };

  const togglePlayback = () => {
    if (!isPlaying && range.end >= sortedFeatures.length - 1) {
      setRange((currentRange) => ({ ...currentRange, end: currentRange.start }));
    }
    setIsPlaying((currentValue) => !currentValue);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    redirectToLogin();
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
    const lines = data.split("\n");
    const extractedPings: PingFeature[] = [];
    let detectedBoardId = 0;

    for (const line of lines) {
      if (line.startsWith("BoardID:")) {
        detectedBoardId = Number(line.split(":")[1]);
      }
    }

    for (const line of lines) {
      if (!line.includes(";") || line.includes("Counter")) {
        continue;
      }

      const [counter, longitude, latitude] = line.trim().split(";");
      const parsedCounter = Number(counter);
      const parsedLongitude = Number(longitude);
      const parsedLatitude = Number(latitude);

      if (!(parsedLatitude > 52 && parsedLatitude < 53 && parsedLongitude > 12 && parsedLongitude < 14)) {
        continue;
      }

      const duplicate = sortedFeatures.some((feature) => {
        const [featureLongitude, featureLatitude] = feature.geometry.coordinates;
        return (
          String(feature.properties.boardID) === String(detectedBoardId) &&
          Number(feature.properties.counter) === parsedCounter &&
          featureLongitude.toFixed(6) === parsedLongitude.toFixed(6) &&
          featureLatitude.toFixed(6) === parsedLatitude.toFixed(6)
        );
      });

      if (!duplicate) {
        extractedPings.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [parsedLongitude, parsedLatitude],
          },
          properties: {
            boardID: detectedBoardId,
            counter: parsedCounter,
            time: new Date().toISOString(),
            rssi: -1,
            gateway: t("map.sources.offlineImport"),
          },
        });
      }
    }

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

  const maxRangeIndex = Math.max(sortedFeatures.length - 1, 0);

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
        onToggleMenu={() => setMenuOpen((currentValue) => !currentValue)}
        onToggleStability={toggleStabilityCategory}
        selectedBoards={selectedBoards}
        selectedCategories={selectedCategories}
        selectedGateways={selectedGateways}
        selectedStability={selectedStability}
        statusMessage={statusMessage}
        handleLogout={handleLogout}
        isAdmin={Boolean(isAdmin)}
      />

      <section className="map-stage">
        <LoraWanMap
          calculationMode={calculationMode}
          features={filteredFeatures}
          followedFeature={followedFeature}
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
            onEndChange={(value) => setRange((currentRange) => ({ ...currentRange, end: Math.max(value, currentRange.start) }))}
            onPlayPause={togglePlayback}
            onStartChange={(value) => setRange((currentRange) => ({ ...currentRange, start: Math.min(value, currentRange.end) }))}
            playbackSpeed={playbackSpeed}
            pointCountLabel={t("dashboard.timeline.pointsInRange", { count: filteredFeatures.length })}
            start={range.start}
          />
        ) : null}
      </section>

      {bonusInfoOpen ? (
        <div className="modal-overlay" onClick={() => setBonusInfoOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setBonusInfoOpen(false)} type="button">
              ×
            </button>
            <h3>{t("dashboard.help.bonus.title")}</h3>
            <p>{t("dashboard.help.bonus.description")}</p>
            <ul>
                {[5, 4, 3, 2, 1].map((bonus) => (
              <li key={bonus}>{t(`dashboard.help.bonus.tiers.${bonus}`)}</li>
                ))}
            </ul>
          </div>
        </div>
      ) : null}

      {importModalOpen ? (
        <div className="modal-overlay" onClick={() => setImportModalOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setImportModalOpen(false)} type="button">
              x
            </button>
            <h3>{t("dashboard.import.modal.title")}</h3>
            <ol>
                {[1, 2, 3, 4].map((bonus) => (
                <li key={bonus}>{t(`dashboard.import.modal.steps.${bonus}`)}</li>
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
          </div>
        </div>
      ) : null}

      {driverInfoOpen ? (
        <div className="modal-overlay" onClick={() => setDriverInfoOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setDriverInfoOpen(false)} type="button">
              x
            </button>
            <h3>{t("dashboard.help.driver.title")}</h3>
            <p>
              {t("dashboard.help.driver.description")}
            </p>
            <a
              className="text-link"
              href="https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers?tab=downloads"
              rel="noreferrer"
              target="_blank"
            >
              {t("dashboard.help.driver.linkText")}
            </a>
          </div>
        </div>
      ) : null}
    </main>
  );
}
