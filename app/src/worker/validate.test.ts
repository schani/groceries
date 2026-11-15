import { describe, expect, it } from "vitest";
import { HttpProblem, ValidationError, parseOpsRequest, parseSince, readBody } from "./validate.js";

const bad = (body: unknown) => expect(() => parseOpsRequest(body)).toThrow(ValidationError);

describe("parseOpsRequest", () => {
  it("accepts and normalises valid ops", () => {
    const ops = parseOpsRequest({
      ops: [
        { type: "add", id: "abcdefgh", name: "  Milk ", pos: "V", photo: null },
        { type: "set", id: "abcdefgh", fields: { checked: true, description: "2%" } },
        { type: "remove", id: "abcdefgh" },
      ],
    });
    expect(ops[0]).toEqual({ type: "add", id: "abcdefgh", name: "Milk", pos: "V", photo: null });
    expect(ops).toHaveLength(3);
  });

  it("rejects malformed input", () => {
    bad(null);
    bad({ ops: "x" });
    bad({ ops: [], extra: 1 });
    bad({ ops: [{ type: "nope", id: "abcdefgh" }] });
    bad({ ops: [{ type: "add", id: "short", name: "x", pos: "V" }] });
    bad({ ops: [{ type: "add", id: "abcdefgh", name: "   ", pos: "V" }] });
    bad({ ops: [{ type: "add", id: "abcdefgh", name: "x".repeat(201), pos: "V" }] });
    bad({ ops: [{ type: "add", id: "abcdefgh", name: "x", pos: "V0" }] });
    bad({ ops: [{ type: "add", id: "abcdefgh", name: "x", pos: "V!" }] });
    bad({ ops: [{ type: "add", id: "abcdefgh", name: "x", pos: "V", color: "red" }] });
    bad({ ops: [{ type: "set", id: "abcdefgh", fields: {} }] });
    bad({ ops: [{ type: "set", id: "abcdefgh", fields: { checked: "yes" } }] });
    bad({ ops: [{ type: "set", id: "abcdefgh", fields: { description: "x".repeat(2001) } }] });
    bad({ ops: [{ type: "set", id: "abcdefgh", fields: { photo: "../etc" } }] });
    bad({ ops: Array.from({ length: 201 }, () => ({ type: "remove", id: "abcdefgh" })) });
  });

  it("parses since", () => {
    expect(parseSince(undefined)).toBeUndefined();
    expect(parseSince("12")).toBe(12);
    expect(() => parseSince("-1")).toThrow(ValidationError);
  });
});

describe("readBody", () => {
  const req = (body: BodyInit | null, headers: Record<string, string> = {}) =>
    new Request("http://x/", { method: "PUT", body, headers, duplex: "half" } as RequestInit);
  const stream = (n: number) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < n; i++) c.enqueue(new Uint8Array(1000));
        c.close();
      },
    });
  const status = (p: Promise<unknown>) => p.then(() => 200, (e: HttpProblem) => e.status);

  it("reads bodies within the cap", async () => {
    expect((await readBody(req("hello", { "Content-Length": "5" }), 10, true)).length).toBe(5);
    expect((await readBody(req(stream(3)), 5000, false)).length).toBe(3000);
  });

  it("rejects missing, invalid or oversized lengths up front", async () => {
    expect(await status(readBody(req(stream(1)), 5000, true))).toBe(411);
    expect(await status(readBody(req("x", { "Content-Length": "abc" }), 10, false))).toBe(411);
    expect(await status(readBody(req("x", { "Content-Length": "999" }), 10, false))).toBe(413);
  });

  it("stops reading once the cap is exceeded", async () => {
    expect(await status(readBody(req(stream(50)), 5000, false))).toBe(413);
  });
});
