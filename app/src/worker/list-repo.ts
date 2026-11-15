import { db, migrate } from "flingit";
import type { Item, ItemFields } from "../shared/wire.js";

export interface StoredItem extends Item {
  deleted: boolean;
}

export type Write =
  | { kind: "insert"; item: Item }
  | { kind: "update"; id: string; fields: ItemFields }
  | { kind: "tombstone"; id: string };

export interface ListRepo {
  version(): Promise<number>;
  liveItems(): Promise<Item[]>;
  /** Rows for the given ids, tombstones included. */
  rows(ids: string[]): Promise<Map<string, StoredItem>>;
  /** Applies the writes and bumps the list version in one atomic batch. */
  commit(writes: Write[], now: number): Promise<void>;
  photoInUse(key: string): Promise<boolean>;
  livePhotoKeys(): Promise<Set<string>>;
}

export function registerMigrations(): void {
  migrate("001_items", async () => {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        photo TEXT NULL,
        checked INTEGER NOT NULL DEFAULT 0,
        pos TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS items_live_order ON items (deleted, pos, id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS items_photo ON items (photo)`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)`).run();
    await db.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('version', 0)`).run();
  });
}

interface Row {
  id: string;
  name: string;
  description: string;
  photo: string | null;
  checked: number;
  pos: string;
  deleted: number;
}

const toItem = (r: Row): Item => ({
  id: r.id,
  name: r.name,
  description: r.description,
  photo: r.photo,
  checked: !!r.checked,
  pos: r.pos,
});

const COLUMNS: Record<keyof ItemFields, string> = {
  name: "name",
  description: "description",
  checked: "checked",
  pos: "pos",
  photo: "photo",
};

const sqlValue = (v: ItemFields[keyof ItemFields]) => (typeof v === "boolean" ? (v ? 1 : 0) : v);

function statement(w: Write, now: number) {
  switch (w.kind) {
    case "insert": {
      const i = w.item;
      return db
        .prepare(
          `INSERT OR IGNORE INTO items (id, name, description, photo, checked, pos, deleted, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        )
        .bind(i.id, i.name, i.description, i.photo, i.checked ? 1 : 0, i.pos, now);
    }
    case "update": {
      const keys = Object.keys(w.fields) as (keyof ItemFields)[];
      const sets = keys.map((k) => `${COLUMNS[k]} = ?`).join(", ");
      return db
        .prepare(`UPDATE items SET ${sets}, updated_at = ? WHERE id = ? AND deleted = 0`)
        .bind(...keys.map((k) => sqlValue(w.fields[k])), now, w.id);
    }
    case "tombstone":
      return db
        .prepare(`UPDATE items SET deleted = 1, photo = NULL, updated_at = ? WHERE id = ?`)
        .bind(now, w.id);
  }
}

export const listRepo: ListRepo = {
  async version() {
    const r = await db.prepare(`SELECT value FROM meta WHERE key = 'version'`).first<{ value: number }>();
    return r?.value ?? 0;
  },

  async liveItems() {
    const { results } = await db
      .prepare(
        `SELECT id, name, description, photo, checked, pos, deleted FROM items
         WHERE deleted = 0 ORDER BY pos, id`,
      )
      .all<Row>();
    return results.map(toItem);
  },

  async rows(ids) {
    const out = new Map<string, StoredItem>();
    const unique = [...new Set(ids)];
    // Chunked to stay under SQLite's bound-parameter limit.
    for (let i = 0; i < unique.length; i += 90) {
      const chunk = unique.slice(i, i + 90);
      const { results } = await db
        .prepare(
          `SELECT id, name, description, photo, checked, pos, deleted FROM items
           WHERE id IN (${chunk.map(() => "?").join(",")})`,
        )
        .bind(...chunk)
        .all<Row>();
      for (const r of results) out.set(r.id, { ...toItem(r), deleted: !!r.deleted });
    }
    return out;
  },

  async commit(writes, now) {
    await db.batch([
      ...writes.map((w) => statement(w, now)),
      db.prepare(`UPDATE meta SET value = value + 1 WHERE key = 'version'`),
    ]);
  },

  async photoInUse(key) {
    const r = await db.prepare(`SELECT 1 AS x FROM items WHERE photo = ? AND deleted = 0 LIMIT 1`).bind(key).first();
    return !!r;
  },

  async livePhotoKeys() {
    const { results } = await db
      .prepare(`SELECT photo FROM items WHERE photo IS NOT NULL AND deleted = 0`)
      .all<{ photo: string }>();
    return new Set(results.map((r) => r.photo));
  },
};
