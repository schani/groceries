import { describe, expect, it } from "vitest";
import { HttpError } from "../api/client";
import { isPermanent } from "./store";

describe("retry policy", () => {
  it("drops ops only on statuses that can never succeed", () => {
    for (const s of [400, 413, 415, 422]) expect(isPermanent(new HttpError(s, ""))).toBe(true);
  });

  it("retries timeouts, rate limits, other 4xx, 5xx and network errors", () => {
    for (const s of [401, 403, 404, 408, 409, 429, 500, 502, 503]) expect(isPermanent(new HttpError(s, ""))).toBe(false);
    expect(isPermanent(new TypeError("Failed to fetch"))).toBe(false);
  });
});
