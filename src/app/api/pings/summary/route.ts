import { NextResponse } from "next/server";

import { filterCollectionByBoards, summarizeCollection } from "@/lib/pings";
import { requireAuthenticatedUser } from "@/server/api-auth";
import { getPings } from "@/server/ping-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUser();

  if ("response" in auth) {
    return auth.response;
  }

  const { collection } = await getPings();
  const visibleCollection =
    auth.user.role === "admin" ? collection : filterCollectionByBoards(collection, auth.user.assignedBoardIds);

  return NextResponse.json(summarizeCollection(visibleCollection));
}
