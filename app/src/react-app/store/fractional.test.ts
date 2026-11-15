import { describe, expect, it } from "vitest";
import { between, jittered, spread } from "./fractional";

describe("between", () => {
  it("starts in the middle and appends with short keys", () => {
    let k = between(null, null);
    expect(k).toBe("V");
    for (let i = 0; i < 300; i++) {
      const n = between(k, null);
      expect(n > k).toBe(true);
      k = n;
    }
    expect(k.length).toBeLessThanOrEqual(11);
  });

  it("prepends", () => {
    let k = between(null, null);
    for (let i = 0; i < 100; i++) {
      const n = between(null, k);
      expect(n < k).toBe(true);
      expect(n.endsWith("0")).toBe(false);
      k = n;
    }
  });

  it("fits between neighbours, repeatedly at the same spot", () => {
    let lo = "V", hi = "W";
    for (let i = 0; i < 200; i++) {
      const m = between(lo, hi);
      expect(lo < m && m < hi).toBe(true);
      if (i % 2) lo = m;
      else hi = m;
    }
  });

  it("handles keys sharing a prefix and leading zero digits", () => {
    for (const [a, b] of [["", "01"], ["V", "V1"], ["0V", "1"], ["zz", "zzV"], ["Az", "B"]] as const) {
      const m = between(a || null, b);
      if (a) expect(m > a).toBe(true);
      expect(m < b).toBe(true);
      expect(m.endsWith("0")).toBe(false);
    }
  });

  it("keeps order under random insertion", () => {
    const keys: string[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 500; i++) {
      const at = Math.floor(rnd() * (keys.length + 1));
      const k = between(keys[at - 1] ?? null, keys[at] ?? null);
      keys.splice(at, 0, k);
    }
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("rejects invalid input", () => {
    expect(() => between("b", "a")).toThrow();
    expect(() => between("a", "a")).toThrow();
    expect(() => between("a0", null)).toThrow();
    expect(() => between("a-", null)).toThrow();
  });
});

describe("jittered / spread", () => {
  it("stays strictly between its bounds", () => {
    for (const [a, b] of [[null, null], ["V", null], ["V", "W"], ["V", "V1"], [null, "1"]] as const) {
      for (let i = 0; i < 50; i++) {
        const k = jittered(a, b);
        if (a) expect(k > a).toBe(true);
        if (b) expect(k < b).toBe(true);
        expect(k.endsWith("0")).toBe(false);
      }
    }
  });

  it("makes concurrent appends distinct", () => {
    const keys = new Set(Array.from({ length: 100 }, () => jittered("V", null)));
    expect(keys.size).toBeGreaterThan(90);
  });

  it("spreads n short increasing keys", () => {
    for (const [a, b, n] of [[null, null, 500], ["V", "W", 7], ["W", "W1", 3]] as const) {
      const keys = spread(a, b, n);
      expect(keys).toHaveLength(n);
      expect([...keys].sort()).toEqual(keys);
      expect(new Set(keys).size).toBe(n);
      if (a) expect(keys[0] > a).toBe(true);
      if (b) expect(keys[n - 1] < b).toBe(true);
    }
    expect(Math.max(...spread(null, null, 500).map((k) => k.length))).toBeLessThanOrEqual(3);
  });
});
