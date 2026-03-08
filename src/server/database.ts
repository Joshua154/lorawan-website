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

function initializeDatabase(database: Database.Database): void {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
    CREATE INDEX IF NOT EXISTS idx_user_boards_user_id ON user_boards (user_id);
  `);

  const adminCount = database
    .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
    .get() as { count: number };

  if (adminCount.count > 0) {
    return;
  }

  database
    .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')")
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