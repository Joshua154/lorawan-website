import { NextResponse } from "next/server";

import type { SessionUser } from "@/lib/types";
import { getCurrentUser } from "@/server/auth";

type AuthenticatedUserResult =
  | { user: SessionUser; response?: never }
  | { user?: never; response: NextResponse };

export function unauthorizedResponse(message = "Unauthorized.") {
  return NextResponse.json({ message }, { status: 401 });
}

export function forbiddenResponse(message = "Forbidden.") {
  return NextResponse.json({ message }, { status: 403 });
}

export function badRequestResponse(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUserResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { response: unauthorizedResponse() };
  }

  return { user };
}

export async function requireAdminUser(): Promise<AuthenticatedUserResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { response: unauthorizedResponse() };
  }

  if (currentUser.role !== "admin") {
    return { response: forbiddenResponse() };
  }

  return { user: currentUser };
}

export function parsePositiveIntegerParam(value: string): number | null {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function toMissingEntityStatus(message: string) {
  return message === "User not found." ? 404 : 400;
}