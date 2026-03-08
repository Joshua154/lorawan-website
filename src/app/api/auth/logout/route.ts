import { NextResponse } from "next/server";

import { destroyCurrentSession } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await destroyCurrentSession();
  return NextResponse.json({ status: "ok" });
}