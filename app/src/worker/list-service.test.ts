import { beforeEach, describe, expect, it } from "vitest";
import type { Op } from "../shared/wire.js";
import type { ListRepo, StoredItem, Write } from "./list-repo.js";
import { createListService, type ListService } from "./list-service.js";
import type { PhotoStore } from "./photo-store.js";

/** In-memory stand-in with the same semantics as the SQL in list-repo. */
function memoryRepo(): ListRepo & { rowsById: Map<string, StoredItem> } {
  const rowsById = new Map<string, StoredItem>();
  let version = 0;
  return {
    rowsById,
    version: async () => version,
    liveItems: async () =>
      [...rowsById.values()]
        .filter((r) => !r.deleted)
        .sort((a, b) => (a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : a.id < b.id ? -1 : 1))
        .map(({ deleted: _d, ...i }) => i),
    rows: async (ids) => new Map(ids.flatMap((id) => (rowsById.has(id) ? [[id, { ...rowsById.get(id)! }]] : []))),
    async commit(writes: Write[]) {
      for (const w of writes) {
        if (w.kind === "insert") {
          if (!rowsById.has(w.item.id)) rowsById.set(w.item.id, { ...w.item, deleted: false });
        } else if (w.kind === "update") {
          const r = rowsById.get(w.id);
          if (r && !r.deleted) Object.assign(r, w.fields);
        } else {
          const r = rowsById.get(w.id);
          if (r) Object.assign(r, { deleted: true, photo: null });
        }
      }
      version++;
    },
    photoInUse: async (key) => [...rowsById.values()].some((r) => !r.deleted && r.photo === key),
    livePhotoKeys: async () => new Set([...rowsById.values()].flatMap((r) => (!r.deleted && r.photo ? [r.photo] : []))),
  };
}

function memoryPhotos(): PhotoStore & { keys: Set<string>; uploaded: Map<string, number> } {
  const keys = new Set<string>();
  const uploaded = new Map<string, number>();
  return {
    keys,
    uploaded,
    put: async (k) => void keys.add(k),
    get: async () => null,
    exists: async (k) => keys.has(k),
    list: async () => [...keys].map((key) => ({ key, uploaded: new Date(uploaded.get(key) ?? 0) })),
    delete: async (ks) => ks.forEach((k) => keys.delete(k)),
  };
}

const add = (id: string, pos: string, extra: Partial<Extract<Op, { type: "add" }>> = {}): Op => ({ type: "add", id, name: id, pos, ...extra });

describe("list service", () => {
  let repo: ReturnType<typeof memoryRepo>;
  let photos: ReturnType<typeof memoryPhotos>;
  let svc: ListService;
  beforeEach(() => {
    repo = memoryRepo();
    photos = memoryPhotos();
    svc = createListService(repo, photos, () => 1);
  });

  it("applies ops in order and bumps the version once per changing request", async () => {
    const snap = await svc.apply([add("item0001", "V"), add("item0002", "W"), { type: "set", id: "item0001", fields: { checked: true } }]);
    expect(snap.version).toBe(1);
    expect(snap.items.map((i) => [i.id, i.checked])).toEqual([["item0001", true], ["item0002", false]]);
  });

  it("does not bump the version for no-op requests", async () => {
    await svc.apply([add("item0001", "V")]);
    const snap = await svc.apply([add("item0001", "V"), { type: "set", id: "item0001", fields: { name: "item0001" } }]);
    expect(snap.version).toBe(1);
  });

  it("answers unchanged when the client is current", async () => {
    await svc.apply([add("item0001", "V")]);
    expect(await svc.list(1)).toEqual({ version: 1, unchanged: true });
    expect(await svc.list(0)).toMatchObject({ version: 1, items: [{ id: "item0001" }] });
  });

  it("merges concurrent edits to different fields (last write wins per field)", async () => {
    await svc.apply([add("item0001", "V")]);
    await svc.apply([{ type: "set", id: "item0001", fields: { name: "Oat milk" } }]);
    const snap = await svc.apply([{ type: "set", id: "item0001", fields: { checked: true } }]);
    expect(snap.items[0]).toMatchObject({ name: "Oat milk", checked: true });
  });

  it("keeps removed items dead: late sets and re-adds are ignored", async () => {
    await svc.apply([add("item0001", "V")]);
    await svc.apply([{ type: "remove", id: "item0001" }]);
    const snap = await svc.apply([
      { type: "set", id: "item0001", fields: { name: "zombie" } },
      add("item0001", "V"),
    ]);
    expect(snap.items).toEqual([]);
    expect(repo.rowsById.get("item0001")?.deleted).toBe(true);
  });

  it("is idempotent when a request is retried", async () => {
    const ops: Op[] = [add("item0001", "V"), { type: "set", id: "item0001", fields: { pos: "W" } }, { type: "remove", id: "item0002" }];
    const a = await svc.apply(ops);
    const b = await svc.apply(ops);
    expect(b.items).toEqual(a.items);
    expect(b.version).toBe(a.version);
  });

  it("deletes a photo when it is replaced, cleared, or its item removed", async () => {
    ["photo001", "photo002", "photo003"].forEach((k) => photos.keys.add(k));
    await svc.apply([add("item0001", "V", { photo: "photo001" }), add("item0002", "W", { photo: "photo003" })]);
    await svc.apply([{ type: "set", id: "item0001", fields: { photo: "photo002" } }]);
    expect([...photos.keys].sort()).toEqual(["photo002", "photo003"]);
    await svc.apply([{ type: "set", id: "item0001", fields: { photo: null } }]);
    await svc.apply([{ type: "remove", id: "item0002" }]);
    expect([...photos.keys]).toEqual([]);
  });

  it("drops photos uploaded for ops that end up ignored, but not ones still in use", async () => {
    ["photo001", "photo009"].forEach((k) => photos.keys.add(k));
    await svc.apply([add("item0001", "V", { photo: "photo001" })]);
    await svc.apply([{ type: "remove", id: "item0002" }, add("item0001", "V", { photo: "photo001" })]);
    expect(photos.keys.has("photo001")).toBe(true);
    await svc.apply([{ type: "set", id: "missing01", fields: { photo: "photo009" } }]);
    expect(photos.keys.has("photo009")).toBe(false);
  });

  it("ignores photo references to objects that were never uploaded", async () => {
    photos.keys.add("photo001");
    const snap = await svc.apply([
      add("item0001", "V", { photo: "nophoto1" }),
      add("item0002", "W", { photo: "photo001" }),
    ]);
    expect(snap.items.map((i) => i.photo)).toEqual([null, "photo001"]);
    const again = await svc.apply([
      { type: "set", id: "item0002", fields: { photo: "nophoto2" } },
      { type: "set", id: "item0001", fields: { photo: "nophoto3", name: "Renamed" } },
    ]);
    expect(again.items.map((i) => [i.name, i.photo])).toEqual([["Renamed", null], ["item0002", "photo001"]]);
  });

  it("collects unreferenced photos older than a day", async () => {
    const day = 24 * 60 * 60 * 1000, now = 10 * day;
    for (const [k, t] of [["photo001", 0], ["photo002", 0], ["photo003", now - 1000]] as const) {
      photos.keys.add(k);
      photos.uploaded.set(k, t);
    }
    await svc.apply([add("item0001", "V", { photo: "photo001" })]);
    expect(await svc.collectPhotoGarbage(now)).toEqual({ deleted: 1 });
    expect([...photos.keys].sort()).toEqual(["photo001", "photo003"]);
  });
});
