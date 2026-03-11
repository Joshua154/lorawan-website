import { compareSync, hashSync } from "bcryptjs";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";

import type { CreateUserPayload, ManagedUser, SessionUser, UpdateUserPayload, UserRole } from "@/lib/types";
import { normalizeBoardIds } from "@/lib/users";
import { query, withTransaction } from "@/server/database";

const SESSION_COOKIE_NAME = "lorawan_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14;

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
  created_at: string | Date;
  auth_type: "local" | "oauth";
  oauth_provider: string | null;
  oauth_subject: string | null;
};

type SessionLookupRow = {
  id: number;
  username: string;
  role: UserRole;
  created_at: string | Date;
  expires_at: string | Date;
  auth_type: "local" | "oauth";
  oauth_provider: string | null;
  oauth_subject: string | null;
};

type BoardRow = {
  board_id: string;
};

type QueryableClient = {
  query: PoolClient["query"];
};

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function getAssignedBoardIds(userId: number, client?: QueryableClient): Promise<string[]> {
  const executor = client ?? { query };
  const { rows } = await executor.query<BoardRow>("SELECT board_id FROM user_boards WHERE user_id = $1 ORDER BY board_id ASC", [userId]);

  return rows.map((row) => String(row.board_id));
}

async function mapUser(
  row: Pick<UserRow, "id" | "username" | "role" | "created_at" | "auth_type" | "oauth_provider" | "oauth_subject">,
  client?: QueryableClient,
): Promise<ManagedUser> {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: toIsoString(row.created_at),
    assignedBoardIds: row.role === "admin" ? [] : await getAssignedBoardIds(row.id, client),
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

async function cleanupExpiredSessions(): Promise<void> {
  await query("DELETE FROM sessions WHERE expires_at <= $1::timestamptz", [new Date().toISOString()]);
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

function validateManagedUserPayload(payload: UpdateUserPayload): { username: string; role: UserRole; assignedBoardIds: string[] } {
  const username = payload.username.trim();
  const role = payload.role;
  const assignedBoardIds = normalizeBoardIds(payload.assignedBoardIds);

  if (username.length < 3) {
    throw new Error("Username must contain at least 3 characters.");
  }

  if (role !== "admin" && role !== "user") {
    throw new Error("Invalid role.");
  }

  if (role === "user" && assignedBoardIds.length === 0) {
    throw new Error("Regular users need at least one assigned board.");
  }

  return {
    username,
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

async function upsertOauthUser(provider: string, subject: string, preferredUsername: string): Promise<SessionUser> {
  const { rows } = await query<Pick<UserRow, "id" | "username" | "role" | "created_at" | "auth_type" | "oauth_provider" | "oauth_subject">>(
    `SELECT id, username, role, created_at, auth_type, oauth_provider, oauth_subject
     FROM users
     WHERE auth_type = 'oauth' AND oauth_provider = $1 AND oauth_subject = $2`,
    [provider, subject],
  );
  const row = rows[0];

  if (row) {
    if (preferredUsername && preferredUsername !== row.username) {
      await query("UPDATE users SET username = $1 WHERE id = $2", [preferredUsername, row.id]);
      row.username = preferredUsername;
    }

    return toSessionUser(await mapUser(row));
  }

  const createdResult = await query<Pick<UserRow, "id" | "username" | "role" | "created_at" | "auth_type" | "oauth_provider" | "oauth_subject">>(
    `
      INSERT INTO users (username, password_hash, role, auth_type, oauth_provider, oauth_subject)
      VALUES ($1, '', 'user', 'oauth', $2, $3)
      RETURNING id, username, role, created_at, auth_type, oauth_provider, oauth_subject
    `,
    [preferredUsername, provider, subject],
  );

  return toSessionUser(await mapUser(createdResult.rows[0]));
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
  await cleanupExpiredSessions();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  const { rows } = await query<SessionLookupRow>(
    `SELECT users.id, users.username, users.role, users.created_at, sessions.expires_at, users.auth_type, users.oauth_provider, users.oauth_subject
     FROM sessions
     INNER JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = $1 AND sessions.expires_at > $2::timestamptz`,
    [sessionId, new Date().toISOString()],
  );
  const row = rows[0];

  if (!row) {
    return null;
  }

  return toSessionUser(await mapUser(row));
}

export async function authenticateUser(username: string, password: string): Promise<SessionUser | null> {
  await cleanupExpiredSessions();
  const normalizedUsername = username.trim();
  const { rows } = await query<UserRow>(
    `SELECT id, username, password_hash, role, created_at, auth_type, oauth_provider, oauth_subject
     FROM users
     WHERE auth_type = 'local' AND username = $1`,
    [normalizedUsername],
  );
  const row = rows[0];

  if (!row || !compareSync(password, row.password_hash)) {
    return null;
  }

  return toSessionUser(await mapUser(row));
}

export async function createSession(userId: number): Promise<void> {
  await cleanupExpiredSessions();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3::timestamptz)", [
    sessionId,
    userId,
    expiresAt.toISOString(),
  ]);

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
    await query("DELETE FROM sessions WHERE id = $1", [sessionId]);
  }

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function listUsers(): Promise<ManagedUser[]> {
  const { rows } = await query<Pick<UserRow, "id" | "username" | "role" | "created_at" | "auth_type" | "oauth_provider" | "oauth_subject">>(
    "SELECT id, username, role, created_at, auth_type, oauth_provider, oauth_subject FROM users ORDER BY role ASC, username ASC",
  );

  return Promise.all(rows.map((row) => mapUser(row)));
}

export async function createUser(payload: CreateUserPayload): Promise<ManagedUser> {
  const username = payload.username.trim();
  const password = payload.password.trim();
  const { role, assignedBoardIds } = validateNewUserPayload(payload);
  const existingResult = await query<{ id: number }>(
    "SELECT id FROM users WHERE auth_type = 'local' AND username = $1",
    [username],
  );
  const existing = existingResult.rows[0];

  if (existing) {
    throw new Error("A user with this username already exists.");
  }

  return withTransaction(async (client) => {
    const createdResult = await client.query<Pick<UserRow, "id" | "username" | "role" | "created_at" | "auth_type" | "oauth_provider" | "oauth_subject">>(
      `
        INSERT INTO users (username, password_hash, role, auth_type)
        VALUES ($1, $2, $3, 'local')
        RETURNING id, username, role, created_at, auth_type, oauth_provider, oauth_subject
      `,
      [username, hashSync(password, 12), role],
    );
    const created = createdResult.rows[0];

    for (const boardId of assignedBoardIds) {
      await client.query("INSERT INTO user_boards (user_id, board_id) VALUES ($1, $2)", [created.id, boardId]);
    }

    return mapUser(created, client);
  });
}

export async function updateUser(actorId: number, userId: number, payload: UpdateUserPayload): Promise<ManagedUser> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Invalid user id.");
  }

  const { username, role, assignedBoardIds } = validateManagedUserPayload(payload);

  if (actorId === userId && role !== "admin") {
    throw new Error("You cannot remove your own admin access.");
  }

  return withTransaction(async (client) => {
    const existingResult = await client.query<Pick<UserRow, "id" | "username" | "role" | "created_at" | "auth_type" | "oauth_provider" | "oauth_subject">>(
      `SELECT id, username, role, created_at, auth_type, oauth_provider, oauth_subject
       FROM users
       WHERE id = $1`,
      [userId],
    );
    const existing = existingResult.rows[0];

    if (!existing) {
      throw new Error("User not found.");
    }

    const duplicateResult = await client.query<{ id: number }>(
      `SELECT id
       FROM users
       WHERE id <> $1 AND username = $2 AND auth_type = $3`,
      [userId, username, existing.auth_type],
    );

    if (duplicateResult.rows[0]) {
      throw new Error("A user with this username already exists.");
    }

    const updatedResult = await client.query<Pick<UserRow, "id" | "username" | "role" | "created_at" | "auth_type" | "oauth_provider" | "oauth_subject">>(
      `UPDATE users
       SET username = $1, role = $2
       WHERE id = $3
       RETURNING id, username, role, created_at, auth_type, oauth_provider, oauth_subject`,
      [username, role, userId],
    );

    await client.query("DELETE FROM user_boards WHERE user_id = $1", [userId]);

    for (const boardId of assignedBoardIds) {
      await client.query("INSERT INTO user_boards (user_id, board_id) VALUES ($1, $2)", [userId, boardId]);
    }

    return mapUser(updatedResult.rows[0], client);
  });
}

export async function deleteUser(actorId: number, userId: number): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Invalid user id.");
  }

  if (actorId === userId) {
    throw new Error("You cannot delete your own account.");
  }

  const result = await query<{ id: number }>("DELETE FROM users WHERE id = $1 RETURNING id", [userId]);

  if (!result.rows[0]) {
    throw new Error("User not found.");
  }
}