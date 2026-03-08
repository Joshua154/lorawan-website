"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AUTO_REFRESH_SECONDS, DEFAULT_HEX_MIN_POINTS, DEFAULT_HEX_SIZE, EMPTY_COLLECTION, buildFeatureKey, formatTimestamp, getSignalCategory, getStabilityCategory, isValidCoordinate, summarizeCollection, sortFeatures } from "@/lib/pings";
import type {
  CalculationMode,
  PingFeature,
  PingFeatureCollection,
  PingSummary,
  SignalCategory,
  StabilityCategory,
  ViewMode,
} from "@/lib/types";
import { ControlPanel } from "@/components/dashboard/control-panel";
import { TimelineControls } from "@/components/dashboard/timeline-controls";
import { LoraWanMap } from "@/components/map/lorawan-map";

type DatasetResponse = {
  collection: PingFeatureCollection;
  summary: PingSummary;
};

type RangeState = {
  start: number;
  end: number;
};

const PLAYBACK_SPEEDS = [1, 5, 10, 20, 50] as const;
const DEFAULT_SIGNAL_CATEGORIES: SignalCategory[] = ["good", "medium", "bad", "deadzone"];
const DEFAULT_STABILITY_CATEGORIES: StabilityCategory[] = ["0", "unregular", "good", "stable"];

export function DashboardShell() {
  const [collection, setCollection] = useState<PingFeatureCollection>(EMPTY_COLLECTION);
  const [summary, setSummary] = useState<PingSummary>(summarizeCollection(EMPTY_COLLECTION));
  const [mode, setMode] = useState<ViewMode>("markers");
  const [calculationMode, setCalculationMode] = useState<CalculationMode>("stabilized");
  const [selectedCategories, setSelectedCategories] = useState<SignalCategory[]>(DEFAULT_SIGNAL_CATEGORIES);
  const [selectedStability, setSelectedStability] = useState<StabilityCategory[]>(DEFAULT_STABILITY_CATEGORIES);
  const [selectedBoards, setSelectedBoards] = useState<string[]>([]);
  const [selectedGateways, setSelectedGateways] = useState<string[]>([]);
  const [hexSize, setHexSize] = useState(DEFAULT_HEX_SIZE);
  const [minHexPoints, setMinHexPoints] = useState(DEFAULT_HEX_MIN_POINTS);
  const [range, setRange] = useState<RangeState>({ start: 0, end: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Bereit");
  const [followedBoardId, setFollowedBoardId] = useState<string | null>(null);
  const [newFeatureKeys, setNewFeatureKeys] = useState<string[]>([]);
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

  const rangedFeatures = useMemo(() => {
    if (sortedFeatures.length === 0) {
      return [];
    }

    return sortedFeatures.slice(range.start, range.end + 1);
  }, [range.end, range.start, sortedFeatures]);

  const filteredFeatures = useMemo(() => {
    return rangedFeatures.filter((feature) => {
      const gateway = feature.properties.gateway ?? "Offline-Import (Flash)";
      const category = getSignalCategory(
        feature.properties.rssi,
        calculationMode === "stabilized" ? feature.properties.rssi_stabilized : undefined,
      );
      const stabilityCategory = getStabilityCategory(feature.properties.rssi_bonus);

      return (
        selectedBoards.includes(String(feature.properties.boardID)) &&
        selectedGateways.includes(gateway) &&
        selectedCategories.includes(category) &&
        selectedStability.includes(stabilityCategory)
      );
    });
  }, [calculationMode, rangedFeatures, selectedBoards, selectedCategories, selectedGateways, selectedStability]);

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
    return `Von ${startLabel} bis ${endLabel}`;
  }, [range.end, range.start, sortedFeatures]);

  const mergeSelections = useCallback((options: string[], previous: string[], known: string[]) => {
    if (previous.length === 0 && known.length === 0) {
      return options;
    }

    const previousSet = new Set(previous);
    return options.filter((option) => previousSet.has(option) || !known.includes(option));
  }, []);

  const fetchDataset = useCallback(async (checkForNew = false) => {
    const response = await fetch("/api/pings", { cache: "no-store" });
    const data = (await response.json()) as DatasetResponse;
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
    setNewFeatureKeys(nextNewFeatureKeys);
    latestTimestampRef.current = nextSortedFeatures.at(-1)?.properties.time ?? null;

    setRange((currentRange) => {
      const wasAtEnd = currentRange.end >= Math.max(previousMaxIndexRef.current - 1, 0) || !checkForNew;
      previousMaxIndexRef.current = newMaxIndex;

      return {
        start: checkForNew ? Math.min(currentRange.start, newMaxIndex) : 0,
        end: wasAtEnd ? newMaxIndex : Math.min(currentRange.end, newMaxIndex),
      };
    });
  }, []);

  useEffect(() => {
    void fetchDataset();
  }, [fetchDataset]);

  useEffect(() => {
    const boardOptions = Object.keys(boardCounts).sort((left, right) => Number(left) - Number(right));
    setSelectedBoards((previous) => mergeSelections(boardOptions, previous, knownBoardsRef.current));
    knownBoardsRef.current = boardOptions;
  }, [boardCounts, mergeSelections]);

  useEffect(() => {
    const gatewayOptions = Object.keys(gatewayCounts).sort((left, right) => left.localeCompare(right));
    setSelectedGateways((previous) => mergeSelections(gatewayOptions, previous, knownGatewaysRef.current));
    knownGatewaysRef.current = gatewayOptions;
  }, [gatewayCounts, mergeSelections]);

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
    setStatusMessage("Aktualisiere Daten…");

    try {
      const response = await fetch("/api/pings/update", { method: "POST" });
      const result = (await response.json()) as { status: string; total: number; added: number; updated: number; message?: string };

      if (result.status === "ok" || result.status === "cached") {
        await fetchDataset(true);
        if (result.added > 0 || result.updated > 0) {
          setStatusMessage(`✅ ${result.added} neu, ${result.updated} aktualisiert`);
        } else {
          setStatusMessage("🟡 Keine neuen Punkte");
        }
      } else {
        setStatusMessage(result.message ?? "❌ Update fehlgeschlagen");
      }
    } catch {
      setStatusMessage("❌ Server nicht erreichbar");
    } finally {
      setCountdown(AUTO_REFRESH_SECONDS);
      setIsUpdating(false);
      window.setTimeout(() => setStatusMessage("Bereit"), 5_000);
    }
  }, [fetchDataset, isUpdating]);

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
    setSelectedBoards((previous) =>
      previous.includes(boardId) ? previous.filter((item) => item !== boardId) : [...previous, boardId],
    );
  };

  const toggleGateway = (gateway: string) => {
    setSelectedGateways((previous) =>
      previous.includes(gateway) ? previous.filter((item) => item !== gateway) : [...previous, gateway],
    );
  };

  const toggleFollowBoard = (boardId: string) => {
    setFollowedBoardId((previous) => (previous === boardId ? null : boardId));
    if (!selectedBoards.includes(boardId)) {
      setSelectedBoards((previous) => [...previous, boardId]);
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

  const readFromBoard = async () => {
    setImportModalOpen(false);

    if (!("serial" in navigator)) {
      window.alert("Dein Browser unterstützt keine Web Serial API. Bitte nutze Chrome oder Edge.");
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
      setStatusMessage("📡 Lese Board-Daten…");

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
        window.alert("Fehler beim Import. Tipp: Drücke kurz den RST-Knopf am Board.");
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
            gateway: "Offline-Import (Flash)",
          },
        });
      }
    }

    if (extractedPings.length === 0) {
      window.alert("Keine neuen Messpunkte gefunden. Alle Daten sind bereits vorhanden.");
      setStatusMessage("Bereit");
      return;
    }

    const response = await fetch("/api/pings/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(extractedPings),
    });

    if (!response.ok) {
      throw new Error("Upload fehlgeschlagen");
    }

    const result = (await response.json()) as { added: number; updated: number };
    await fetchDataset(true);

    if (result.added > 0 && result.updated > 0) {
      window.alert(`${result.added} neue Funklöcher gespeichert und ${result.updated} bestehende Einträge aktualisiert.`);
    } else if (result.added > 0) {
      window.alert(`${result.added} neue Messpunkte wurden dauerhaft gespeichert.`);
    } else if (result.updated > 0) {
      window.alert(`${result.updated} Funklöcher wurden durch präzisere Daten ersetzt.`);
    } else {
      window.alert("Keine neuen Daten zum Speichern gefunden.");
    }

    setStatusMessage("✅ Import abgeschlossen");
    window.setTimeout(() => setStatusMessage("Bereit"), 5_000);
  };

  const maxRangeIndex = Math.max(sortedFeatures.length - 1, 0);

  return (
    <main className="dashboard-shell">
      <ControlPanel
        boardCounts={boardCounts}
        calculationMode={calculationMode}
        countdown={countdown}
        followedBoardId={followedBoardId}
        gatewayCounts={gatewayCounts}
        hexSize={hexSize}
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
      />

      <section className="map-stage">
        <div className="map-header-card">
          <div>
            <p className="eyebrow">Datensatz</p>
            <h2>{summary.validFeatures.toLocaleString("de-DE")} sichtbare Pings</h2>
          </div>
          <div className="summary-grid">
            <article>
              <span>Boards</span>
              <strong>{Object.keys(summary.boardCounts).length}</strong>
            </article>
            <article>
              <span>Gateways</span>
              <strong>{Object.keys(summary.gatewayCounts).length}</strong>
            </article>
            <article>
              <span>Letzter Ping</span>
              <strong>{formatTimestamp(summary.latestTimestamp)}</strong>
            </article>
          </div>
        </div>

        <LoraWanMap
          calculationMode={calculationMode}
          features={filteredFeatures}
          followedFeature={followedFeature}
          hexSize={hexSize}
          minHexPoints={minHexPoints}
          mode={mode}
          newFeatureKeys={newFeatureKeys}
        />

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
          pointCountLabel={`${filteredFeatures.length} Messpunkte im Bereich`}
          start={range.start}
        />
      </section>

      {bonusInfoOpen ? (
        <div className="modal-overlay" onClick={() => setBonusInfoOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setBonusInfoOpen(false)} type="button">
              ×
            </button>
            <h3>Was ist ein Stabilitätsbonus?</h3>
            <p>
              Messpunkte erhalten einen Bonus, wenn mehrere vorherige Pings desselben Boards innerhalb von 175 Metern
              stabil empfangen wurden.
            </p>
            <ul>
              <li>5/5 Pings: +15 dB</li>
              <li>4/5 Pings: +10 dB</li>
              <li>3/5 Pings: +5 dB</li>
              <li>2/5 Pings: +2 dB</li>
              <li>1/5 Ping: +1 dB</li>
            </ul>
          </div>
        </div>
      ) : null}

      {importModalOpen ? (
        <div className="modal-overlay" onClick={() => setImportModalOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setImportModalOpen(false)} type="button">
              ×
            </button>
            <h3>Board auslesen</h3>
            <ol>
              <li>Board per USB verbinden.</li>
              <li>Vor dem Import kurz den RST-Knopf drücken.</li>
              <li>Im Browser das passende USB-Gerät auswählen.</li>
              <li>Innerhalb der ersten 15 Sekunden nach dem Start auslesen.</li>
            </ol>
            <div className="modal-actions">
              <button className="primary-button" onClick={() => void readFromBoard()} type="button">
                Verbindung starten
              </button>
              <button className="secondary-button" onClick={() => setDriverInfoOpen(true)} type="button">
                Windows-Treiber
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {driverInfoOpen ? (
        <div className="modal-overlay" onClick={() => setDriverInfoOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setDriverInfoOpen(false)} type="button">
              ×
            </button>
            <h3>Treiber für Windows</h3>
            <p>
              Falls das Board unter Windows nicht erkannt wird, installiere den CP210x VCP Treiber von Silicon Labs und
              starte den Browser neu.
            </p>
            <a
              className="text-link"
              href="https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers?tab=downloads"
              rel="noreferrer"
              target="_blank"
            >
              Treiber herunterladen
            </a>
          </div>
        </div>
      ) : null}
    </main>
  );
}
