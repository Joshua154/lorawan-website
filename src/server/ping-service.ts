import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { EMPTY_COLLECTION, isValidCoordinate, summarizeCollection } from "@/lib/pings";
import type { PingFeature, PingFeatureCollection, PingSummary, UpdateResult } from "@/lib/types";

const CACHE_DURATION_MS = 30_000;
const LOOKBACK_HOURS = 6;
const DEFAULT_LOG_URL = "http://stadtrandelfen.dsmynas.org:8008/test/2026_gps.log";
const APP_DATA_DIR = path.join(process.cwd(), "data");
const APP_DATA_FILE = path.join(APP_DATA_DIR, "pings.geojson");
const LEGACY_DATA_FILE = path.join(process.cwd(), "old", "data", "pings.geojson");

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

async function ensureDataFile(): Promise<void> {
  await mkdir(APP_DATA_DIR, { recursive: true });

  try {
    await readFile(APP_DATA_FILE, "utf8");
  } catch {
    try {
      await copyFile(LEGACY_DATA_FILE, APP_DATA_FILE);
    } catch {
      await writeFile(APP_DATA_FILE, JSON.stringify(EMPTY_COLLECTION, null, 2));
    }
  }
}

export async function loadFeatureCollection(): Promise<PingFeatureCollection> {
  await ensureDataFile();
  const raw = await readFile(APP_DATA_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw) as PingFeatureCollection;
    return parsed?.type === "FeatureCollection" && Array.isArray(parsed.features)
      ? parsed
      : EMPTY_COLLECTION;
  } catch {
    return EMPTY_COLLECTION;
  }
}

async function saveFeatureCollection(collection: PingFeatureCollection): Promise<void> {
  await ensureDataFile();
  await writeFile(APP_DATA_FILE, JSON.stringify(collection, null, 2));
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

function parseLogToFeatures(logText: string, limitTimestamp?: number): PingFeature[] {
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

      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [Number(tempPayload.lang), Number(tempPayload.breit)],
        },
        properties: {
          boardID: Number(tempPayload.boardID),
          counter: Number(tempPayload.counter),
          gateway: tempGatewayName,
          rssi: Number(tempGateway.rssi ?? -1),
          snr: Number(tempGateway.snr ?? 0),
          time: timestamp,
        },
      });

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

export async function runRemoteUpdate(): Promise<UpdateResult> {
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

  const logUrl = process.env.LORAWAN_LOG_URL ?? DEFAULT_LOG_URL;
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
  const nextFeatures = parseLogToFeatures(logText, limitTimestamp);
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
}

export async function uploadManualPings(features: PingFeature[]): Promise<{ added: number; updated: number }> {
  const collection = await loadFeatureCollection();
  const { added, updated } = updateMasterWithIncrementalBonus(features, collection);

  if (added > 0 || updated > 0) {
    await saveFeatureCollection(collection);
  }

  return { added, updated };
}
