import { NextRequest, NextResponse } from "next/server";

import type { UpdateUserPayload } from "@/lib/types";
import { deleteUser, getCurrentUser, updateUser } from "@/server/auth";
import { ensureJsonRequest, ensureTrustedOrigin } from "@/server/request-security";

export const dynamic = "force-dynamic";

function parseUserId(value: string): number | null {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const originError = ensureTrustedOrigin(request);

  if (originError) {
    return originError;
  }

  const jsonError = ensureJsonRequest(request);

  if (jsonError) {
    return jsonError;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  if (currentUser.role !== "admin") {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const userId = parseUserId(params.id);

  if (userId == null) {
    return NextResponse.json({ message: "Invalid user id." }, { status: 400 });
  }

  try {
    const payload = (await request.json()) as UpdateUserPayload;
    const user = await updateUser(currentUser.id, userId, payload);
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user.";
    const status = message === "User not found." ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const originError = ensureTrustedOrigin(request);

  if (originError) {
    return originError;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  if (currentUser.role !== "admin") {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const userId = parseUserId(params.id);

  if (userId == null) {
    return NextResponse.json({ message: "Invalid user id." }, { status: 400 });
  }

  try {
    await deleteUser(currentUser.id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete user.";
    const status = message === "User not found." ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}