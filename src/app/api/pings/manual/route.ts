import { NextResponse } from "next/server";

import type { PingFeature } from "@/lib/types";
import { getCurrentUser } from "@/server/auth";
import { uploadManualPings } from "@/server/ping-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ message: "Only admins can import board dumps." }, { status: 403 });
  }

  const payload = (await request.json()) as PingFeature[];
  const result = await uploadManualPings(payload);
  return NextResponse.json({ status: "ok", ...result });
}
