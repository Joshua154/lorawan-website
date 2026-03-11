import { NextRequest, NextResponse } from "next/server";

import type { PingFeature } from "@/lib/types";
import { requireAuthenticatedUser } from "@/server/api-auth";
import { uploadManualPings } from "@/server/ping-service";
import { ensureJsonRequest, ensureTrustedOrigin } from "@/server/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const originError = ensureTrustedOrigin(request);

  if (originError) {
    return originError;
  }

  const jsonError = ensureJsonRequest(request);

  if (jsonError) {
    return jsonError;
  }

  const auth = await requireAuthenticatedUser();

  if ("response" in auth) {
    return auth.response;
  }

  // if (user.role !== "admin") {
  //   return NextResponse.json({ message: "Only admins can import board dumps." }, { status: 403 });
  // }

  const payload = (await request.json()) as PingFeature[];
  const result = await uploadManualPings(payload);
  return NextResponse.json({ status: "ok", ...result });
}
