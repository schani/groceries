import { byPos, type Item, type Op } from "../../shared/wire";
import { jittered, spread } from "./fractional";

/** Applies ops the way the server would (minus tombstones, which the client never sees). */
export function applyOps(items: readonly Item[], ops: readonly Op[]): Item[] {
  const map = new Map(items.map((i) => [i.id, i]));
  for (const op of ops) {
    const cur = map.get(op.id);
    if (op.type === "add") {
      if (cur) continue;
      map.set(op.id, {
        id: op.id,
        name: op.name,
        description: op.description ?? "",
        photo: op.photo ?? null,
        checked: op.checked ?? false,
        pos: op.pos,
      });
    } else if (op.type === "set") {
      if (!cur) continue;
      const next = { ...cur };
      for (const [k, v] of Object.entries(op.fields)) {
        if (v !== undefined) (next as Record<string, unknown>)[k] = v;
      }
      map.set(op.id, next);
    } else {
      map.delete(op.id);
    }
  }
  return [...map.values()].sort(byPos);
}

/** Display order: unchecked block, then checked block, each in global order. */
export function partition(items: readonly Item[]): Item[] {
  return [...items.filter((i) => !i.checked), ...items.filter((i) => i.checked)];
}

/** Longest position worth keeping; past this the whole list is re-spaced. */
export const MAX_POS_LENGTH = 48;

export function posForAppend(items: readonly Item[], rnd: () => number = Math.random): string {
  const last = items[items.length - 1];
  return jittered(last ? last.pos : null, null, rnd);
}

export type Anchor = { before: string } | { after: string } | { end: true };

/**
 * Where a dropped item goes, given its neighbours at drop time (nearest first).
 * Neighbours deleted or moved to the other block meanwhile are skipped; null means
 * no usable anchor is left (or the item itself is gone).
 */
export function resolveAnchor(
  items: readonly Item[],
  id: string,
  preceding: readonly string[],
  following: readonly string[],
): Anchor | null {
  const me = items.find((i) => i.id === id);
  if (!me) return null;
  const inBlock = (x: string | undefined) =>
    x !== undefined && x !== id && items.some((i) => i.id === x && i.checked === me.checked);
  for (let d = 0; d < Math.max(preceding.length, following.length); d++) {
    if (inBlock(following[d])) return { before: following[d] };
    if (inBlock(preceding[d])) return { after: preceding[d] };
  }
  return items.some((i) => i.id !== id && i.checked === me.checked) ? null : { end: true };
}

/** The `set pos` ops that put `id` at `anchor` in global order. */
export function planMove(items: readonly Item[], id: string, anchor: Anchor, rnd: () => number = Math.random): Op[] {
  const me = items.find((i) => i.id === id);
  if (!me) return [];
  const rest = items.filter((i) => i.id !== id);
  const at = (x: string) => rest.findIndex((i) => i.id === x);
  let t = "end" in anchor ? rest.length : "before" in anchor ? at(anchor.before) : at(anchor.after) + 1;
  if (t < 0 || ("after" in anchor && t === 0)) t = rest.length;
  const order = [...rest.slice(0, t), me, ...rest.slice(t)];
  const lo = rest[t - 1]?.pos ?? null, hi = rest[t]?.pos ?? null;

  let updates: [Item, string][];
  if (lo !== null && hi !== null && lo >= hi) {
    // tied neighbours: re-space the whole tie group so the item really lands inside it
    let s = t - 1, e = t;
    while (s > 0 && rest[s - 1].pos === lo) s--;
    while (e + 1 < rest.length && rest[e + 1].pos === hi) e++;
    const group = order.slice(s, e + 2);
    const keys = spread(rest[s - 1]?.pos ?? null, rest[e + 1]?.pos ?? null, group.length);
    updates = group.map((it, i) => [it, keys[i]]);
  } else {
    updates = [[me, jittered(lo, hi, rnd)]];
  }
  if (updates.some(([, k]) => k.length > MAX_POS_LENGTH)) {
    const keys = spread(null, null, order.length);
    updates = order.map((it, i) => [it, keys[i]]);
  }
  return updates
    .filter(([it, k]) => it.pos !== k)
    .map(([it, pos]) => ({ type: "set", id: it.id, fields: { pos } }));
}

export function sameItems(a: readonly Item[], b: readonly Item[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (
      x.id !== y.id || x.name !== y.name || x.description !== y.description ||
      x.photo !== y.photo || x.checked !== y.checked || x.pos !== y.pos
    ) return false;
  }
  return true;
}
