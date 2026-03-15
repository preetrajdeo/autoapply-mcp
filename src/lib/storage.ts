// src/lib/storage.ts
// Simple JSON-file profile storage, keyed by API key.
// On Railway, store the data dir in a persistent volume at /data.

import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function profilePath(apiKey: string): string {
  // Hash the key so we don't store raw credentials on disk
  const hash = crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  return path.join(DATA_DIR, `${hash}.json`);
}

export function saveProfile(apiKey: string, profile: Record<string, unknown>): void {
  fs.writeFileSync(profilePath(apiKey), JSON.stringify(profile, null, 2), "utf-8");
}

export function loadProfile(apiKey: string): Record<string, unknown> | null {
  const p = profilePath(apiKey);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

/** Generate a new random API key */
export function generateApiKey(): string {
  return "ak_" + crypto.randomBytes(24).toString("hex");
}

/** Simple key registration — stores a placeholder so we know the key is valid */
export function registerKey(apiKey: string): void {
  const p = profilePath(apiKey);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify({ _registered: true }, null, 2));
  }
}

export function keyExists(apiKey: string): boolean {
  return fs.existsSync(profilePath(apiKey));
}
