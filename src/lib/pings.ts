import type {
  PingFeature,
  PingFeatureCollection,
  PingSummary,
  SignalCategory,
  StabilityCategory,
} from "@/lib/types";

export const SIGNAL_COLORS: Record<SignalCategory, string> = {
  good: "#2e7d32",
  medium: "#f59e0b",
  bad: "#dc2626",
  deadzone: "#111827",
};

export const AUTO_REFRESH_SECONDS = 59;
export const DEFAULT_HEX_SIZE = 0.0008;
export const DEFAULT_HEX_MIN_POINTS = 1;
export const EMPTY_COLLECTION: PingFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function parsePingTime(value: string): number {
  return Date.parse(value);
}

export function isValidCoordinate([longitude, latitude]: [number, number]): boolean {
  return !(longitude === 0 && latitude === 0);
}

export function getSignalCategory(rssi: number, stabilized?: number): SignalCategory {
  const effectiveRssi = stabilized ?? rssi;

  if (rssi === -1 || effectiveRssi <= -129) {
    return "deadzone";
  }

  if (effectiveRssi > -90) {
    return "good";
  }

  if (effectiveRssi > -110) {
    return "medium";
  }

  return "bad";
}

export function getSignalColor(category: SignalCategory): string {
  return SIGNAL_COLORS[category];
}

export function getStabilityCategory(bonus = 0): StabilityCategory {
  if (bonus === 15) {
    return "stable";
  }

  if (bonus >= 5) {
    return "good";
  }

  if (bonus >= 1) {
    return "unregular";
  }

  return "0";
}

export function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function sortFeatures(features: PingFeature[]): PingFeature[] {
  return [...features].sort(
    (left, right) => parsePingTime(left.properties.time) - parsePingTime(right.properties.time),
  );
}

export function buildFeatureKey(feature: PingFeature): string {
  const [longitude, latitude] = feature.geometry.coordinates;
  return [
    String(feature.properties.boardID),
    String(feature.properties.counter),
    longitude.toFixed(6),
    latitude.toFixed(6),
  ].join(":");
}

export function filterCollectionByBoards(
  collection: PingFeatureCollection,
  allowedBoardIds: string[],
): PingFeatureCollection {
  const allowedBoards = new Set(allowedBoardIds.map(String));

  return {
    ...collection,
    features: collection.features.filter((feature) => allowedBoards.has(String(feature.properties.boardID))),
  };
}

export function summarizeCollection(collection: PingFeatureCollection): PingSummary {
  const boardCounts: Record<string, number> = {};
  const gatewayCounts: Record<string, number> = {};
  const sorted = sortFeatures(collection.features);

  for (const feature of sorted) {
    const boardId = String(feature.properties.boardID);
    const gateway = feature.properties.gateway ?? "Offline-Import (Flash)";
    boardCounts[boardId] = (boardCounts[boardId] ?? 0) + 1;
    gatewayCounts[gateway] = (gatewayCounts[gateway] ?? 0) + 1;
  }

  const validFeatures = sorted.filter((feature) => isValidCoordinate(feature.geometry.coordinates)).length;

  return {
    totalFeatures: sorted.length,
    validFeatures,
    boardCounts,
    gatewayCounts,
    earliestTimestamp: sorted[0]?.properties.time ?? null,
    latestTimestamp: sorted.at(-1)?.properties.time ?? null,
  };
}
