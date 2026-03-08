import { NextRequest, NextResponse } from "next/server";

import { destroyCurrentSession } from "@/server/auth";
import { ensureTrustedOrigin } from "@/server/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const originError = ensureTrustedOrigin(request);

  if (originError) {
    return originError;
  }

  await destroyCurrentSession();
  return NextResponse.json({ status: "ok" });
}