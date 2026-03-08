import { NextResponse } from "next/server";

import { authenticateUser, createSession } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json()) as { username?: string; password?: string };
  const username = payload.username?.trim() ?? "";
  const password = payload.password ?? "";

  if (!username || !password) {
    return NextResponse.json({ message: "Username and password are required." }, { status: 400 });
  }

  const user = authenticateUser(username, password);

  if (!user) {
    return NextResponse.json({ message: "Invalid username or password." }, { status: 401 });
  }

  await createSession(user.id);

  return NextResponse.json({ user });
}