// src/lib/storage.ts
// Profile storage: PostgreSQL when DATABASE_URL is set, JSON files otherwise.

import fs   from "fs";
import path from "path";
import crypto from "crypto";

// ── helpers ────────────────────────────────────────────────────────────────

function hashKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

export function generateApiKey(): string {
  return "ak_" + crypto.randomBytes(24).toString("hex");
}

// ── PostgreSQL pool (lazy-initialised) ────────────────────────────────────

import type { Pool as PgPool } from "pg";
let pool: PgPool | null = null;

async function getPool(): Promise<PgPool> {
  if (!pool) {
    const { Pool } = await import("pg");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        key_hash   TEXT PRIMARY KEY,
        data       JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }
  return pool;
}

// ── File-system fallback ───────────────────────────────────────────────────

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function profilePath(hash: string): string {
  return path.join(DATA_DIR, `${hash}.json`);
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function saveProfile(
  apiKey: string,
  profile: Record<string, unknown>,
): Promise<void> {
  const hash = hashKey(apiKey);
  if (process.env.DATABASE_URL) {
    const db = await getPool();
    await db.query(
      `INSERT INTO profiles (key_hash, data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key_hash) DO UPDATE
         SET data = $2::jsonb, updated_at = NOW()`,
      [hash, JSON.stringify(profile)],
    );
  } else {
    fs.writeFileSync(profilePath(hash), JSON.stringify(profile, null, 2), "utf-8");
  }
}

export async function loadProfile(
  apiKey: string,
): Promise<Record<string, unknown> | null> {
  const hash = hashKey(apiKey);
  if (process.env.DATABASE_URL) {
    const db = await getPool();
    const { rows } = await db.query(
      "SELECT data FROM profiles WHERE key_hash = $1",
      [hash],
    );
    return rows.length ? (rows[0].data as Record<string, unknown>) : null;
  } else {
    const p = profilePath(hash);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  }
}

export async function registerKey(apiKey: string): Promise<void> {
  const existing = await loadProfile(apiKey);
  if (!existing) await saveProfile(apiKey, { _registered: true });
}

export async function keyExists(apiKey: string): Promise<boolean> {
  return (await loadProfile(apiKey)) !== null;
}
