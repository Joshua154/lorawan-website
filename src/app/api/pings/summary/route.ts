import { NextResponse } from "next/server";

import { getPingSummary } from "@/server/ping-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await getPingSummary();
  return NextResponse.json(summary);
}
