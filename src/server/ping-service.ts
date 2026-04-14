import { isValidCoordinate, summarizeCollection } from "@/lib/pings";
import type { PingFeature, PingFeatureCollection, PingSummary, UpdateResult } from "@/lib/types";
import { listPingFeatureRows, replacePingFeatures, type DbPingRow } from "@/server/database";

const CACHE_DURATION_MS = 30_000;
const LOOKBACK_HOURS = 6;

// Serializes all read-modify-write operations on the feature collection to
// prevent race conditions when multiple MQTT messages arrive concurrently.
let collectionLock: Promise<void> = Promise.resolve();
function withCollectionLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const next = new Promise<void>((r) => { release = r; });
  const acquired = collectionLock.then(() => fn());
  collectionLock = acquired.then(release, release);
  return acquired;
}

type CacheState = {
  lastLogUpdate: number;
  lastAddedCount: number;
  lastUpdatedCount: number;
};

const cacheState: CacheState = {
  lastLogUpdate: 0,
  lastAddedCount: 0,
  lastUpdatedCount: 0,
};

export function getNextUpdateInSeconds(): number {
  const nextUpdate = cacheState.lastLogUpdate + CACHE_DURATION_MS;
  const remainingMs = Math.max(0, nextUpdate - Date.now());
  return Math.ceil(remainingMs / 1000);
}

declare global {
  var __pingPollingIntervalStarted: boolean | undefined;
}

if (!globalThis.__pingPollingIntervalStarted) {
  globalThis.__pingPollingIntervalStarted = true;
  setInterval(() => {
    runRemoteUpdate().catch((error) => console.error("Background ping update failed:", error));
  }, CACHE_DURATION_MS);

  setTimeout(() => {
    runRemoteUpdate().catch((error) => console.error("Initial ping update failed:", error));
  }, 1000);
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapPingRow(row: DbPingRow): PingFeature {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [Number(row.longitude), Number(row.latitude)],
    },
    properties: {
      boardID: row.board_id,
      counter: Number(row.counter),
      gateway: row.gateway_name ?? undefined,
      rssi: Number(row.rssi),
      snr: row.snr == null ? undefined : Number(row.snr),
      time: toIsoString(row.observed_at),
      rssi_stabilized: row.rssi_stabilized == null ? undefined : Number(row.rssi_stabilized),
      rssi_bonus: row.rssi_bonus == null ? undefined : Number(row.rssi_bonus),
      network: (row.network === "chirpstack" ? "chirpstack" : "ttn"),
    },
  };
}

export async function loadFeatureCollection(): Promise<PingFeatureCollection> {
  const rows = await listPingFeatureRows();

  return {
    type: "FeatureCollection",
    features: rows.map(mapPingRow),
  };
}

async function saveFeatureCollection(collection: PingFeatureCollection): Promise<void> {
  await replacePingFeatures(collection.features);
}

function getDistanceMeters(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const earthRadius = 6_371_000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  return earthRadius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function parseTimestamp(value: string): number {
  return Date.parse(value);
}

function applyStabilityBonus(features: PingFeature[]): void {
  features.sort((left, right) => parseTimestamp(left.properties.time) - parseTimestamp(right.properties.time));

  for (let index = 0; index < features.length; index += 1) {
    const currentFeature = features[index];
    const properties = currentFeature.properties;
    const [currentLon, currentLat] = currentFeature.geometry.coordinates;

    if (properties.rssi === -1 || properties.rssi <= -129) {
      properties.rssi_stabilized = properties.rssi;
      properties.rssi_bonus = 0;
      continue;
    }

    const currentTime = parseTimestamp(properties.time);
    const boardId = String(properties.boardID);
    const currentCounter = Number(properties.counter);
    const currentNetwork = properties.network === "chirpstack" ? "chirpstack" : "ttn";
    const lookbackLimit = currentTime - LOOKBACK_HOURS * 60 * 60 * 1000;

    let foundPrevious = 0;
    let lastValidCounter = currentCounter;

    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
      const previousFeature = features[previousIndex];
      const previousProperties = previousFeature.properties;
      const previousTime = parseTimestamp(previousProperties.time);

      if (previousTime < lookbackLimit) {
        break;
      }

      if (String(previousProperties.boardID) !== boardId) {
        continue;
      }

      const previousNetwork = previousProperties.network === "chirpstack" ? "chirpstack" : "ttn";
      if (previousNetwork !== currentNetwork) {
        continue;
      }

      const previousCounter = Number(previousProperties.counter);
      if (previousCounter >= lastValidCounter || previousCounter < currentCounter - 5) {
        break;
      }

      const [previousLon, previousLat] = previousFeature.geometry.coordinates;
      const distance = getDistanceMeters(currentLon, currentLat, previousLon, previousLat);

      if (distance <= 175 && !(previousProperties.rssi === -1 || previousProperties.rssi <= -129)) {
        foundPrevious += 1;
        lastValidCounter = previousCounter;
      }

      if (foundPrevious >= 5) {
        break;
      }
    }

    const bonus = ({ 5: 15, 4: 10, 3: 5, 2: 2, 1: 1 } as Record<number, number>)[foundPrevious] ?? 0;
    properties.rssi_bonus = bonus;
    properties.rssi_stabilized = properties.rssi + bonus;
  }
}

function updateMasterWithIncrementalBonus(
  newFeatures: PingFeature[],
  masterData: PingFeatureCollection,
): { added: number; updated: number } {
  if (masterData.features.length === 0) {
    masterData.features = newFeatures;
    applyStabilityBonus(masterData.features);
    return { added: newFeatures.length, updated: 0 };
  }

  const latestTime = parseTimestamp(masterData.features.at(-1)?.properties.time ?? new Date().toISOString());
  const bufferLimit = latestTime - LOOKBACK_HOURS * 60 * 60 * 1000;

  const contextBuffer = masterData.features.filter(
    (feature) => parseTimestamp(feature.properties.time) >= bufferLimit,
  );

  const actuallyNew: PingFeature[] = [];
  let updated = 0;

  newFeatures.sort((left, right) => parseTimestamp(left.properties.time) - parseTimestamp(right.properties.time));

  for (const nextFeature of newFeatures) {
    if (nextFeature.geometry.coordinates[0] === 0) {
      continue;
    }

    let foundIndex = -1;
    let exactDuplicate = false;

    for (let index = masterData.features.length - 1; index >= 0; index -= 1) {
      const existingFeature = masterData.features[index];
      const existingProperties = existingFeature.properties;
      const nextProperties = nextFeature.properties;

      if (
        String(existingProperties.boardID) === String(nextProperties.boardID) &&
        String(existingProperties.counter) === String(nextProperties.counter)
      ) {
        const [existingLon, existingLat] = existingFeature.geometry.coordinates;
        const [nextLon, nextLat] = nextFeature.geometry.coordinates;
        const sameGps =
          existingLon.toFixed(6) === nextLon.toFixed(6) && existingLat.toFixed(6) === nextLat.toFixed(6);

        if (sameGps) {
          if (existingProperties.rssi === -1 && nextProperties.rssi !== -1) {
            foundIndex = index;
          } else {
            exactDuplicate = true;
          }
          break;
        }
      }

      const existingTime = parseTimestamp(existingProperties.time);
      if (latestTime - existingTime > 24 * 60 * 60 * 1000) {
        break;
      }
    }

    if (foundIndex !== -1) {
      masterData.features[foundIndex] = nextFeature;
      updated += 1;
    } else if (!exactDuplicate) {
      actuallyNew.push(nextFeature);
    }
  }

  if (actuallyNew.length === 0) {
    if (updated > 0) {
      applyStabilityBonus(masterData.features);
    }

    return { added: 0, updated };
  }

  const processingQueue = [...contextBuffer, ...actuallyNew];
  applyStabilityBonus(processingQueue);
  masterData.features = [...masterData.features, ...actuallyNew].sort(
    (left, right) => parseTimestamp(left.properties.time) - parseTimestamp(right.properties.time),
  );

  return { added: actuallyNew.length, updated };
}

/**
 * Returns the timestamp (ms) of a ping if it already exists in the master
 * collection (matched by boardID + counter + exact GPS), or null otherwise.
 */
function getPingTimeFromMaster(
  masterFeatures: PingFeature[],
  boardID: number | string,
  counter: number,
  longitude: number,
  latitude: number,
): number | null {
  for (let index = masterFeatures.length - 1; index >= 0; index -= 1) {
    const existing = masterFeatures[index];
    const ep = existing.properties;
    const [eLon, eLat] = existing.geometry.coordinates;

    if (
      String(ep.boardID) === String(boardID) &&
      Number(ep.counter) === Number(counter) &&
      eLon.toFixed(6) === longitude.toFixed(6) &&
      eLat.toFixed(6) === latitude.toFixed(6)
    ) {
      return parseTimestamp(ep.time);
    }
  }
  return null;
}

type ParsedLogEntry = {
  /** The current ping at index 0 – always has real RSSI / gateway data */
  currentPing: PingFeature;
  /**
   * Historical pings from indices 1-N of the new payload format.
   * Empty array for old-format payloads.
   * These are Funkloch candidates (rssi=-1, no gateway).
   */
  historicalPings: PingFeature[];
};

/**
 * Parses a single assembled log entry (payload + gateway + gatewayname) into a
 * ParsedLogEntry, handling both the legacy single-ping format and the new
 * multi-ping array format.
 *
 * Legacy format:
 *   payload:{"boardID":0,"breit":52.41,"counter":44,"lang":13.03}
 *
 * New format:
 *   payload:{"boardID":3,"pings":[{"counter":4,"latitude":52.39,"longitude":13.13}, ...]}
 *   Index 0 in the array = current ping (real RSSI), index 1-N = historical Funkloch candidates.
 */
function parseLogEntry(
  payload: Record<string, unknown>,
  gateway: Record<string, unknown>,
  gatewayName: string,
  timestamp: string,
): ParsedLogEntry | null {
  const rssi = Number(gateway.rssi ?? -1);
  const snr = Number(gateway.snr ?? 0);
  const boardID = Number(payload.boardID);

  // ── New multi-ping format ────────────────────────────────────────────────
  if (Array.isArray(payload.pings)) {
    const pings = payload.pings as Array<{
      counter: number;
      latitude: number;
      longitude: number;
    }>;

    if (pings.length === 0) {
      return null;
    }

    const current = pings[0];
    if (!current) return null;

    const currentPing: PingFeature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [Number(current.longitude), Number(current.latitude)] },
      properties: {
        boardID,
        counter: Number(current.counter),
        gateway: gatewayName,
        rssi,
        snr,
        network: "ttn",
        // Time will be adjusted in parseLogToFeatures if Funklöcher are inserted
        time: timestamp,
      },
    };

    const historicalPings: PingFeature[] = pings.slice(1).map((ping) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [Number(ping.longitude), Number(ping.latitude)] },
      properties: {
        boardID,
        counter: Number(ping.counter),
        gateway: "Funkloch-Upload (LoRaWAN)",
        rssi: -1,
        snr: undefined,
        network: "ttn" as const,
        // Placeholder – real time assigned in parseLogToFeatures
        time: timestamp,
      },
    }));

    return { currentPing, historicalPings };
  }

  // ── Legacy single-ping format ────────────────────────────────────────────
  const currentPing: PingFeature = {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [Number(payload.lang), Number(payload.breit)],
    },
    properties: {
      boardID,
      counter: Number(payload.counter),
      gateway: gatewayName,
      rssi,
      snr,
      network: "ttn",
      time: timestamp,
    },
  };

  return { currentPing, historicalPings: [] };
}

/**
 * Parses the raw log text into PingFeatures, supporting both payload formats.
 *
 * For the new multi-ping format:
 * - Historical pings (index 1-N) are inserted as Funklöcher (rssi=-1) only if
 *   they do not already exist in masterFeatures (exact match on boardID +
 *   counter + lon + lat).
 * - If at least one new Funkloch is inserted, the current ping (index 0) gets a
 *   timestamp of (latestFunklochTime + 1s) so it always sorts after them.
 * - If no new Funklöcher are inserted, the current ping keeps its original timestamp.
 *
 * masterFeatures is passed in so we can check the DB without an async call here.
 */
function parseLogToFeatures(
  logText: string,
  limitTimestamp: number | undefined,
  masterFeatures: PingFeature[],
): PingFeature[] {
  const features: PingFeature[] = [];
  const payloadPattern = /^payload:(\{.*\})$/;
  const gatewayPattern = /^gateway:(\{.*\})$/;
  const gatewayNamePattern = /^gatewayname:(.+)$/;

  const lines = logText.split(/\r?\n/);
  let tempPayload: Record<string, unknown> | null = null;
  let tempGateway: Record<string, unknown> | null = null;
  let tempGatewayName: string | null = null;
  const stopAt = limitTimestamp ? limitTimestamp - 7 * 60 * 60 * 1000 : null;

  for (const rawLine of [...lines].reverse()) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const gatewayNameMatch = line.match(gatewayNamePattern);
    if (gatewayNameMatch) {
      tempGatewayName = gatewayNameMatch[1].trim();
    }

    const gatewayMatch = line.match(gatewayPattern);
    if (gatewayMatch) {
      tempGateway = JSON.parse(gatewayMatch[1]) as Record<string, unknown>;
    }

    const payloadMatch = line.match(payloadPattern);
    if (payloadMatch) {
      tempPayload = JSON.parse(payloadMatch[1]) as Record<string, unknown>;
    }

    if (tempPayload && tempGateway && tempGatewayName) {
      const timestamp =
        (tempGateway.time as string | undefined) ??
        (tempGateway.received_at as string | undefined) ??
        new Date().toISOString();
      const currentTime = parseTimestamp(timestamp);

      if (stopAt && currentTime < stopAt) {
        break;
      }

      const entry = parseLogEntry(tempPayload, tempGateway, tempGatewayName, timestamp);

      if (entry) {
        // ── Process historical pings (index 1-N) as Funkloch candidates ──
        // Funklöcher are placed strictly BEFORE the current ping using a
        // descending anchor: anchor starts at currentTime and resets to the
        // existing DB timestamp whenever a ping is found in master.
        let anchor = currentTime;
        let funklochOffset = 0;

        for (const hist of entry.historicalPings) {
          const { boardID, counter } = hist.properties;
          const [lon, lat] = hist.geometry.coordinates;

          // Skip invalid coordinates
          if (lon === 0 && lat === 0) {
            continue;
          }

          // If already in DB: use its timestamp as new anchor, do not add
          const existingTime = getPingTimeFromMaster(masterFeatures, boardID, counter, lon, lat);
          if (existingTime !== null) {
            anchor = existingTime;
            funklochOffset = 0;
            continue;
          }

          // Skip if already queued in this batch
          const alreadyInBatch = features.some((f) => {
            const [fLon, fLat] = f.geometry.coordinates;
            return (
              String(f.properties.boardID) === String(boardID) &&
              Number(f.properties.counter) === Number(counter) &&
              fLon.toFixed(6) === lon.toFixed(6) &&
              fLat.toFixed(6) === lat.toFixed(6)
            );
          });

          if (!alreadyInBatch) {
            funklochOffset += 1;
            features.push({
              ...hist,
              properties: {
                ...hist.properties,
                time: new Date(anchor - funklochOffset * 1000).toISOString(),
              },
            });
          }
        }

        // ── Current ping (index 0) ──
        // Always keeps its original gateway timestamp — the newest in the group.
        features.push({
          ...entry.currentPing,
          properties: {
            ...entry.currentPing.properties,
            time: timestamp,
          },
        });
      }

      tempPayload = null;
      tempGateway = null;
      tempGatewayName = null;
    }
  }

  return features.reverse();
}

export async function getPings(): Promise<{ collection: PingFeatureCollection; summary: PingSummary }> {
  const collection = await loadFeatureCollection();
  return {
    collection,
    summary: summarizeCollection(collection),
  };
}

export async function getPingSummary(): Promise<PingSummary> {
  const collection = await loadFeatureCollection();
  return summarizeCollection(collection);
}

export function runRemoteUpdate(): Promise<UpdateResult> {
  return withCollectionLock(async () => {
  const collection = await loadFeatureCollection();
  const now = Date.now();

  if (now - cacheState.lastLogUpdate < CACHE_DURATION_MS) {
    return {
      status: "cached",
      added: cacheState.lastAddedCount,
      updated: cacheState.lastUpdatedCount,
      total: collection.features.filter((feature) => isValidCoordinate(feature.geometry.coordinates)).length,
      features: collection.features,
    };
  }

  const logUrl = process.env.LORAWAN_LOG_URL ?? null;
  if (!logUrl) {
    new Error("LORAWAN_LOG_URL environment variable is not set")
    return {
      status: "error",
      added: 0,
      updated: 0,
      total: collection.features.length,
      message: "Remote log URL is not configured",
    };
  }
  const response = await fetch(logUrl, { cache: "no-store" });

  if (!response.ok) {
    return {
      status: "error",
      added: 0,
      updated: 0,
      total: collection.features.length,
      message: `Failed to fetch remote log: ${response.status}`,
    };
  }

  let limitTimestamp: number | undefined;
  if (collection.features.length > 0) {
    const latestValid = [...collection.features]
      .reverse()
      .find((feature) => feature.properties.rssi !== -1 && feature.properties.rssi > -129);
    const lastFeature = collection.features.at(-1);
    const absoluteLastTime = lastFeature ? parseTimestamp(lastFeature.properties.time) : undefined;

    if (latestValid && absoluteLastTime) {
      const latestValidTime = parseTimestamp(latestValid.properties.time);
      limitTimestamp = absoluteLastTime - latestValidTime < 60 * 60 * 1000 ? latestValidTime : absoluteLastTime;
    } else {
      limitTimestamp = absoluteLastTime;
    }
  }

  const logText = await response.text();
  // Pass the loaded master features so parseLogToFeatures can deduplicate
  // historical pings without an additional async DB call.
  const nextFeatures = parseLogToFeatures(logText, limitTimestamp, collection.features);
  const { added, updated } = updateMasterWithIncrementalBonus(nextFeatures, collection);

  if (added > 0 || updated > 0) {
    await saveFeatureCollection(collection);
  }

  cacheState.lastLogUpdate = now;
  cacheState.lastAddedCount = added;
  cacheState.lastUpdatedCount = updated;

  return {
    status: "ok",
    added,
    updated,
    total: collection.features.filter((feature) => isValidCoordinate(feature.geometry.coordinates)).length,
  };
  });
}

export function uploadManualPings(features: PingFeature[]): Promise<{ added: number; updated: number }> {
  return withCollectionLock(async () => {
    const collection = await loadFeatureCollection();
    const { added, updated } = updateMasterWithIncrementalBonus(features, collection);

    if (added > 0 || updated > 0) {
      await saveFeatureCollection(collection);
    }

    return { added, updated };
  });
}

export const releaseTimestamp = process.env.RELEASE_TIMESTAMP ? new Date(process.env.RELEASE_TIMESTAMP) : null;
export function isReleased(): boolean {
  if (!releaseTimestamp) {
    return true;
  }
  return Date.now() >= releaseTimestamp.getTime();
}
export function getMillisecondsUntilRelease(): number | null {
  if (!releaseTimestamp) {
    return null;
  }
  const ms = releaseTimestamp.getTime() - Date.now();
  return ms > 0 ? ms : 0;
}