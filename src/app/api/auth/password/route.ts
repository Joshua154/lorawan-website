import { NextRequest, NextResponse } from "next/server";

import type { ChangeOwnPasswordPayload } from "@/lib/types";
import { badRequestResponse, requireAuthenticatedUser, toMissingEntityStatus } from "@/server/api-auth";
import { changeOwnPassword } from "@/server/auth";
import { ensureJsonRequest, ensureTrustedOrigin } from "@/server/request-security";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const originError = ensureTrustedOrigin(request);

  if (originError) {
    return originError;
  }

  const jsonError = ensureJsonRequest(request);

  if (jsonError) {
    return jsonError;
  }

  const auth = await requireAuthenticatedUser();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const payload = (await request.json()) as ChangeOwnPasswordPayload;

    if (!payload.currentPassword || !payload.newPassword) {
      return badRequestResponse("Current password and new password are required.");
    }

    await changeOwnPassword(auth.user.id, payload.currentPassword, payload.newPassword);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to change password.";
    return NextResponse.json({ message }, { status: toMissingEntityStatus(message) });
  }
}