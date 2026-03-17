import { NextRequest, NextResponse } from "next/server";

import type { AdminPasswordUpdatePayload } from "@/lib/types";
import { badRequestResponse, parsePositiveIntegerParam, requireAdminUser, toMissingEntityStatus } from "@/server/api-auth";
import { updateUserPasswordByAdmin } from "@/server/auth";
import { ensureJsonRequest, ensureTrustedOrigin } from "@/server/request-security";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

  const params = await context.params;
  const userId = parsePositiveIntegerParam(params.id);

  if (userId == null) {
    return badRequestResponse("Invalid user id.");
  }

  try {
    const payload = (await request.json()) as AdminPasswordUpdatePayload;

    if (!payload.password) {
      return badRequestResponse("Password is required.");
    }

    await updateUserPasswordByAdmin(auth.user.id, userId, payload.password);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update password.";
    const status = toMissingEntityStatus(message);
    return NextResponse.json({ message }, { status });
  }
}