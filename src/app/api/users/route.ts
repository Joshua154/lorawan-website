import { NextRequest, NextResponse } from "next/server";

import type { CreateUserPayload } from "@/lib/types";
import { createUser, listUsers } from "@/server/auth";
import { requireAdminUser } from "@/server/api-auth";
import { ensureJsonRequest, ensureTrustedOrigin } from "@/server/request-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminUser();

  if ("response" in auth) {
    return auth.response;
  }

  return NextResponse.json({ users: await listUsers() });
}

export async function POST(request: NextRequest) {
  const originError = ensureTrustedOrigin(request);

  if (originError) {
    return originError;
  }

  const jsonError = ensureJsonRequest(request);

  if (jsonError) {
    return jsonError;
  }

  const auth = await requireAdminUser();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const payload = (await request.json()) as CreateUserPayload;
    const createdUser = await createUser(payload);
    return NextResponse.json({ user: createdUser }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create user." },
      { status: 400 },
    );
  }
}