import { NextResponse } from "next/server";

import { filterCollectionByBoards, summarizeCollection } from "@/lib/pings";
import { getCurrentUser } from "@/server/auth";
import { getPings } from "@/server/ping-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { collection } = await getPings();
  const visibleCollection =
    user.role === "admin" ? collection : filterCollectionByBoards(collection, user.assignedBoardIds);

  return NextResponse.json({ collection: visibleCollection, summary: summarizeCollection(visibleCollection) });
}
