import { mkdirSync } from "node:fs";
import path from "node:path";

import { hashSync } from "bcryptjs";
import Database from "better-sqlite3";

const DATA_DIRECTORY = path.join(process.cwd(), "data");
const DATABASE_FILE = path.join(DATA_DIRECTORY, "lorawan-auth.db");
const DEFAULT_ADMIN_USERNAME = process.env.LORAWAN_ADMIN_USERNAME?.trim() || "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.LORAWAN_ADMIN_PASSWORD?.trim() || "admin1234";

declare global {
  var __lorawanDatabase: Database.Database | undefined;
}

function createTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      auth_type TEXT NOT NULL CHECK (auth_type IN ('local', 'oauth')) DEFAULT 'local',
      oauth_provider TEXT,
      oauth_subject TEXT,
      CHECK (
        (auth_type = 'local' AND oauth_provider IS NULL AND oauth_subject IS NULL) OR
        (auth_type = 'oauth' AND oauth_provider IS NOT NULL AND oauth_subject IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS user_boards (
      user_id INTEGER NOT NULL,
      board_id TEXT NOT NULL,
      PRIMARY KEY (user_id, board_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_local_username
      ON users (username)
      WHERE auth_type = 'local';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth_identity
      ON users (oauth_provider, oauth_subject)
      WHERE auth_type = 'oauth';

    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
    CREATE INDEX IF NOT EXISTS idx_user_boards_user_id ON user_boards (user_id);
  `);
}

function migrateLegacySchema(database: Database.Database): void {
  const userColumns = database
    .prepare("PRAGMA table_info(users)")
    .all() as Array<{ name: string }>;

  if (userColumns.length === 0) {
    createTables(database);
    return;
  }

  const columnNames = new Set(userColumns.map((column) => column.name));
  const hasModernSchema =
    columnNames.has("auth_type") && columnNames.has("oauth_provider") && columnNames.has("oauth_subject");

  if (hasModernSchema) {
    createTables(database);
    return;
  }

  database.exec("PRAGMA foreign_keys = OFF");

  const migrate = database.transaction(() => {
    database.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        auth_type TEXT NOT NULL CHECK (auth_type IN ('local', 'oauth')) DEFAULT 'local',
        oauth_provider TEXT,
        oauth_subject TEXT,
        CHECK (
          (auth_type = 'local' AND oauth_provider IS NULL AND oauth_subject IS NULL) OR
          (auth_type = 'oauth' AND oauth_provider IS NOT NULL AND oauth_subject IS NOT NULL)
        )
      );

      INSERT INTO users_new (id, username, password_hash, role, created_at, auth_type, oauth_provider, oauth_subject)
      SELECT
        id,
        username,
        CASE WHEN type = 'local' THEN password_hash ELSE '' END,
        role,
        created_at,
        CASE WHEN type = 'local' THEN 'local' ELSE 'oauth' END,
        CASE WHEN type = 'local' THEN NULL ELSE type END,
        CASE WHEN type = 'local' THEN NULL ELSE username END
      FROM users;

      CREATE TABLE user_boards_new (
        user_id INTEGER NOT NULL,
        board_id TEXT NOT NULL,
        PRIMARY KEY (user_id, board_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      INSERT INTO user_boards_new (user_id, board_id)
      SELECT user_id, board_id FROM user_boards;

      CREATE TABLE sessions_new (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      INSERT INTO sessions_new (id, user_id, expires_at, created_at)
      SELECT id, user_id, expires_at, created_at FROM sessions;

      DROP TABLE sessions;
      DROP TABLE user_boards;
      DROP TABLE users;

      ALTER TABLE users_new RENAME TO users;
      ALTER TABLE user_boards_new RENAME TO user_boards;
      ALTER TABLE sessions_new RENAME TO sessions;
    `);
  });

  try {
    migrate();
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }

  createTables(database);
}

function initializeDatabase(database: Database.Database): void {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  migrateLegacySchema(database);

  const adminCount = database
    .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
    .get() as { count: number };

  if (adminCount.count > 0) {
    return;
  }

  database
    .prepare("INSERT INTO users (username, password_hash, role, auth_type) VALUES (?, ?, 'admin', 'local')")
    .run(DEFAULT_ADMIN_USERNAME, hashSync(DEFAULT_ADMIN_PASSWORD, 12));
}

export function getDatabase(): Database.Database {
  if (!globalThis.__lorawanDatabase) {
    mkdirSync(DATA_DIRECTORY, { recursive: true });
    const database = new Database(DATABASE_FILE);
    initializeDatabase(database);
    globalThis.__lorawanDatabase = database;
  }

  return globalThis.__lorawanDatabase;
}