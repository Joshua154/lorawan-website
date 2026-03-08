import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { runRemoteUpdate } from "@/server/ping-service";

export const dynamic = "force-dynamic";

async function handleUpdate() {
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

export async function GET() {
  return handleUpdate();
}

export async function POST() {
  return handleUpdate();
}
