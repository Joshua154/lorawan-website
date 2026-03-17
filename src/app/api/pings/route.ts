import { NextResponse } from "next/server";

import { buildRestrictedHexagons, DEFAULT_HEX_MIN_POINTS, DEFAULT_HEX_SIZE, EMPTY_COLLECTION, filterCollectionByBoards, summarizeCollection } from "@/lib/pings";
import { getCurrentUser } from "@/server/auth";
import { getPings, getNextUpdateInSeconds, isReleased } from "@/server/ping-service";

export const dynamic = "force-dynamic";

// const ALLOWED_HEX_SIZES = new Set([0.0008, 0.0015, 0.0035, 0.007]);
const ALLOWED_HEX_SIZES = new Set([DEFAULT_HEX_SIZE]);
// const ALLOWED_MIN_HEX_POINTS = new Set([1, 5, 10, 25]);
const ALLOWED_MIN_HEX_POINTS = new Set([DEFAULT_HEX_MIN_POINTS]);

function parseHexSize(value: string | null): number {
  const numericValue = Number(value);
  return ALLOWED_HEX_SIZES.has(numericValue) ? numericValue : DEFAULT_HEX_SIZE;
}

function parseMinHexPoints(value: string | null): number {
  const numericValue = Number(value);
  return ALLOWED_MIN_HEX_POINTS.has(numericValue) ? numericValue : DEFAULT_HEX_MIN_POINTS;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const { searchParams } = new URL(request.url);
  const hexSize = parseHexSize(searchParams.get("hexSize"));
  const minHexPoints = parseMinHexPoints(searchParams.get("minHexPoints"));
  const networkParam = searchParams.get("network");
  const guestNetwork = networkParam === "ttn" || networkParam === "chirpstack" ? networkParam : "chirpstack";

  const { collection } = await getPings();

  if (!user) {
    if (!isReleased()) {
      return NextResponse.json({
        accessMode: "guest",
        restrictedHexagons: [],
        summary: summarizeCollection(EMPTY_COLLECTION),
        nextUpdateInSeconds: getNextUpdateInSeconds(),
      });
    }
    
    const guestFeatures = collection.features.filter(
      (f) => (f.properties.network === "chirpstack" ? "chirpstack" : "ttn") === guestNetwork,
    );

    return NextResponse.json({
      accessMode: "guest",
      restrictedHexagons: buildRestrictedHexagons(guestFeatures, { hexSize, minHexPoints }),
      summary: summarizeCollection(EMPTY_COLLECTION),
      nextUpdateInSeconds: getNextUpdateInSeconds(),
    });
  }

  const visibleCollection =
    user.role === "admin" ? collection : filterCollectionByBoards(collection, user.assignedBoardIds);

  return NextResponse.json({ 
    accessMode: "authenticated",
    collection: visibleCollection, 
    summary: summarizeCollection(visibleCollection),
    nextUpdateInSeconds: getNextUpdateInSeconds(),
  });
}
