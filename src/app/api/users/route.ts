import { NextRequest, NextResponse } from "next/server";

import type { CreateUserPayload } from "@/lib/types";
import { createUser, getCurrentUser, listUsers } from "@/server/auth";
import { ensureJsonRequest, ensureTrustedOrigin } from "@/server/request-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({ users: listUsers() });
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

  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }

  try {
    const payload = (await request.json()) as CreateUserPayload;
    const createdUser = createUser(payload);
    return NextResponse.json({ user: createdUser }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create user." },
      { status: 400 },
    );
  }
}