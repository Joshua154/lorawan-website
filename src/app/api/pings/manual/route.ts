import { NextResponse } from "next/server";

import type { PingFeature } from "@/lib/types";
import { uploadManualPings } from "@/server/ping-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json()) as PingFeature[];
  const result = await uploadManualPings(payload);
  return NextResponse.json({ status: "ok", ...result });
}
