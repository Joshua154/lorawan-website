import { NextRequest, NextResponse } from "next/server";

import type { UpdateUserPayload } from "@/lib/types";
import { deleteUser, updateUser } from "@/server/auth";
import { badRequestResponse, parsePositiveIntegerParam, requireAdminUser, toMissingEntityStatus } from "@/server/api-auth";
import { ensureJsonRequest, ensureTrustedOrigin } from "@/server/request-security";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const originError = await ensureTrustedOrigin(request);

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

  const params = await context.params;
  const userId = parsePositiveIntegerParam(params.id);

  if (userId == null) {
    return badRequestResponse("Invalid user id.");
  }

  try {
    const payload = (await request.json()) as UpdateUserPayload;
    const user = await updateUser(auth.user.id, userId, payload);
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user.";
    const status = toMissingEntityStatus(message);
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const originError = await ensureTrustedOrigin(request);

  if (originError) {
    return originError;
  }

  const auth = await requireAdminUser();

  if ("response" in auth) {
    return auth.response;
  }

  const params = await context.params;
  const userId = parsePositiveIntegerParam(params.id);

  if (userId == null) {
    return badRequestResponse("Invalid user id.");
  }

  try {
    await deleteUser(auth.user.id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete user.";
    const status = toMissingEntityStatus(message);
    return NextResponse.json({ message }, { status });
  }
}