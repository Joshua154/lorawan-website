import { NextRequest, NextResponse } from "next/server";
import { getRuntimeConfigValue } from "@/server/runtime-config";

async function getExpectedOrigin(request: NextRequest): Promise<string> {
  const configuredOrigin = (await getRuntimeConfigValue("APP_URL")) ?? (await getRuntimeConfigValue("NEXT_PUBLIC_APP_URL"));

  if (configuredOrigin) {
    return new URL(configuredOrigin).origin;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (!host) {
    return request.nextUrl.origin;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const fallbackProtocol = request.nextUrl.protocol.replace(":", "") || "https";
  const protocol = forwardedProto ?? fallbackProtocol;
  return `${protocol}://${host}`;
}

export async function ensureTrustedOrigin(request: NextRequest): Promise<NextResponse | null> {
  const origin = request.headers.get("origin");

  if (!origin) {
    return NextResponse.json({ message: "Missing Origin header." }, { status: 403 });
  }

  if (origin !== await getExpectedOrigin(request)) {
    return NextResponse.json({ message: "Untrusted request origin." }, { status: 403 });
  }

  return null;
}

export function ensureJsonRequest(request: NextRequest): NextResponse | null {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ message: "Expected application/json request body." }, { status: 415 });
  }

  return null;
}