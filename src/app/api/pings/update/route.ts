import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/server/api-auth";
import { runRemoteUpdate } from "@/server/ping-service";
import { ensureTrustedOrigin } from "@/server/request-security";

export const dynamic = "force-dynamic";

async function handleUpdate(request: NextRequest) {
  const originError = ensureTrustedOrigin(request);

  if (originError) {
    return originError;
  }

  const auth = await requireAuthenticatedUser();

  if ("response" in auth) {
    return auth.response;
  }

  const result = await runRemoteUpdate();
  const status = result.status === "error" ? 500 : 200;
  return NextResponse.json(result, { status });
}

export async function POST(request: NextRequest) {
  return handleUpdate(request);
}
