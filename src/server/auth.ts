import { compareSync, hashSync } from "bcryptjs";
import { cookies } from "next/headers";

import type { CreateUserPayload, ManagedUser, SessionUser, UserRole } from "@/lib/types";
import { getDatabase } from "@/server/database";

const SESSION_COOKIE_NAME = "lorawan_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14;

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
  auth_type: "local" | "oauth";
  oauth_provider: string | null;
  oauth_subject: string | null;
};

type SessionLookupRow = {
  id: number;
  username: string;
  role: UserRole;
  created_at: string;
  expires_at: string;
  auth_type: "local" | "oauth";
  oauth_provider: string | null;
  oauth_subject: string | null;
};

function normalizeBoardIds(boardIds: string[]): string[] {
  return [...new Set(boardIds.map((boardId) => boardId.trim()).filter(Boolean))].sort((left, right) => {
    const leftNumber = Number(left);
    const rightNumber = Number(right);

    if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
      return leftNumber - rightNumber;
    }

    return left.localeCompare(right);
  });
}

function getAssignedBoardIds(userId: number): string[] {
  const database = getDatabase();
  const rows = database
    .prepare("SELECT board_id FROM user_boards WHERE user_id = ? ORDER BY board_id ASC")
    .all(userId) as Array<{ board_id: string }>;

  return rows.map((row) => String(row.board_id));
}

function mapUser(row: Pick<UserRow, "id" | "username" | "role" | "created_at" | "auth_type" | "oauth_provider" | "oauth_subject">): ManagedUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
    assignedBoardIds: row.role === "admin" ? [] : getAssignedBoardIds(row.id),
    auth_type: row.auth_type,
    oauth_provider: row.oauth_provider,
    oauth_subject: row.oauth_subject,
  };
}

function toSessionUser(user: ManagedUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    assignedBoardIds: user.assignedBoardIds,
  };
}

function cleanupExpiredSessions(): void {
  getDatabase().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
}

function validateNewUserPayload(payload: CreateUserPayload): { role: UserRole; assignedBoardIds: string[] } {
  const username = payload.username.trim();
  const password = payload.password.trim();
  const role = payload.role;
  const assignedBoardIds = normalizeBoardIds(payload.assignedBoardIds);

  if (username.length < 3) {
    throw new Error("Username must contain at least 3 characters.");
  }

  if (password.length < 6) {
    throw new Error("Password must contain at least 6 characters.");
  }

  if (role !== "admin" && role !== "user") {
    throw new Error("Invalid role.");
  }

  if (role === "user" && assignedBoardIds.length === 0) {
    throw new Error("Regular users need at least one assigned board.");
  }

  return {
    role,
    assignedBoardIds: role === "admin" ? [] : assignedBoardIds,
  };
}

import { auth } from "./next-auth";

type ExternalSessionUser = {
  id?: string;
  provider?: string;
  email?: string | null;
  name?: string | null;
};

function getPreferredExternalUsername(user: ExternalSessionUser, provider: string, subject: string): string {
  return user.name?.trim() || user.email?.trim() || `${provider}:${subject}`;
}

function upsertOauthUser(provider: string, subject: string, preferredUsername: string): SessionUser {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT id, username, role, created_at, auth_type, oauth_provider, oauth_subject
       FROM users
       WHERE auth_type = 'oauth' AND oauth_provider = ? AND oauth_subject = ?`,
    )
    .get(provider, subject) as Pick<UserRow, "id" | "username" | "role" | "created_at" | "auth_type" | "oauth_provider" | "oauth_subject"> | undefined;

  if (row) {
    if (preferredUsername && preferredUsername !== row.username) {
      database.prepare("UPDATE users SET username = ? WHERE id = ?").run(preferredUsername, row.id);
      row.username = preferredUsername;
    }

    return toSessionUser(mapUser(row));
  }

  const result = database
    .prepare(
      `INSERT INTO users (username, password_hash, role, auth_type, oauth_provider, oauth_subject)
       VALUES (?, '', 'user', 'oauth', ?, ?)`,
    )
    .run(preferredUsername, provider, subject);

  const userId = Number(result.lastInsertRowid);
  const created = database
    .prepare("SELECT id, username, role, created_at, auth_type, oauth_provider, oauth_subject FROM users WHERE id = ?")
    .get(userId) as Pick<UserRow, "id" | "username" | "role" | "created_at" | "auth_type" | "oauth_provider" | "oauth_subject">;

  return toSessionUser(mapUser(created));
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  // Check NextAuth session
  const nextSession = await auth();
  if (nextSession?.user) {
    const userObj = nextSession.user as ExternalSessionUser;
    const provider = userObj.provider?.trim();
    const subject = userObj.id?.trim();

    if (provider && subject) {
      return upsertOauthUser(provider, subject, getPreferredExternalUsername(userObj, provider, subject));
    }
  }

  // Fallback to traditional local session cookie
  cleanupExpiredSessions();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  const row = getDatabase()
    .prepare(
      `SELECT users.id, users.username, users.role, users.created_at, sessions.expires_at, users.auth_type, users.oauth_provider, users.oauth_subject
       FROM sessions
       INNER JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > ?`,
    )
    .get(sessionId, new Date().toISOString()) as SessionLookupRow | undefined;

  if (!row) {
    return null;
  }

  return toSessionUser(mapUser(row));
}

export function authenticateUser(username: string, password: string): SessionUser | null {
  cleanupExpiredSessions();
  const normalizedUsername = username.trim();
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT id, username, password_hash, role, created_at, auth_type, oauth_provider, oauth_subject
       FROM users
       WHERE auth_type = 'local' AND username = ?`,
    )
    .get(normalizedUsername) as UserRow | undefined;

  if (!row || !compareSync(password, row.password_hash)) {
    return null;
  }

  return toSessionUser(mapUser(row));
}

export async function createSession(userId: number): Promise<void> {
  cleanupExpiredSessions();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  getDatabase()
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .run(sessionId, userId, expiresAt.toISOString());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    getDatabase().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export function listUsers(): ManagedUser[] {
  const rows = getDatabase()
    .prepare("SELECT id, username, role, created_at, auth_type, oauth_provider, oauth_subject FROM users ORDER BY role ASC, username ASC")
    .all() as Array<Pick<UserRow, "id" | "username" | "role" | "created_at" | "auth_type" | "oauth_provider" | "oauth_subject">>;

  return rows.map(mapUser);
}

export function createUser(payload: CreateUserPayload): ManagedUser {
  const username = payload.username.trim();
  const password = payload.password.trim();
  const { role, assignedBoardIds } = validateNewUserPayload(payload);
  const database = getDatabase();

  const existing = database
    .prepare("SELECT id FROM users WHERE auth_type = 'local' AND username = ?")
    .get(username) as
    | { id: number }
    | undefined;

  if (existing) {
    throw new Error("A user with this username already exists.");
  }

  const insertUser = database.prepare(
    "INSERT INTO users (username, password_hash, role, auth_type) VALUES (?, ?, ?, ?)",
  );
  const insertBoard = database.prepare("INSERT INTO user_boards (user_id, board_id) VALUES (?, ?)");

  const transaction = database.transaction(() => {
    const result = insertUser.run(username, hashSync(password, 12), role, "local");
    const userId = Number(result.lastInsertRowid);

    for (const boardId of assignedBoardIds) {
      insertBoard.run(userId, boardId);
    }

    const created = database
      .prepare("SELECT id, username, role, created_at, auth_type, oauth_provider, oauth_subject FROM users WHERE id = ?")
      .get(userId) as Pick<UserRow, "id" | "username" | "role" | "created_at" | "auth_type" | "oauth_provider" | "oauth_subject">;

    return mapUser(created);
  });

  return transaction();
}