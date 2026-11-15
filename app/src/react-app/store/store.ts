// The shared list as the UI sees it: last server snapshot + pending outbox ops
// replayed on top. Mutations are optimistic and appended to the IndexedDB outbox,
// which all tabs share; one tab at a time flushes it, in order, and tabs tell each
// other to reload. The server is polled while the page is visible.

import { LIMITS, type Item, type ItemFields, type Op, type Snapshot } from "../../shared/wire";
import { HttpError, getList, photoUrl, postOps, putPhoto } from "../api/client";
import * as local from "../local/db";
import { photoKeysOf } from "../local/db";
import { applyOps, planMove, posForAppend, resolveAnchor, sameItems } from "./rebase";

export type ChangeSource = "local" | "remote";
export type Listener = (source: ChangeSource) => void;

export interface ListStore {
  /** False until there is something meaningful to show (cached snapshot or first server answer). */
  readonly loaded: boolean;
  items(): readonly Item[];
  get(id: string): Item | undefined;
  photoSrc(key: string): string;
  subscribe(fn: Listener): () => void;

  add(name: string, photo?: Blob | null): Item | undefined;
  setChecked(id: string, checked: boolean): void;
  update(id: string, fields: { name?: string; description?: string }): void;
  setPhoto(id: string, photo: Blob | null): void;
  /** Drop `id` next to the nearest of its neighbours (nearest first) that is still in its block. */
  move(id: string, preceding: readonly string[], following: readonly string[]): void;
  remove(id: string): void;

  destroy(): void;
}

const POLL_MS = 4000;
const FLUSH_DELAY_MS = 30;
const LOCK_RETRY_MS = 500;
const MAX_BACKOFF_MS = 30000;
const LOCK_NAME = "groceries-outbox";
const CHANNEL_NAME = "groceries";

export function newId(): string {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

const cleanName = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, LIMITS.name);

/** Statuses that mean "this request will never succeed"; everything else is retried. */
const PERMANENT = new Set([400, 413, 415, 422]);
export const isPermanent = (e: unknown) => e instanceof HttpError && PERMANENT.has(e.status);

/** Runs fn unless another tab holds the outbox lock; resolves false if it was skipped. */
async function withOutboxLock(fn: () => Promise<void>): Promise<boolean> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) {
    await fn();
    return true;
  }
  return locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
    if (!lock) return false;
    await fn();
    return true;
  });
}

interface Entry {
  /** IndexedDB key; undefined while the append is still being written. */
  key?: number;
  op: Op;
}

export function createStore(): ListStore {
  let base: Snapshot | null = null;
  let outbox: Entry[] = [];
  let view: Item[] = [];
  let loaded = false;
  let destroyed = false;
  const urls = new Map<string, string>(); // object URLs for photos held locally
  const listeners = new Set<Listener>();
  let writes: Promise<unknown> = Promise.resolve();
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL_NAME) : null;

  const emit = (source: ChangeSource) => listeners.forEach((fn) => fn(source));
  const notifyTabs = () => channel?.postMessage("changed");

  function recompute(source: ChangeSource) {
    const next = applyOps(base?.items ?? [], outbox.map((e) => e.op));
    const changed = !sameItems(view, next);
    view = next;
    releaseUrls();
    if (changed) emit(source);
  }

  function releaseUrls() {
    const used = new Set<string>();
    view.forEach((i) => i.photo && used.add(i.photo));
    outbox.forEach((e) => photoKeysOf(e.op).forEach((k) => used.add(k)));
    for (const [k, u] of urls) {
      if (!used.has(k)) {
        URL.revokeObjectURL(u);
        urls.delete(k);
      }
    }
  }

  function markLoaded() {
    if (loaded || destroyed) return;
    loaded = true;
    emit("remote");
  }

  function enqueue(ops: Op[], photo?: { key: string; blob: Blob }) {
    if (destroyed || !ops.length) return;
    const entries: Entry[] = ops.map((op) => ({ op }));
    outbox.push(...entries);
    recompute("local");
    writes = writes
      .then(() => local.appendOps(ops, photo))
      .then((keys) => {
        entries.forEach((e, i) => (e.key = keys[i]));
        notifyTabs();
        scheduleFlush();
      })
      .catch((e) => console.warn("outbox not saved", e));
  }

  function keepPhoto(blob: Blob) {
    const key = newId();
    urls.set(key, URL.createObjectURL(blob));
    return { key, blob };
  }

  /** Re-reads what other tabs may have changed: snapshot, outbox, local photos. */
  let reloads = 0;
  async function reload() {
    const gen = ++reloads;
    await writes.catch(() => undefined);
    const st = await local.loadState();
    if (destroyed || gen !== reloads) return;
    if (st.snapshot && (!base || st.snapshot.version > base.version)) base = st.snapshot;
    // entries without a key are this tab's appends still being written
    outbox = [...st.outbox, ...outbox.filter((e) => e.key === undefined)];
    for (const [k, b] of st.photos) if (!urls.has(k)) urls.set(k, URL.createObjectURL(b));
    recompute("remote");
    if (st.snapshot) markLoaded();
  }

  // ---------- sync loop ----------
  let started = false; // the persisted state has been loaded
  let busy = false;
  let again = false;
  let failures = 0;
  let pollTimer = 0;
  let retryTimer = 0;
  let flushTimer = 0;

  const online = () => navigator.onLine !== false;
  const visible = () => document.visibilityState === "visible";

  function scheduleFlush(ms = FLUSH_DELAY_MS) {
    clearTimeout(flushTimer);
    if (!destroyed) flushTimer = window.setTimeout(kick, ms);
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!destroyed && visible() && online() && !retryTimer) pollTimer = window.setTimeout(kick, POLL_MS);
  }

  function kick() {
    if (destroyed || !started) return;
    if (busy) {
      again = true;
      return;
    }
    clearTimeout(retryTimer);
    retryTimer = 0;
    busy = true;
    void loop();
  }

  async function loop() {
    try {
      do {
        again = false;
        await flush();
        if (!destroyed && (visible() || !base)) await poll();
      } while (again && !destroyed);
      failures = 0;
    } catch (e) {
      failures++;
      if (!(e instanceof TypeError) && !(e instanceof HttpError)) console.error("sync failed", e);
      if (online() && !destroyed) {
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (failures - 1));
        retryTimer = window.setTimeout(() => {
          retryTimer = 0;
          kick();
        }, delay);
      }
    } finally {
      busy = false;
      markLoaded();
      schedulePoll();
    }
  }

  function forget(keys: Set<number>) {
    outbox = outbox.filter((e) => e.key === undefined || !keys.has(e.key));
  }

  async function flush() {
    await writes.catch(() => undefined);
    const ran = await withOutboxLock(async () => {
      let limit: number = LIMITS.opsPerRequest;
      for (;;) {
        if (destroyed) return;
        const records = await local.loadOutbox();
        if (!records.length) break;
        const batch = records.slice(0, limit);
        const blobs = await local.loadPhotos(batch.flatMap((r) => photoKeysOf(r.op)));
        if (destroyed) return;
        const [photoKey, blob] = blobs.entries().next().value ?? [];
        if (photoKey && blob) {
          try {
            await putPhoto(photoKey, blob);
            await local.deletePhoto(photoKey);
          } catch (e) {
            if (!isPermanent(e) || destroyed) throw e;
            console.warn("photo rejected", photoKey, e);
            await local.stripPhoto(photoKey);
            await reload();
            notifyTabs();
          }
          continue;
        }
        const keys = new Set(batch.map((r) => r.key));
        try {
          const snap = await postOps(batch.map((r) => r.op));
          if (destroyed) return;
          await local.ackOps([...keys], snap);
          base = snap;
          forget(keys);
          recompute("remote");
          notifyTabs();
          limit = LIMITS.opsPerRequest;
        } catch (e) {
          if (!isPermanent(e) || destroyed) throw e;
          if (batch.length > 1) {
            limit = 1; // find the bad op by sending one at a time
          } else {
            console.warn("op rejected", batch[0].op, e);
            await local.dropOps([batch[0].key]);
            forget(keys);
            recompute("remote");
            notifyTabs();
          }
        }
      }
      if (!destroyed) await local.prunePhotos();
    });
    // another tab is flushing; look again shortly in case it finished before our ops landed
    if (!ran) scheduleFlush(LOCK_RETRY_MS);
  }

  async function poll() {
    const res = await getList(base ? base.version : undefined);
    if (destroyed || "unchanged" in res) return;
    // Versions only move forward, except after a server-side reset; any difference wins.
    if (!base || res.version !== base.version) {
      base = res;
      local.saveSnapshot(res).catch((e) => console.warn("snapshot not saved", e));
      recompute("remote");
    }
  }

  // ---------- lifecycle ----------
  const onVisible = () => (visible() ? kick() : clearTimeout(pollTimer));
  const ac = new AbortController();
  document.addEventListener("visibilitychange", onVisible, { signal: ac.signal });
  window.addEventListener("focus", kick, { signal: ac.signal });
  window.addEventListener("online", kick, { signal: ac.signal });
  window.addEventListener("offline", () => clearTimeout(pollTimer), { signal: ac.signal });
  if (channel) channel.onmessage = () => void reload().then(() => scheduleFlush());

  void (async () => {
    try {
      await reload();
    } catch (e) {
      console.warn("local cache unavailable", e);
    }
    started = true;
    kick();
  })();

  // ---------- public API ----------
  const get = (id: string) => view.find((i) => i.id === id);

  return {
    get loaded() {
      return loaded;
    },
    items: () => view,
    get,
    photoSrc: (key) => urls.get(key) ?? photoUrl(key),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    add(rawName, photo) {
      const name = cleanName(rawName);
      if (!name || destroyed) return undefined;
      const id = newId();
      const op: Op = { type: "add", id, name, pos: posForAppend(view) };
      const p = photo ? keepPhoto(photo) : undefined;
      if (p) op.photo = p.key;
      enqueue([op], p);
      return get(id);
    },
    setChecked(id, checked) {
      if (get(id)) enqueue([{ type: "set", id, fields: { checked } }]);
    },
    update(id, fields) {
      const it = get(id);
      if (!it) return;
      const f: ItemFields = {};
      if (fields.name !== undefined) {
        const n = cleanName(fields.name);
        if (n && n !== it.name) f.name = n;
      }
      if (fields.description !== undefined) {
        const d = fields.description.slice(0, LIMITS.description);
        if (d !== it.description) f.description = d;
      }
      if (Object.keys(f).length) enqueue([{ type: "set", id, fields: f }]);
    },
    setPhoto(id, photo) {
      if (!get(id) || destroyed) return;
      const p = photo ? keepPhoto(photo) : undefined;
      enqueue([{ type: "set", id, fields: { photo: p ? p.key : null } }], p);
    },
    move(id, preceding, following) {
      const anchor = resolveAnchor(view, id, preceding, following);
      if (anchor) enqueue(planMove(view, id, anchor));
    },
    remove(id) {
      if (get(id)) enqueue([{ type: "remove", id }]);
    },

    destroy() {
      destroyed = true;
      ac.abort();
      [pollTimer, retryTimer, flushTimer].forEach((t) => clearTimeout(t));
      channel?.close();
      listeners.clear();
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    },
  };
}
