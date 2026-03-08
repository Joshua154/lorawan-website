import { NextResponse } from "next/server";

import { runRemoteUpdate } from "@/server/ping-service";

export const dynamic = "force-dynamic";

async function handleUpdate() {
  const result = await runRemoteUpdate();
  const status = result.status === "error" ? 500 : 200;
  return NextResponse.json(result, { status });
}

export async function GET() {
  return handleUpdate();
}

export async function POST() {
  return handleUpdate();
}
