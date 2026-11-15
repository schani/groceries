import type { Item, ItemFields, ListResponse, Op, Snapshot } from "../shared/wire.js";
import type { ListRepo, StoredItem, Write } from "./list-repo.js";
import type { Photo, PhotoStore } from "./photo-store.js";

export interface ListService {
  list(since?: number): Promise<ListResponse>;
  /** Applies ops in order (idempotent, last write wins per field) and returns the fresh list. */
  apply(ops: Op[]): Promise<Snapshot>;
  putPhoto(key: string, jpeg: ArrayBuffer): Promise<void>;
  getPhoto(key: string): Promise<Photo | null>;
  /** Deletes stored photos no live item references that are older than a day. */
  collectPhotoGarbage(now: number): Promise<{ deleted: number }>;
}

const GC_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export function createListService(repo: ListRepo, photos: PhotoStore, clock: () => number = Date.now): ListService {
  async function snapshot(): Promise<Snapshot> {
    // Version first: if a write lands in between, the client sees newer items
    // under an older version and simply refetches on its next poll.
    const version = await repo.version();
    return { version, items: await repo.liveItems() };
  }

  return {
    async list(since) {
      if (since !== undefined) {
        const version = await repo.version();
        if (version === since) return { version, unchanged: true };
      }
      return snapshot();
    },

    async apply(ops) {
      // an op must never point an item at a photo that was never uploaded
      const missing = new Set<string>();
      for (const key of new Set(ops.flatMap(photoOf))) if (!(await photos.exists(key))) missing.add(key);
      ops = ops.flatMap((op) => withoutPhotos(op, missing));

      const rows = await repo.rows(ops.map((o) => o.id));
      const writes: Write[] = [];
      // Photo keys that may have lost their last reference.
      const orphanCandidates = new Set<string>();

      for (const op of ops) {
        const cur = rows.get(op.id);
        if (op.type === "add") {
          if (cur) {
            if (op.photo) orphanCandidates.add(op.photo);
            continue;
          }
          const item: Item = {
            id: op.id,
            name: op.name,
            description: op.description ?? "",
            photo: op.photo ?? null,
            checked: op.checked ?? false,
            pos: op.pos,
          };
          rows.set(op.id, { ...item, deleted: false });
          writes.push({ kind: "insert", item });
        } else if (op.type === "set") {
          if (!cur || cur.deleted) {
            if (op.fields.photo) orphanCandidates.add(op.fields.photo);
            continue;
          }
          const changed = diff(cur, op.fields);
          if (!changed) continue;
          if (changed.photo !== undefined && cur.photo) orphanCandidates.add(cur.photo);
          rows.set(op.id, { ...cur, ...changed });
          writes.push({ kind: "update", id: op.id, fields: changed });
        } else {
          if (!cur || cur.deleted) continue;
          if (cur.photo) orphanCandidates.add(cur.photo);
          rows.set(op.id, { ...cur, photo: null, deleted: true });
          writes.push({ kind: "tombstone", id: op.id });
        }
      }

      if (writes.length) await repo.commit(writes, clock());

      const unused: string[] = [];
      for (const key of orphanCandidates) if (!(await repo.photoInUse(key))) unused.push(key);
      if (unused.length) {
        try {
          await photos.delete(unused);
        } catch (e) {
          console.warn("photo cleanup failed", unused, e);
        }
      }
      return snapshot();
    },

    putPhoto: (key, jpeg) => photos.put(key, jpeg),
    getPhoto: (key) => photos.get(key),

    async collectPhotoGarbage(now) {
      const stored = await photos.list();
      const inUse = await repo.livePhotoKeys();
      const unused = stored.filter((p) => !inUse.has(p.key) && now - p.uploaded.getTime() > GC_MIN_AGE_MS).map((p) => p.key);
      await photos.delete(unused);
      return { deleted: unused.length };
    },
  };
}

function photoOf(op: Op): string[] {
  const p = op.type === "add" ? op.photo : op.type === "set" ? op.fields.photo : null;
  return p ? [p] : [];
}

function withoutPhotos(op: Op, missing: Set<string>): Op[] {
  if (op.type === "add" && op.photo && missing.has(op.photo)) return [{ ...op, photo: null }];
  if (op.type === "set" && op.fields.photo && missing.has(op.fields.photo)) {
    const fields = { ...op.fields };
    delete fields.photo;
    return Object.keys(fields).length ? [{ ...op, fields }] : [];
  }
  return [op];
}

function diff(cur: StoredItem, fields: ItemFields): ItemFields | null {
  const out: ItemFields = {};
  let any = false;
  for (const k of Object.keys(fields) as (keyof ItemFields)[]) {
    const v = fields[k];
    if (v === undefined || cur[k] === v) continue;
    (out as Record<string, unknown>)[k] = v;
    any = true;
  }
  return any ? out : null;
}
