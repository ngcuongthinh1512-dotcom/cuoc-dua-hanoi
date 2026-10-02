// Durable Object SQLite schema (docs/plans/phase6.md §3.5, docs/plans/phase7.md §5.4). Rows written are quota (100 000 /
// day on the Free plan, an index row counts too): hot data is batched into single JSON rows, only `events` carries an
// index (the Host filters by team). v2 (Phase 7): step_progress (one row per team × step, WITHOUT ROWID on its primary
// key = 1 row written per upsert); the loaded leg lives in meta ('leg' JSON, 'legId'); the new team fields (startAt,
// startOrder, finishAt, penalty…) live in teams.state JSON, so no ALTER. v3 (Phase 8, docs/plans/phase8.md D4): four
// step_progress columns by ALTER (answers JSON, locked_until, branch_opened_at, host_note); no new table. v4 (Phase 8B,
// docs/plans/phase8b.md §D): step_progress.picks by ALTER (the louvre picks of the last lock; live picks: engine memory +
// the snapshot row).
import type { AnswerStatus } from '@race/shared/protocol';

export const SCHEMA_VERSION = 4;

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
  // v2 – SPEC §8.1 step_progress: every column of the spec now (Phase 8–10 fill the rest), timestamps = server ms UTC.
  // Keep this the v2 column list: v3 columns come by ALTER (V3_COLUMNS) for new and v2 databases alike (critic S5: a
  // column here AND in an ALTER = "duplicate column" thrown in the DO constructor, every request dead).
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
  // v3 (Phase 8)
  /** JSON AnswerRec[] (every answer of this step, all branches; read with parseAnswers). One answer = this row's upsert. */
  answers: string;
  /** server ms a retry ("Phạt") / branch-switch countdown ends; null = none. Compared with now on read (no timer). */
  locked_until: number | null;
  /** detour: server ms the chosen branch's box was opened (its task started); null = not yet / switched away. */
  branch_opened_at: number | null;
  /** The Host's note on this step (never sent to the team). */
  host_note: string;
  // v4 (Phase 8B)
  /** JSON string[]: a louvre step's lit artwork ids, written ONLY with a lock (a pick lives in the engine's row cache + the
   *  snapshot row; read with parsePicks). '[]' elsewhere. */
  picks: string;
}

/** One answer in step_progress.answers (docs/plans/phase8.md D4): id = 1, 2… within the step; b = the detour branch it
 *  was for (kept after a switch: the Host sees it, the team's card lists only its current branch's); d / n = the Host's
 *  decision time / note. */
export interface AnswerRec {
  id: number;
  b: string | null;
  text: string;
  at: number;
  s: AnswerStatus;
  d?: number;
  n?: string;
  /** Phase 8B: a louvre lock, right ones among the picks (the card shows it only for locks past correctAtMinutes). */
  c?: number;
}

/** step_progress.picks → artwork ids ([] for '' / a broken value). */
export function parsePicks(row: Pick<StepProgressRow, 'picks'> | undefined): string[] {
  try {
    const v = JSON.parse(row?.picks || '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** step_progress.answers → records ([] for '' / a broken value: never throws in the DO). */
export function parseAnswers(row: Pick<StepProgressRow, 'answers'> | undefined): AnswerRec[] {
  try {
    const v = JSON.parse(row?.answers || '[]') as unknown;
    return Array.isArray(v) ? (v as AnswerRec[]) : [];
  } catch {
    return [];
  }
}

export const emptyProgress = (team: string, step: string): StepProgressRow => ({
  team, step, arrived_at: null, clue_opened_at: null, task_started_at: null, completed_at: null, branch: null, branch_switches: 0,
  wrong_answers: 0, penalty_minutes: 0, transport_used: null, bike_distance_m: 0, bike_lost_at_rack: 0, skipped_by: null,
  submitted_at: null, decided_at: null, decided_by: null, rejections: 0, approval_wait_seconds: 0,
  answers: '[]', locked_until: null, branch_opened_at: null, host_note: '', picks: '[]',
});

/** v3 columns (name, definition), added by ALTER in migrate. */
const V3_COLUMNS = [
  ['answers', "TEXT NOT NULL DEFAULT '[]'"],
  ['locked_until', 'INTEGER'],
  ['branch_opened_at', 'INTEGER'],
  ['host_note', "TEXT NOT NULL DEFAULT ''"],
] as const;

/** ALTER TABLE … ADD COLUMN unless the column is there (idempotent: a migrate cut half-way runs again safely). */
function addColumn(sql: SqlStorage, table: string, name: string, def: string) {
  if (sql.exec<{ name: string }>(`PRAGMA table_info(${table})`).toArray().some((c) => c.name === name)) return;
  sql.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
}

/** Every step_progress row (read once by the engine, then kept in memory and patched on write). */
export const readProgress = (sql: SqlStorage) => sql.exec<StepProgressRow>('SELECT * FROM step_progress').toArray();

const PROGRESS_COLS = Object.keys(emptyProgress('', ''));
/** Upsert of the whole row (WITHOUT ROWID, no other index). ON CONFLICT DO UPDATE, not INSERT OR REPLACE: a REPLACE is
 *  a delete + insert and Cloudflare bills deletes as rows written. Returns the rows SQLite says it wrote (add them to
 *  counters.rows: the budget test measures, it does not trust our own count). */
export function writeProgress(sql: SqlStorage, r: StepProgressRow): number {
  const cur = sql.exec(
    `INSERT INTO step_progress (${PROGRESS_COLS.join(', ')}) VALUES (${PROGRESS_COLS.map(() => '?').join(', ')})
     ON CONFLICT (team, step) DO UPDATE SET ${PROGRESS_COLS.slice(2).map((c) => `${c} = excluded.${c}`).join(', ')}`,
    ...PROGRESS_COLS.map((c) => r[c] ?? null),
  );
  cur.toArray();
  return cur.rowsWritten;
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
  // v1 → v2 only creates a table (in DDL); versioned ALTERs below.
  if (v < 3) for (const [name, def] of V3_COLUMNS) addColumn(sql, 'step_progress', name, def);
  if (v < 4) addColumn(sql, 'step_progress', 'picks', "TEXT NOT NULL DEFAULT '[]'");
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
