// Schema v3 migration (docs/plans/phase8.md D4, critic S5) on a real SQLite (node:sqlite) behind the few SqlStorage calls
// db.ts makes: a new database, a second run (a DO wakes many times), and a v2 database with Phase 7 rows in it.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { emptyProgress, getMeta, migrate, parseAnswers, parsePicks, readProgress, SCHEMA_VERSION, setMeta, writeProgress } from './db.ts';

/** The SqlStorage subset db.ts uses: exec(query, ...bindings) → { toArray(), rowsWritten }. */
function sqlite(): SqlStorage {
  const db = new DatabaseSync(':memory:');
  return {
    exec(query: string, ...b: (string | number | null)[]) {
      const rows = db.prepare(query).all(...b);
      const rowsWritten = Number((db.prepare('SELECT changes() AS n').get() as { n: number }).n);
      return { toArray: () => rows, rowsWritten };
    },
  } as unknown as SqlStorage;
}

/** The v2 step_progress columns (Phase 7 rows as they are in SQLite today). */
const V2_ROW = { team: 't0', step: 'T1', arrived_at: 5, clue_opened_at: 4, task_started_at: null, completed_at: null, branch: null, branch_switches: 0, wrong_answers: 0, penalty_minutes: 0, transport_used: null, bike_distance_m: 0, bike_lost_at_rack: 0, skipped_by: null, submitted_at: null, decided_at: null, decided_by: null, rejections: 0, approval_wait_seconds: 0 };

describe('db schema v3 / v4', () => {
  it('a new database: v2 table + 4 v3 columns + picks (v4) by ALTER; a second migrate changes nothing', () => {
    const sql = sqlite();
    expect(migrate(sql)).toBe(4);
    expect(migrate(sql)).toBe(4); // idempotent (no "duplicate column" in the DO constructor)
    expect(getMeta(sql, 'schema')).toBe(String(SCHEMA_VERSION));
    const cols = sql.exec<{ name: string }>('PRAGMA table_info(step_progress)').toArray().map((c) => c.name);
    expect(cols).toEqual(Object.keys(emptyProgress('', '')));
  });

  it('a v2 database keeps its rows; the new columns read as their defaults', () => {
    const sql = sqlite();
    migrate(sql); // tables as v2 created them …
    for (const c of ['answers', 'locked_until', 'branch_opened_at', 'host_note', 'picks']) sql.exec(`ALTER TABLE step_progress DROP COLUMN ${c}`);
    setMeta(sql, 'schema', '2');
    const keys = Object.keys(V2_ROW);
    sql.exec(`INSERT INTO step_progress (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...(Object.values(V2_ROW) as (string | number | null)[]));
    migrate(sql);
    expect(readProgress(sql)).toEqual([{ ...V2_ROW, answers: '[]', locked_until: null, branch_opened_at: null, host_note: '', picks: '[]' }]);
    expect(getMeta(sql, 'schema')).toBe('4');
  });

  it('a whole row round-trips (an answer = one upsert of the row: 1 row written); answers parse safely', () => {
    const sql = sqlite();
    migrate(sql);
    const row = { ...emptyProgress('t0', 'D1'), branch: 'A', locked_until: 9_000, branch_opened_at: 7_000, host_note: 'đã gọi đội', answers: JSON.stringify([{ id: 1, b: 'A', text: 'bảy', at: 8_000, s: 'pending' }]) };
    expect(writeProgress(sql, row)).toBe(1);
    expect(writeProgress(sql, { ...row, locked_until: null })).toBe(1); // upsert, not delete + insert
    const [back] = readProgress(sql);
    expect(back).toEqual({ ...row, locked_until: null });
    expect(parseAnswers(back)).toEqual([{ id: 1, b: 'A', text: 'bảy', at: 8_000, s: 'pending' }]);
    expect(parseAnswers({ answers: '{oops' })).toEqual([]);
    expect(parseAnswers(undefined)).toEqual([]);
  });

  it('v4: a v3 database (Phase 8 rows) gets picks = [] and keeps its rows; migrating twice is safe; picks round-trip', () => {
    const sql = sqlite();
    migrate(sql);
    sql.exec('ALTER TABLE step_progress DROP COLUMN picks'); // as Phase 8 left it
    setMeta(sql, 'schema', '3');
    const v3 = { ...emptyProgress('t0', 'T1'), answers: JSON.stringify([{ id: 1, b: null, text: 'x', at: 1, s: 'wrong' }]), host_note: 'n' } as Record<string, unknown>;
    delete v3.picks;
    const keys = Object.keys(v3);
    sql.exec(`INSERT INTO step_progress (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...(Object.values(v3) as (string | number | null)[]));
    expect(migrate(sql)).toBe(4);
    expect(migrate(sql)).toBe(4);
    const [back] = readProgress(sql);
    expect(back).toEqual({ ...v3, picks: '[]' });
    expect(writeProgress(sql, { ...back!, picks: JSON.stringify(['art-03', 'art-08']), answers: JSON.stringify([{ id: 1, b: null, text: '2 tác phẩm', at: 5, s: 'wrong', c: 1 }]) })).toBe(1);
    expect(parsePicks(readProgress(sql)[0])).toEqual(['art-03', 'art-08']);
    expect(parseAnswers(readProgress(sql)[0])[0]!.c).toBe(1);
    expect(parsePicks({ picks: '{oops' })).toEqual([]);
    expect(parsePicks({ picks: '[1,"a"]' })).toEqual(['a']);
    expect(parsePicks(undefined)).toEqual([]);
  });
});
