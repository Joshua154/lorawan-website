import { NextRequest, NextResponse } from "next/server";

import { ensureJsonRequest, ensureTrustedOrigin } from "@/server/request-security";
import { requireAdminUser } from "@/server/api-auth";
import { listRuntimeConfigEntries, saveRuntimeConfigEntries } from "@/server/runtime-config";

export const dynamic = "force-dynamic";

type UpdateConfigPayload = {
  entries?: Array<{
    key?: string;
    value?: string;
  }>;
};

export async function GET() {
  const auth = await requireAdminUser();

  if ("response" in auth) {
    return auth.response;
  }

  const entries = await listRuntimeConfigEntries();
  return NextResponse.json({ entries });
}

export async function PUT(request: NextRequest) {
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

  try {
    const payload = (await request.json()) as UpdateConfigPayload;
    const entries = payload.entries ?? [];

    if (!Array.isArray(entries)) {
      return NextResponse.json({ message: "Invalid configuration payload." }, { status: 400 });
    }

    await saveRuntimeConfigEntries(
      entries.map((entry) => ({
        key: entry.key?.trim() ?? "",
        value: entry.value ?? "",
      })),
    );

    const nextEntries = await listRuntimeConfigEntries();
    return NextResponse.json({ entries: nextEntries });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update configuration." },
      { status: 400 },
    );
  }
}
