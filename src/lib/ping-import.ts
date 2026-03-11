import { buildFeatureKey } from "@/lib/pings";
import type { PingFeature } from "@/lib/types";

function isImportCoordinate(longitude: number, latitude: number): boolean {
  return parsedLatitudeInRange(latitude) && parsedLongitudeInRange(longitude);
}

function parsedLatitudeInRange(latitude: number): boolean {
  return latitude > 52 && latitude < 53;
}

function parsedLongitudeInRange(longitude: number): boolean {
  return longitude > 12 && longitude < 14;
}

function detectBoardId(lines: string[]): number {
  for (const line of lines) {
    if (line.startsWith("BoardID:")) {
      return Number(line.split(":")[1]);
    }
  }

  return 0;
}

export function extractManualPings(
  data: string,
  existingFeatures: PingFeature[],
  offlineGatewayLabel: string,
): PingFeature[] {
  const lines = data.split("\n");
  const detectedBoardId = detectBoardId(lines);
  const existingKeys = new Set(existingFeatures.map(buildFeatureKey));
  const timestamp = new Date().toISOString();
  const extractedPings: PingFeature[] = [];

  for (const line of lines) {
    if (!line.includes(";") || line.includes("Counter")) {
      continue;
    }

    const [counter, longitude, latitude] = line.trim().split(";");
    const parsedCounter = Number(counter);
    const parsedLongitude = Number(longitude);
    const parsedLatitude = Number(latitude);

    if (!isImportCoordinate(parsedLongitude, parsedLatitude)) {
      continue;
    }

    const nextFeature: PingFeature = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [parsedLongitude, parsedLatitude],
      },
      properties: {
        boardID: detectedBoardId,
        counter: parsedCounter,
        time: timestamp,
        rssi: -1,
        gateway: offlineGatewayLabel,
      },
    };

    const featureKey = buildFeatureKey(nextFeature);

    if (existingKeys.has(featureKey)) {
      continue;
    }

    existingKeys.add(featureKey);
    extractedPings.push(nextFeature);
  }

  return extractedPings;
}