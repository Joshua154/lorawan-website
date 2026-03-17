import type {
  CalculationMode,
  PingFeature,
  PingFeatureCollection,
  PingSummary,
  RestrictedHexagon,
  SignalCategory,
  StabilityCategory,
} from "@/lib/types";

export const SIGNAL_COLORS: Record<SignalCategory, string> = {
  good: "#2e7d32",
  medium: "#f59e0b",
  bad: "#dc2626",
  deadzone: "#111827",
};

export const HEXAGON_SIZES = {
  "small": 0.0008,
  "medium": 0.0015,
  "large": 0.0035,
  "xlarge": 0.007,
}

export const AUTO_REFRESH_SECONDS = 59;
export const DEFAULT_HEX_SIZE = HEXAGON_SIZES.medium;
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

export function buildRestrictedHexagons(
  features: PingFeature[],
  {
    hexSize,
    minHexPoints,
    calculationMode = "stabilized",
  }: { hexSize: number; minHexPoints: number; calculationMode?: CalculationMode },
): RestrictedHexagon[] {
  const aspect = 0.61;
  const dx = hexSize * Math.sqrt(3);
  const dy = hexSize * 1.5 * aspect;
  const bins = new Map<string, { points: PingFeature[]; center: [number, number] }>();

  for (const feature of features) {
    if (!isValidCoordinate(feature.geometry.coordinates)) {
      continue;
    }

    const [longitude, latitude] = feature.geometry.coordinates;
    const row = Math.round(latitude / dy);
    const offset = row % 2 === 0 ? 0 : dx / 2;
    const col = Math.round((longitude - offset) / dx);
    const key = `${col},${row}`;

    if (!bins.has(key)) {
      bins.set(key, { points: [], center: [row * dy, col * dx + offset] });
    }

    bins.get(key)?.points.push(feature);
  }

  const hexagons: RestrictedHexagon[] = [];

  for (const [, bin] of bins) {
    if (bin.points.length < minHexPoints) {
      continue;
    }

    let red = 0;
    let green = 0;
    let blue = 0;
    let totalWeight = 0;

    const bestRssi = Math.max(
      ...bin.points.map((feature) => {
        const value =
          calculationMode === "stabilized"
            ? feature.properties.rssi_stabilized ?? feature.properties.rssi
            : feature.properties.rssi;

        return value === -1 ? -130 : value;
      }),
    );

    for (const feature of bin.points) {
      const weightedRssi =
        calculationMode === "stabilized"
          ? (feature.properties.rssi_stabilized ?? feature.properties.rssi)
          : feature.properties.rssi;
      const safeWeightedRssi = weightedRssi === -1 ? -130 : weightedRssi;
      const category = getSignalCategory(
        feature.properties.rssi,
        calculationMode === "stabilized" ? feature.properties.rssi_stabilized : undefined,
      );
      const color = getSignalColor(category);
      const weight = safeWeightedRssi === bestRssi ? 5 : 1;
      totalWeight += weight;

      if (color === "#2e7d32") {
        red += 46 * weight;
        green += 125 * weight;
        blue += 50 * weight;
      } else if (color === "#f59e0b") {
        red += 245 * weight;
        green += 158 * weight;
        blue += 11 * weight;
      } else if (color === "#dc2626") {
        red += 220 * weight;
        green += 38 * weight;
        blue += 38 * weight;
      }
    }

    const corners: [number, number][] = [];
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI / 3) * index + Math.PI / 6;
      corners.push([
        bin.center[0] + hexSize * Math.sin(angle) * aspect,
        bin.center[1] + hexSize * Math.cos(angle),
      ]);
    }

    hexagons.push({
      corners,
      avg: +((bin.points.reduce((sum, feature) => {
        const value =
          calculationMode === "stabilized"
            ? feature.properties.rssi_stabilized ?? feature.properties.rssi
            : feature.properties.rssi;

        return sum + (value === -1 ? -130 : value);
      }, 0) / bin.points.length) || 0).toFixed(0),
      fillColor: `rgb(${Math.round(red / totalWeight || 0)}, ${Math.round(green / totalWeight || 0)}, ${Math.round(blue / totalWeight || 0)})`,
    });
  }

  return hexagons;
}
