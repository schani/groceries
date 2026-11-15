// IndexedDB persistence, shared by all tabs: the last server snapshot, the outbox
// (one record per op, auto-increment key = order) and photo blobs not yet uploaded.

import type { Op, Snapshot } from "../../shared/wire";

export interface OutboxRecord {
  key: number;
  op: Op;
}

export interface LocalState {
  snapshot: Snapshot | undefined;
  outbox: OutboxRecord[];
  photos: Map<string, Blob>;
}

const DB_NAME = "groceries";
const KV = "kv";
const OUTBOX = "outbox";
const PHOTOS = "photos";

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
      if (!db.objectStoreNames.contains(OUTBOX)) {
        const outbox = db.createObjectStore(OUTBOX, { autoIncrement: true });
        if (e.oldVersion === 1) {
          // version 1 kept the whole outbox as one array under kv/"outbox"
          const kv = req.transaction!.objectStore(KV);
          const old = kv.get("outbox");
          old.onsuccess = () => {
            for (const entry of (old.result as { op: Op }[] | undefined) ?? []) outbox.add(entry.op);
            kv.delete("outbox");
          };
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

/** Runs `body` in one transaction; resolves with its result once the transaction commits. */
async function tx<T>(stores: string[], mode: IDBTransactionMode, body: (t: IDBTransaction) => () => T): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const result = body(t);
    t.oncomplete = () => resolve(result());
    t.onerror = t.onabort = () => reject(t.error);
  });
}

function readOutbox(store: IDBObjectStore): () => OutboxRecord[] {
  const out: OutboxRecord[] = [];
  const req = store.openCursor();
  req.onsuccess = () => {
    const c = req.result;
    if (!c) return;
    out.push({ key: c.key as number, op: c.value as Op });
    c.continue();
  };
  return () => out;
}

function readPhotos(store: IDBObjectStore, keys?: readonly string[]): () => Map<string, Blob> {
  const out = new Map<string, Blob>();
  if (keys) {
    for (const k of keys) {
      const r = store.get(k);
      r.onsuccess = () => { if (r.result) out.set(k, r.result as Blob); };
    }
  } else {
    const req = store.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      out.set(String(c.key), c.value as Blob);
      c.continue();
    };
  }
  return () => out;
}

export function photoKeysOf(op: Op): string[] {
  const p = op.type === "add" ? op.photo : op.type === "set" ? op.fields.photo : null;
  return p ? [p] : [];
}

export const loadState = () =>
  tx([KV, OUTBOX, PHOTOS], "readonly", (t): (() => LocalState) => {
    const snap = t.objectStore(KV).get("snapshot");
    const outbox = readOutbox(t.objectStore(OUTBOX));
    const photos = readPhotos(t.objectStore(PHOTOS));
    return () => ({ snapshot: snap.result as Snapshot | undefined, outbox: outbox(), photos: photos() });
  });

export const loadOutbox = () => tx([OUTBOX], "readonly", (t) => readOutbox(t.objectStore(OUTBOX)));

export const loadPhotos = (keys: readonly string[]) => tx([PHOTOS], "readonly", (t) => readPhotos(t.objectStore(PHOTOS), keys));

/** Appends ops (and the photo they reference) atomically; resolves with the new record keys. */
export const appendOps = (ops: Op[], photo?: { key: string; blob: Blob }) =>
  tx([OUTBOX, PHOTOS], "readwrite", (t) => {
    if (photo) t.objectStore(PHOTOS).put(photo.blob, photo.key);
    const keys: number[] = [];
    const store = t.objectStore(OUTBOX);
    ops.forEach((op, i) => { store.add(op).onsuccess = (e) => { keys[i] = (e.target as IDBRequest<number>).result; }; });
    return () => keys;
  });

/** Removes acknowledged records and stores the server's answer in one step. */
export const ackOps = (keys: number[], snap: Snapshot) =>
  tx([OUTBOX, KV], "readwrite", (t) => {
    const store = t.objectStore(OUTBOX);
    keys.forEach((k) => store.delete(k));
    t.objectStore(KV).put(snap, "snapshot");
    return () => undefined;
  });

export const dropOps = (keys: number[]) =>
  tx([OUTBOX], "readwrite", (t) => {
    keys.forEach((k) => t.objectStore(OUTBOX).delete(k));
    return () => undefined;
  });

export const saveSnapshot = (snap: Snapshot) =>
  tx([KV], "readwrite", (t) => {
    t.objectStore(KV).put(snap, "snapshot");
    return () => undefined;
  });

export const deletePhoto = (key: string) =>
  tx([PHOTOS], "readwrite", (t) => {
    t.objectStore(PHOTOS).delete(key);
    return () => undefined;
  });

/** A photo the server refused: delete it and strip it from every queued op. */
export const stripPhoto = (key: string) =>
  tx([OUTBOX, PHOTOS], "readwrite", (t) => {
    t.objectStore(PHOTOS).delete(key);
    const req = t.objectStore(OUTBOX).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      const op = c.value as Op;
      if (op.type === "add" && op.photo === key) c.update({ ...op, photo: null });
      else if (op.type === "set" && op.fields.photo === key) {
        const fields = { ...op.fields };
        delete fields.photo;
        if (Object.keys(fields).length) c.update({ ...op, fields });
        else c.delete();
      }
      c.continue();
    };
    return () => undefined;
  });

/** Deletes blobs no queued op references any more. */
export const prunePhotos = () =>
  tx([OUTBOX, PHOTOS], "readwrite", (t) => {
    const ops = t.objectStore(OUTBOX).getAll();
    ops.onsuccess = () => {
      const used = new Set((ops.result as Op[]).flatMap(photoKeysOf));
      const photos = t.objectStore(PHOTOS);
      const keys = photos.getAllKeys();
      keys.onsuccess = () => keys.result.forEach((k) => { if (!used.has(String(k))) photos.delete(k); });
    };
    return () => undefined;
  });
