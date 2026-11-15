import { describe, expect, it } from "vitest";
import { CHECK_INTERVAL_MS, shouldCheck, shouldReload } from "./update";

const base = { pending: true, reloading: false, hidden: false, busy: "idle" as const };

describe("shouldReload", () => {
  it("reloads at once when a new worker took control and the user is idle", () => {
    expect(shouldReload(base)).toBe(true);
  });

  it("does nothing without a pending update (e.g. the first install was ignored)", () => {
    expect(shouldReload({ ...base, pending: false })).toBe(false);
    expect(shouldReload({ ...base, pending: false, hidden: true })).toBe(false);
  });

  it("reloads at most once", () => {
    expect(shouldReload({ ...base, reloading: true })).toBe(false);
  });

  it("defers while the user is interacting, until the page is hidden", () => {
    expect(shouldReload({ ...base, busy: "interacting" })).toBe(false);
    expect(shouldReload({ ...base, busy: "interacting", hidden: true })).toBe(true);
  });

  it("never reloads over unsaved input, even when hidden", () => {
    expect(shouldReload({ ...base, busy: "unsaved" })).toBe(false);
    expect(shouldReload({ ...base, busy: "unsaved", hidden: true })).toBe(false);
  });
});

describe("shouldCheck", () => {
  it("checks the first time", () => {
    expect(shouldCheck(0, null)).toBe(true);
  });

  it("throttles to once a minute", () => {
    expect(shouldCheck(1000 + CHECK_INTERVAL_MS - 1, 1000)).toBe(false);
    expect(shouldCheck(1000 + CHECK_INTERVAL_MS, 1000)).toBe(true);
  });
});
