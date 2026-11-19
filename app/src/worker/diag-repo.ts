import { db, migrate } from "flingit";

export interface DiagRepo {
  /** Stores a report and drops all but the newest `keep`, in one batch. */
  add(body: string, now: number, keep: number): Promise<void>;
}

export function registerDiagMigrations(): void {
  migrate("002_diag", async () => {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS diag (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        body TEXT NOT NULL
      )`).run();
  });
}

export const diagRepo: DiagRepo = {
  async add(body, now, keep) {
    await db.batch([
      db.prepare(`INSERT INTO diag (created_at, body) VALUES (?, ?)`).bind(now, body),
      db.prepare(`DELETE FROM diag WHERE id NOT IN (SELECT id FROM diag ORDER BY id DESC LIMIT ?)`).bind(keep),
    ]);
  },
};
