import { NextResponse } from "next/server";

import { getPings } from "@/server/ping-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const { collection, summary } = await getPings();
  return NextResponse.json({ collection, summary });
}
