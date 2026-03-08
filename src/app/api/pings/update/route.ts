import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { runRemoteUpdate } from "@/server/ping-service";
import { ensureTrustedOrigin } from "@/server/request-security";

export const dynamic = "force-dynamic";

async function handleUpdate(request: NextRequest) {
  const originError = ensureTrustedOrigin(request);

  if (originError) {
    return originError;
  }

  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ message: "Only admins can refresh the dataset." }, { status: 403 });
  }

  const result = await runRemoteUpdate();
  const status = result.status === "error" ? 500 : 200;
  return NextResponse.json(result, { status });
}

export async function POST(request: NextRequest) {
  return handleUpdate(request);
}
