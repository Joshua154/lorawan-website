import { hashSync } from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import type { PingFeature, UserRole } from "@/lib/types";

const DEFAULT_ADMIN_USERNAME = process.env.LORAWAN_ADMIN_USERNAME?.trim() || "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.LORAWAN_ADMIN_PASSWORD?.trim() || "admin1234";
const MIGRATIONS_DIRECTORY = join(process.cwd(), "src", "server", "migrations");

type MigrationFile = {
  name: string;
  checksum: string;
  sql: string;
};

type MigrationStatusRow = {
  name: string;
  checksum: string;
};

type CountRow = {
  count: string;
};

type BoardIdRow = {
  board_id: string;
};

type IdRow = {
  id: number;
};

type UserPasswordLookupRow = {
  id: number;
  password_hash: string;
  auth_type: "local" | "oauth";
};

type PingCounterTimeRow = {
  counter: string;
  observed_at: Date;
};

export type DbUserRow = {
  id: number;
  username: string;
  role: UserRole;
  created_at: string | Date;
  auth_type: "local" | "oauth";
  oauth_provider: string | null;
  oauth_subject: string | null;
};

export type DbUserWithPasswordRow = DbUserRow & {
  password_hash: string;
};

export type DbSessionUserRow = {
  id: number;
  username: string;
  role: UserRole;
  created_at: string | Date;
  expires_at: string | Date;
  auth_type: "local" | "oauth";
  oauth_provider: string | null;
  oauth_subject: string | null;
};

export type DbPingRow = {
  board_id: string;
  counter: number;
  gateway_name: string | null;
  rssi: number;
  snr: number | null;
  observed_at: string | Date;
  longitude: number;
  latitude: number;
  rssi_stabilized: number | null;
  rssi_bonus: number | null;
  network: string | null;
};

declare global {
  var __lorawanPgPool: Pool | undefined;
  var __lorawanDbReadyPromise: Promise<void> | undefined;
}

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set to use PostgreSQL.");
  }

  return databaseUrl;
}

function getPoolInstance(): Pool {
  if (!globalThis.__lorawanPgPool) {
    globalThis.__lorawanPgPool = new Pool({ connectionString: getDatabaseUrl() });
  }

  return globalThis.__lorawanPgPool;
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function loadMigrationFiles(): Promise<MigrationFile[]> {
  const entries = await readdir(MIGRATIONS_DIRECTORY, { withFileTypes: true });
  const migrationFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const files: MigrationFile[] = [];

  for (const fileName of migrationFiles) {
    const absolutePath = join(MIGRATIONS_DIRECTORY, fileName);
    const sql = await readFile(absolutePath, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");

    files.push({ name: fileName, checksum, sql });
  }

  return files;
}

async function applyMigrations(client: PoolClient): Promise<void> {
  await ensureMigrationTable(client);

  const appliedResult = await client.query<MigrationStatusRow>(
    "SELECT name, checksum FROM schema_migrations ORDER BY name ASC",
  );
  const appliedMigrations = new Map(appliedResult.rows.map((row) => [row.name, row.checksum]));
  const migrationFiles = await loadMigrationFiles();

  for (const migration of migrationFiles) {
    const appliedChecksum = appliedMigrations.get(migration.name);

    if (appliedChecksum) {
      if (appliedChecksum !== migration.checksum) {
        throw new Error(`Migration ${migration.name} has changed after it was applied.`);
      }

      continue;
    }

    await client.query("BEGIN");

    try {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

async function seedDefaultAdmin(client: PoolClient): Promise<void> {
  const { rows } = await client.query<CountRow>(
    "SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin'",
  );

  if (Number(rows[0]?.count ?? 0) > 0) {
    return;
  }

  await client.query(
    "INSERT INTO users (username, password_hash, role, auth_type) VALUES ($1, $2, 'admin', 'local')",
    [DEFAULT_ADMIN_USERNAME, hashSync(DEFAULT_ADMIN_PASSWORD, 12)],
  );
}

async function initializeDatabase(): Promise<void> {
  const client = await getPoolInstance().connect();

  try {
    await applyMigrations(client);
    await client.query("BEGIN");
    await seedDefaultAdmin(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getLocalUserByUsernameOnClient(client: PoolClient, username: string): Promise<DbUserWithPasswordRow | null> {
  const { rows } = await client.query<DbUserWithPasswordRow>(
    `SELECT id, username, password_hash, role, created_at, auth_type, oauth_provider, oauth_subject
     FROM users
     WHERE auth_type = 'local' AND username = $1`,
    [username],
  );

  return rows[0] ?? null;
}

async function getOauthUserByIdentityOnClient(
  client: PoolClient,
  provider: string,
  subject: string,
): Promise<DbUserRow | null> {
  const { rows } = await client.query<DbUserRow>(
    `SELECT id, username, role, created_at, auth_type, oauth_provider, oauth_subject
     FROM users
     WHERE auth_type = 'oauth' AND oauth_provider = $1 AND oauth_subject = $2`,
    [provider, subject],
  );

  return rows[0] ?? null;
}

async function getUserByIdOnClient(client: PoolClient, userId: number): Promise<DbUserWithPasswordRow | null> {
  const { rows } = await client.query<DbUserWithPasswordRow>(
    `SELECT id, username, password_hash, role, created_at, auth_type, oauth_provider, oauth_subject
     FROM users
     WHERE id = $1`,
    [userId],
  );

  return rows[0] ?? null;
}

async function replaceUserBoardsOnClient(client: PoolClient, userId: number, boardIds: string[]): Promise<void> {
  await client.query("DELETE FROM user_boards WHERE user_id = $1", [userId]);

  for (const boardId of boardIds) {
    await client.query("INSERT INTO user_boards (user_id, board_id) VALUES ($1, $2)", [userId, boardId]);
  }
}

async function insertPingRecords(client: PoolClient, records: PingFeature[]): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const chunkSize = 1_000;

  for (let index = 0; index < records.length; index += chunkSize) {
    const chunk = records.slice(index, index + chunkSize);
    const payload = JSON.stringify(chunk.map((feature) => ({
      board_id: String(feature.properties.boardID),
      counter: Number(feature.properties.counter),
      gateway_name: feature.properties.gateway ?? null,
      rssi: Number(feature.properties.rssi),
      snr: feature.properties.snr == null ? null : Number(feature.properties.snr),
      observed_at: feature.properties.time,
      longitude: Number(feature.geometry.coordinates[0]),
      latitude: Number(feature.geometry.coordinates[1]),
      rssi_stabilized: feature.properties.rssi_stabilized == null ? null : Number(feature.properties.rssi_stabilized),
      rssi_bonus: feature.properties.rssi_bonus == null ? null : Number(feature.properties.rssi_bonus),
      network: feature.properties.network === "chirpstack" ? "chirpstack" : null,
    })));

    await client.query(
      `
        INSERT INTO ping_features (
          board_id,
          counter,
          gateway_name,
          rssi,
          snr,
          observed_at,
          longitude,
          latitude,
          rssi_stabilized,
          rssi_bonus,
          network
        )
        SELECT
          entry.board_id,
          entry.counter,
          entry.gateway_name,
          entry.rssi,
          entry.snr,
          entry.observed_at::timestamptz,
          entry.longitude,
          entry.latitude,
          entry.rssi_stabilized,
          entry.rssi_bonus,
          entry.network
        FROM jsonb_to_recordset($1::jsonb) AS entry(
          board_id text,
          counter integer,
          gateway_name text,
          rssi integer,
          snr double precision,
          observed_at text,
          longitude double precision,
          latitude double precision,
          rssi_stabilized integer,
          rssi_bonus integer,
          network text
        )
      `,
      [payload],
    );
  }
}

async function cleanupExpiredSessionsOnClient(client: PoolClient): Promise<void> {
  await client.query("DELETE FROM sessions WHERE expires_at <= $1::timestamptz", [new Date().toISOString()]);
}

function toLegacyPingRecord(feature: PingFeature): PingFeature {
  return feature;
}

export async function ensureDatabaseReady(): Promise<void> {
  if (!globalThis.__lorawanDbReadyPromise) {
    globalThis.__lorawanDbReadyPromise = initializeDatabase();
  }

  await globalThis.__lorawanDbReadyPromise;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  await ensureDatabaseReady();
  return getPoolInstance().query<T>(text, values);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureDatabaseReady();
  const client = await getPoolInstance().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function cleanupExpiredSessions(): Promise<void> {
  await ensureDatabaseReady();
  const client = await getPoolInstance().connect();

  try {
    await cleanupExpiredSessionsOnClient(client);
  } finally {
    client.release();
  }
}

export async function getLocalUserByUsername(username: string): Promise<DbUserWithPasswordRow | null> {
  await ensureDatabaseReady();
  const { rows } = await query<DbUserWithPasswordRow>(
    `SELECT id, username, password_hash, role, created_at, auth_type, oauth_provider, oauth_subject
     FROM users
     WHERE auth_type = 'local' AND username = $1`,
    [username],
  );

  return rows[0] ?? null;
}

export async function getOauthUserByIdentity(provider: string, subject: string): Promise<DbUserRow | null> {
  await ensureDatabaseReady();
  const { rows } = await query<DbUserRow>(
    `SELECT id, username, role, created_at, auth_type, oauth_provider, oauth_subject
     FROM users
     WHERE auth_type = 'oauth' AND oauth_provider = $1 AND oauth_subject = $2`,
    [provider, subject],
  );

  return rows[0] ?? null;
}

export async function upsertOauthUser(
  provider: string,
  subject: string,
  preferredUsername: string,
): Promise<DbUserRow> {
  await ensureDatabaseReady();

  return withTransaction(async (client) => {
    const existing = await getOauthUserByIdentityOnClient(client, provider, subject);

    if (existing) {
      if (preferredUsername && preferredUsername !== existing.username) {
        await client.query("UPDATE users SET username = $1 WHERE id = $2", [preferredUsername, existing.id]);
        existing.username = preferredUsername;
      }

      return existing;
    }

    const createdResult = await client.query<DbUserRow>(
      `
        INSERT INTO users (username, password_hash, role, auth_type, oauth_provider, oauth_subject)
        VALUES ($1, '', 'user', 'oauth', $2, $3)
        RETURNING id, username, role, created_at, auth_type, oauth_provider, oauth_subject
      `,
      [preferredUsername, provider, subject],
    );

    return createdResult.rows[0];
  });
}

export async function getSessionUserBySessionId(sessionId: string, currentTime = new Date()): Promise<DbSessionUserRow | null> {
  await ensureDatabaseReady();
  const { rows } = await query<DbSessionUserRow>(
    `SELECT users.id, users.username, users.role, users.created_at, sessions.expires_at, users.auth_type, users.oauth_provider, users.oauth_subject
     FROM sessions
     INNER JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = $1 AND sessions.expires_at > $2::timestamptz`,
    [sessionId, currentTime.toISOString()],
  );

  return rows[0] ?? null;
}

export async function createSessionRecord(userId: number, expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)): Promise<string> {
  await ensureDatabaseReady();
  const sessionId = randomUUID();

  await query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3::timestamptz)", [
    sessionId,
    userId,
    expiresAt.toISOString(),
  ]);

  return sessionId;
}

export async function deleteSessionRecord(sessionId: string): Promise<void> {
  await ensureDatabaseReady();
  await query("DELETE FROM sessions WHERE id = $1", [sessionId]);
}

export async function getAssignedBoardIds(userId: number): Promise<string[]> {
  await ensureDatabaseReady();
  const { rows } = await query<BoardIdRow>(
    "SELECT board_id FROM user_boards WHERE user_id = $1 ORDER BY board_id ASC",
    [userId],
  );

  return rows.map((row) => String(row.board_id));
}

export async function listManagedUsers(): Promise<DbUserRow[]> {
  await ensureDatabaseReady();
  const { rows } = await query<DbUserRow>(
    "SELECT id, username, role, created_at, auth_type, oauth_provider, oauth_subject FROM users ORDER BY role ASC, username ASC",
  );

  return rows;
}

export async function createManagedUser(
  username: string,
  passwordHash: string,
  role: UserRole,
  assignedBoardIds: string[],
): Promise<DbUserRow> {
  await ensureDatabaseReady();

  return withTransaction(async (client) => {
    const existing = await getLocalUserByUsernameOnClient(client, username);

    if (existing) {
      throw new Error("A user with this username already exists.");
    }

    const createdResult = await client.query<DbUserRow>(
      `
        INSERT INTO users (username, password_hash, role, auth_type)
        VALUES ($1, $2, $3, 'local')
        RETURNING id, username, role, created_at, auth_type, oauth_provider, oauth_subject
      `,
      [username, passwordHash, role],
    );

    await replaceUserBoardsOnClient(client, createdResult.rows[0].id, role === "admin" ? [] : assignedBoardIds);

    return createdResult.rows[0];
  });
}

export async function updateManagedUser(
  userId: number,
  username: string,
  role: UserRole,
  assignedBoardIds: string[],
): Promise<DbUserRow> {
  await ensureDatabaseReady();

  return withTransaction(async (client) => {
    const existing = await getUserByIdOnClient(client, userId);

    if (!existing) {
      throw new Error("User not found.");
    }

    const duplicateResult = await client.query<IdRow>(
      `SELECT id
       FROM users
       WHERE id <> $1 AND username = $2 AND auth_type = $3`,
      [userId, username, existing.auth_type],
    );

    if (duplicateResult.rows[0]) {
      throw new Error("A user with this username already exists.");
    }

    const updatedResult = await client.query<DbUserRow>(
      `UPDATE users
       SET username = $1, role = $2
       WHERE id = $3
       RETURNING id, username, role, created_at, auth_type, oauth_provider, oauth_subject`,
      [username, role, userId],
    );

    await replaceUserBoardsOnClient(client, userId, role === "admin" ? [] : assignedBoardIds);

    return updatedResult.rows[0];
  });
}

export async function deleteManagedUser(userId: number): Promise<void> {
  await ensureDatabaseReady();
  const result = await query<IdRow>("DELETE FROM users WHERE id = $1 RETURNING id", [userId]);

  if (!result.rows[0]) {
    throw new Error("User not found.");
  }
}

export async function getUserPasswordRecordById(userId: number): Promise<Pick<DbUserWithPasswordRow, "id" | "password_hash" | "auth_type"> | null> {
  await ensureDatabaseReady();
  const { rows } = await query<UserPasswordLookupRow>("SELECT id, password_hash, auth_type FROM users WHERE id = $1", [userId]);

  return rows[0] ?? null;
}

export async function updateUserPasswordHash(userId: number, passwordHash: string): Promise<void> {
  await ensureDatabaseReady();
  await query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
}

export async function listPingFeatureRows(): Promise<DbPingRow[]> {
  await ensureDatabaseReady();
  const { rows } = await query<DbPingRow>(
    `SELECT board_id, counter, gateway_name, rssi, snr, observed_at, longitude, latitude, rssi_stabilized, rssi_bonus, network
     FROM ping_features
     ORDER BY observed_at ASC, feature_id ASC`,
  );

  return rows;
}

export async function queryPingTimes(
  boardID: string,
  counters: number[],
  network: "ttn" | "chirpstack",
): Promise<Map<number, number>> {
  await ensureDatabaseReady();

  if (counters.length === 0) {
    return new Map();
  }

  const { rows } = await query<PingCounterTimeRow>(
    `SELECT counter, observed_at FROM ping_features WHERE board_id = $1 AND counter = ANY($2) AND network = $3`,
    [boardID, counters, network],
  );

  const map = new Map<number, number>();

  for (const row of rows) {
    map.set(Number(row.counter), row.observed_at instanceof Date ? row.observed_at.getTime() : Date.parse(String(row.observed_at)));
  }

  return map;
}

export async function replacePingFeatures(features: PingFeature[]): Promise<void> {
  await ensureDatabaseReady();

  await withTransaction(async (client) => {
    await client.query("TRUNCATE TABLE ping_features RESTART IDENTITY");
    await insertPingRecords(client, features.map(toLegacyPingRecord));
  });
}
