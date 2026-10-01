// Durable Object SQLite schema (docs/plans/phase6.md §3.5). Rows written are quota (100 000 / day on the Free plan, an
// index row counts too): hot data is batched into single JSON rows, only `events` carries an index (the Host filters by
// team). Phase 7 adds the leg content + step_progress tables here, bumping SCHEMA_VERSION with ALTER / CREATE steps.
export const SCHEMA_VERSION = 1;

const DDL = [
  // key / value: race, status, schema, seed, candidates (JSON), spawning (JSON)…
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  // one row per team; `state` = JSON RaceState (step, bikeId, riding, flags…) so Phase 7 fields need no migration
  'CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, slot INTEGER NOT NULL, name TEXT NOT NULL, colour TEXT NOT NULL, player TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT \'{}\')',
  // last valid poses of ALL teams + the quota counters: ONE row upserted every NET.snapshotMs (SPEC §3, §8.10)
  'CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), t INTEGER NOT NULL, data TEXT NOT NULL)',
  // replay log: all poses, one row per NET.replayMs
  'CREATE TABLE IF NOT EXISTS replay (t INTEGER PRIMARY KEY, data TEXT NOT NULL)',
  // race events (SPEC §6.2 (7), §8.1, §13.9): written at once, before the client is answered
  'CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, team TEXT, type TEXT NOT NULL, data TEXT NOT NULL DEFAULT \'{}\')',
  'CREATE INDEX IF NOT EXISTS events_team ON events (team, t)',
  // shared bikes (SPEC §6.2–6.4): one JSON row each (ServerBike in race/VehicleSpawner.ts)
  'CREATE TABLE IF NOT EXISTS bikes (id TEXT PRIMARY KEY, data TEXT NOT NULL)',
];

// Rows extend Record<string, SqlStorageValue>: sql.exec<T>() requires it.
export interface TeamRow extends Record<string, SqlStorageValue> {
  id: string;
  code: string;
  slot: number;
  name: string;
  colour: string;
  player: string;
  created_at: number;
  state: string;
}

export interface EventRow extends Record<string, SqlStorageValue> {
  id: number;
  t: number;
  team: string | null;
  type: string;
  data: string;
}

/** Creates / upgrades the tables (idempotent) and returns the schema version now in `meta`. */
export function migrate(sql: SqlStorage): number {
  for (const stmt of DDL) sql.exec(stmt);
  const v = Number(getMeta(sql, 'schema') ?? 0);
  // ponytail: versioned ALTERs go here when SCHEMA_VERSION grows (Phase 7); v1 only creates.
  if (v < SCHEMA_VERSION) setMeta(sql, 'schema', String(SCHEMA_VERSION));
  return SCHEMA_VERSION;
}

export function getMeta(sql: SqlStorage, key: string): string | undefined {
  return sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0]?.value;
}

/** 1 row written. */
export function setMeta(sql: SqlStorage, key: string, value: string) {
  sql.exec('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
}

/** 2 rows written (table + the team index). */
export function addEvent(sql: SqlStorage, t: number, team: string | null, type: string, data: unknown = {}) {
  sql.exec('INSERT INTO events (t, team, type, data) VALUES (?, ?, ?, ?)', t, team, type, JSON.stringify(data));
}
