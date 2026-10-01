// Durable Object SQLite schema (docs/plans/phase6.md §3.5, docs/plans/phase7.md §5.4). Rows written are quota (100 000 /
// day on the Free plan, an index row counts too): hot data is batched into single JSON rows, only `events` carries an
// index (the Host filters by team). v2 (Phase 7): step_progress (one row per team × step, WITHOUT ROWID on its primary
// key = 1 row written per upsert); the loaded leg lives in meta ('leg' JSON, 'legId'); the new team fields (startAt,
// startOrder, finishAt, penalty…) live in teams.state JSON, so no ALTER.
export const SCHEMA_VERSION = 2;

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
  // v2 – SPEC §8.1 step_progress: every column of the spec now (Phase 8–10 fill the rest), timestamps = server ms UTC
  'CREATE TABLE IF NOT EXISTS step_progress (team TEXT NOT NULL, step TEXT NOT NULL, ' +
    'arrived_at INTEGER, clue_opened_at INTEGER, task_started_at INTEGER, completed_at INTEGER, branch TEXT, ' +
    'branch_switches INTEGER NOT NULL DEFAULT 0, wrong_answers INTEGER NOT NULL DEFAULT 0, penalty_minutes REAL NOT NULL DEFAULT 0, ' +
    'transport_used TEXT, bike_distance_m REAL NOT NULL DEFAULT 0, bike_lost_at_rack INTEGER NOT NULL DEFAULT 0, skipped_by TEXT, ' +
    'submitted_at INTEGER, decided_at INTEGER, decided_by TEXT, rejections INTEGER NOT NULL DEFAULT 0, ' +
    'approval_wait_seconds REAL NOT NULL DEFAULT 0, PRIMARY KEY (team, step)) WITHOUT ROWID',
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

/** One step of one team (SPEC §8.1). clue_opened_at = when the team got this step's clue (the previous step's completion;
 *  step 1: its start time, else its first entry). */
export interface StepProgressRow extends Record<string, SqlStorageValue> {
  team: string;
  step: string;
  arrived_at: number | null;
  clue_opened_at: number | null;
  task_started_at: number | null;
  completed_at: number | null;
  branch: string | null;
  branch_switches: number;
  wrong_answers: number;
  penalty_minutes: number;
  transport_used: string | null;
  bike_distance_m: number;
  bike_lost_at_rack: number;
  skipped_by: string | null;
  submitted_at: number | null;
  decided_at: number | null;
  decided_by: string | null;
  rejections: number;
  approval_wait_seconds: number;
}

export const emptyProgress = (team: string, step: string): StepProgressRow => ({
  team, step, arrived_at: null, clue_opened_at: null, task_started_at: null, completed_at: null, branch: null, branch_switches: 0,
  wrong_answers: 0, penalty_minutes: 0, transport_used: null, bike_distance_m: 0, bike_lost_at_rack: 0, skipped_by: null,
  submitted_at: null, decided_at: null, decided_by: null, rejections: 0, approval_wait_seconds: 0,
});

/** Every step_progress row (read once by the engine, then kept in memory and patched on write). */
export const readProgress = (sql: SqlStorage) => sql.exec<StepProgressRow>('SELECT * FROM step_progress').toArray();

const PROGRESS_COLS = Object.keys(emptyProgress('', ''));
/** Upsert of the whole row: 1 row written (WITHOUT ROWID, no other index). */
export function writeProgress(sql: SqlStorage, r: StepProgressRow) {
  sql.exec(
    `INSERT OR REPLACE INTO step_progress (${PROGRESS_COLS.join(', ')}) VALUES (${PROGRESS_COLS.map(() => '?').join(', ')})`,
    ...PROGRESS_COLS.map((c) => r[c] ?? null),
  );
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
  // v1 → v2 only creates a table (in DDL); versioned ALTERs go here when a later version changes existing tables.
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
