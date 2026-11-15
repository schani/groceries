import { describe, expect, it } from "vitest";
import type { Item } from "../../shared/wire";
import { MAX_POS_LENGTH, applyOps, partition, planMove, posForAppend, resolveAnchor, type Anchor } from "./rebase";

const item = (id: string, pos: string, extra: Partial<Item> = {}): Item => ({
  id, name: id, description: "", photo: null, checked: false, pos, ...extra,
});

describe("applyOps (snapshot + outbox)", () => {
  const base = [item("a", "V"), item("b", "W"), item("c", "X", { checked: true })];

  it("replays add / set / remove in order and sorts by (pos, id)", () => {
    const out = applyOps(base, [
      { type: "add", id: "d", name: "D", pos: "U" },
      { type: "set", id: "a", fields: { name: "A2", checked: true } },
      { type: "remove", id: "b" },
    ]);
    expect(out.map((i) => i.id)).toEqual(["d", "a", "c"]);
    expect(out[1]).toMatchObject({ name: "A2", checked: true });
  });

  it("ignores sets on items missing from the snapshot (deleted elsewhere)", () => {
    const out = applyOps(base, [{ type: "set", id: "zz", fields: { name: "x" } }]);
    expect(out).toEqual(base);
  });

  it("treats a duplicate add as a no-op", () => {
    const out = applyOps(base, [{ type: "add", id: "a", name: "other", pos: "A" }]);
    expect(out).toEqual(base);
  });

  it("does not mutate the snapshot", () => {
    const snap = [item("a", "V")];
    applyOps(snap, [{ type: "set", id: "a", fields: { name: "changed" } }]);
    expect(snap[0].name).toBe("a");
  });

  it("orders ties by id", () => {
    const out = applyOps([], [
      { type: "add", id: "y", name: "y", pos: "V" },
      { type: "add", id: "x", name: "x", pos: "V" },
    ]);
    expect(out.map((i) => i.id)).toEqual(["x", "y"]);
  });
});

describe("positions", () => {
  // global order a b(checked) c d(checked) e
  const list = [item("a", "V"), item("b", "W", { checked: true }), item("c", "X"), item("d", "Y", { checked: true }), item("e", "Z")];
  const move = (items: Item[], id: string, anchor: Anchor) => applyOps(items, planMove(items, id, anchor));
  const block = (items: Item[], checked = false) => partition(items).filter((i) => i.checked === checked).map((i) => i.id);

  it("partitions unchecked before checked, stable", () => {
    expect(partition(list).map((i) => i.id)).toEqual(["a", "c", "e", "b", "d"]);
  });

  it("appends after the global max, with jitter", () => {
    expect(posForAppend(list) > "Z").toBe(true);
    expect(posForAppend([], () => 0)).toBe("V01");
    const keys = new Set(Array.from({ length: 50 }, () => posForAppend(list)));
    expect(keys.size).toBeGreaterThan(45);
  });

  it("moves an item before a block neighbour", () => {
    const out = move(list, "e", { before: "c" });
    expect(out.map((i) => i.id)).toEqual(["a", "b", "e", "c", "d"]);
    expect(block(out)).toEqual(["a", "e", "c"]);
  });

  it("moves an item to the end of its block (after the previous block item)", () => {
    expect(block(move(list, "a", { after: "e" }))).toEqual(["c", "e", "a"]);
  });

  it("lands between tied neighbours by re-spacing the tie group", () => {
    const tied = [item("A", "V"), item("B", "W"), item("C", "W"), item("M", "X")];
    for (const anchor of [{ before: "C" }, { after: "B" }] as Anchor[]) {
      const ops = planMove(tied, "M", anchor);
      const out = applyOps(tied, ops);
      expect(out.map((i) => i.id)).toEqual(["A", "B", "M", "C"]);
      expect(new Set(out.map((i) => i.pos)).size).toBe(4);
      expect(ops.every((o) => o.type === "set")).toBe(true);
    }
  });

  it("re-spaces the whole list instead of growing a key past the limit", () => {
    let items = [item("a", "V"), item("b", "W"), item("m", "X")];
    for (let i = 0; i < 400; i++) {
      items = move(items, "m", { before: "b" });
      items = move(items, "b", { before: "m" });
    }
    expect(items.map((i) => i.id)).toEqual(["a", "b", "m"]);
    expect(Math.max(...items.map((i) => i.pos.length))).toBeLessThanOrEqual(MAX_POS_LENGTH);
  });
});

describe("resolveAnchor", () => {
  const list = [item("a", "V"), item("b", "W"), item("c", "X", { checked: true }), item("m", "Y"), item("e", "Z")];

  it("uses the nearest following neighbour first", () => {
    expect(resolveAnchor(list, "m", ["a"], ["b", "e"])).toEqual({ before: "b" });
  });

  it("skips neighbours that were deleted or changed block", () => {
    expect(resolveAnchor(list, "m", ["a"], ["gone", "c", "e"])).toEqual({ after: "a" });
    expect(resolveAnchor(list, "m", ["gone"], ["c", "e"])).toEqual({ before: "e" });
  });

  it("appends only when the block is otherwise empty", () => {
    const solo = [item("m", "V"), item("c", "W", { checked: true })];
    expect(resolveAnchor(solo, "m", ["x"], ["y"])).toEqual({ end: true });
    expect(resolveAnchor(list, "m", ["x"], ["y"])).toBeNull();
    expect(resolveAnchor(list, "gone", ["a"], ["b"])).toBeNull();
  });
});
