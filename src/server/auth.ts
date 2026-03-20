import { compareSync, hashSync } from "bcryptjs";
import { cookies } from "next/headers";

import type {
  CreateUserPayload,
  ManagedUser,
  SessionUser,
  UpdateUserPayload,
  UserRole,
} from "@/lib/types";
import { normalizeBoardIds } from "@/lib/users";
import { auth } from "./next-auth";
import {
  cleanupExpiredSessions,
  createManagedUser,
  createSessionRecord,
  deleteManagedUser,
  deleteSessionRecord,
  getAssignedBoardIds,
  getLocalUserByUsername,
  getSessionUserBySessionId,
  getUserPasswordRecordById,
  listManagedUsers,
  type DbUserRow,
  updateManagedUser,
  updateUserPasswordHash,
  upsertOauthUser,
} from "@/server/database";

const SESSION_COOKIE_NAME = "lorawan_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14;
const DEFAULT_ADMIN_ROLE_KEYCLOAK = "lorawan-admin";

type UserRow = DbUserRow;

type ExternalSessionUser = {
  id?: string;
  provider?: string;
  email?: string | null;
  name?: string | null;
  roles?: string[];
};

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function getAssignedBoardsForUser(userId: number, role: UserRole): Promise<string[]> {
  if (role === "admin") {
    return [];
  }

  return getAssignedBoardIds(userId);
}

async function mapUser(row: UserRow): Promise<ManagedUser> {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: toIsoString(row.created_at),
    assignedBoardIds: await getAssignedBoardsForUser(row.id, row.role),
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

function getPreferredExternalUsername(user: ExternalSessionUser, provider: string, subject: string): string {
  return user.name?.trim() || user.email?.trim() || `${provider}:${subject}`;
}

async function upsertOauthUserForSession(provider: string, subject: string, preferredUsername: string, isAdmin: boolean = false): Promise<SessionUser> {
  const row = await upsertOauthUser(provider, subject, preferredUsername, isAdmin);
  return toSessionUser(await mapUser(row));
}

async function getCurrentLocalSessionUser(sessionId: string): Promise<SessionUser | null> {
  const row = await getSessionUserBySessionId(sessionId);

  if (!row) {
    return null;
  }

  return toSessionUser(await mapUser(row));
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

function validatePassword(password: string): string {
  const trimmedPassword = password.trim();

  if (trimmedPassword.length < 6) {
    throw new Error("Password must contain at least 6 characters.");
  }

  return trimmedPassword;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const nextSession = await auth();

  if (nextSession?.user) {
    const userObj = nextSession.user as ExternalSessionUser;
    const provider = userObj.provider?.trim();
    const subject = userObj.id?.trim();

    if (provider && subject) {
      const adminRole = process.env.KEYCLOAK_ADMIN_ROLE || DEFAULT_ADMIN_ROLE_KEYCLOAK;
      const isAdmin = userObj.roles?.includes(adminRole) ?? false;
      return upsertOauthUserForSession(provider, subject, getPreferredExternalUsername(userObj, provider, subject), isAdmin);
    }
  }

  await cleanupExpiredSessions();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  return getCurrentLocalSessionUser(sessionId);
}

export async function authenticateUser(username: string, password: string): Promise<SessionUser | null> {
  await cleanupExpiredSessions();
  const normalizedUsername = username.trim();
  const row = await getLocalUserByUsername(normalizedUsername);

  if (!row || !compareSync(password, row.password_hash)) {
    return null;
  }

  return toSessionUser(await mapUser(row));
}

export async function createSession(userId: number): Promise<void> {
  await cleanupExpiredSessions();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const sessionId = await createSessionRecord(userId, expiresAt);

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
    await deleteSessionRecord(sessionId);
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
  const rows = await listManagedUsers();
  return Promise.all(rows.map((row) => mapUser(row)));
}

export async function createUser(payload: CreateUserPayload): Promise<ManagedUser> {
  const username = payload.username.trim();
  const password = payload.password.trim();
  const { role, assignedBoardIds } = validateNewUserPayload(payload);

  const created = await createManagedUser(username, hashSync(password, 12), role, assignedBoardIds);
  return mapUser(created);
}

export async function updateUser(actorId: number, userId: number, payload: UpdateUserPayload): Promise<ManagedUser> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Invalid user id.");
  }

  const { username, role, assignedBoardIds } = validateManagedUserPayload(payload);

  if (actorId === userId && role !== "admin") {
    throw new Error("You cannot remove your own admin access.");
  }

  const updated = await updateManagedUser(userId, username, role, assignedBoardIds);
  return mapUser(updated);
}

export async function deleteUser(actorId: number, userId: number): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Invalid user id.");
  }

  if (actorId === userId) {
    throw new Error("You cannot delete your own account.");
  }

  await deleteManagedUser(userId);
}

export async function updateUserPasswordByAdmin(actorId: number, userId: number, password: string): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Invalid user id.");
  }

  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new Error("Invalid actor id.");
  }

  const nextPassword = validatePassword(password);
  const user = await getUserPasswordRecordById(userId);

  if (!user) {
    throw new Error("User not found.");
  }

  if (user.auth_type !== "local") {
    throw new Error("OAuth users do not have a local password.");
  }

  await updateUserPasswordHash(userId, hashSync(nextPassword, 12));
}

export async function changeOwnPassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Invalid user id.");
  }

  const normalizedCurrentPassword = currentPassword.trim();

  if (!normalizedCurrentPassword) {
    throw new Error("Current password is required.");
  }

  const validatedNewPassword = validatePassword(newPassword);

  if (normalizedCurrentPassword === validatedNewPassword) {
    throw new Error("New password must be different from current password.");
  }

  const user = await getUserPasswordRecordById(userId);

  if (!user) {
    throw new Error("User not found.");
  }

  if (user.auth_type !== "local") {
    throw new Error("OAuth users do not have a local password.");
  }

  if (!compareSync(normalizedCurrentPassword, user.password_hash)) {
    throw new Error("Current password is incorrect.");
  }

  await updateUserPasswordHash(userId, hashSync(validatedNewPassword, 12));
}