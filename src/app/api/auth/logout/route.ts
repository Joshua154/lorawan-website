import { NextRequest, NextResponse } from "next/server";

import { destroyCurrentSession } from "@/server/auth";
import { signOut } from "@/server/next-auth";
import { ensureTrustedOrigin } from "@/server/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const originError = ensureTrustedOrigin(request);

  if (originError) {
    return originError;
  }

  await destroyCurrentSession();

  try {
    const resp = await signOut();

    if (resp) return resp as NextResponse;
  } catch (err) {
    console.warn("NextAuth signOut failed:", err);
  }

  return NextResponse.json({ status: "ok" });
}