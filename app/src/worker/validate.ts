import { ID_RE, LIMITS, POS_RE, type ItemFields, type Op } from "../shared/wire.js";

/** An error that maps to an HTTP status. */
export class HttpProblem extends Error {
  constructor(readonly status: 400 | 411 | 413 | 415, message: string) {
    super(message);
  }
}

export class ValidationError extends HttpProblem {
  constructor(message: string) {
    super(400, message);
  }
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function fail(msg: string): never {
  throw new ValidationError(msg);
}

function onlyKeys(o: Obj, allowed: readonly string[], where: string) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`${where}: unknown field "${k}"`);
}

export function isId(v: unknown): v is string {
  return typeof v === "string" && ID_RE.test(v);
}

function id(v: unknown, where: string): string {
  if (!isId(v)) fail(`${where}: invalid id`);
  return v;
}

function name(v: unknown, where: string): string {
  if (typeof v !== "string") fail(`${where}: name must be a string`);
  const s = v.trim();
  if (s.length < 1 || s.length > LIMITS.name) fail(`${where}: name must be 1-${LIMITS.name} characters`);
  return s;
}

function description(v: unknown, where: string): string {
  if (typeof v !== "string" || v.length > LIMITS.description) {
    fail(`${where}: description must be a string of at most ${LIMITS.description} characters`);
  }
  return v;
}

function pos(v: unknown, where: string): string {
  if (typeof v !== "string" || v.length > LIMITS.pos || !POS_RE.test(v)) fail(`${where}: invalid pos`);
  return v;
}

function photo(v: unknown, where: string): string | null {
  if (v === null) return null;
  return id(v, `${where} photo`);
}

function bool(v: unknown, where: string): boolean {
  if (typeof v !== "boolean") fail(`${where}: checked must be a boolean`);
  return v;
}

function fields(v: unknown, where: string): ItemFields {
  if (!isObj(v)) fail(`${where}: fields must be an object`);
  onlyKeys(v, ["name", "description", "checked", "pos", "photo"], where);
  const f: ItemFields = {};
  if (v.name !== undefined) f.name = name(v.name, where);
  if (v.description !== undefined) f.description = description(v.description, where);
  if (v.checked !== undefined) f.checked = bool(v.checked, where);
  if (v.pos !== undefined) f.pos = pos(v.pos, where);
  if (v.photo !== undefined) f.photo = photo(v.photo, where);
  if (!Object.keys(f).length) fail(`${where}: no fields`);
  return f;
}

function op(v: unknown, i: number): Op {
  const where = `ops[${i}]`;
  if (!isObj(v)) fail(`${where}: must be an object`);
  switch (v.type) {
    case "add": {
      onlyKeys(v, ["type", "id", "name", "pos", "description", "photo", "checked"], where);
      const o: Op = { type: "add", id: id(v.id, where), name: name(v.name, where), pos: pos(v.pos, where) };
      if (v.description !== undefined) o.description = description(v.description, where);
      if (v.photo !== undefined) o.photo = photo(v.photo, where);
      if (v.checked !== undefined) o.checked = bool(v.checked, where);
      return o;
    }
    case "set":
      onlyKeys(v, ["type", "id", "fields"], where);
      return { type: "set", id: id(v.id, where), fields: fields(v.fields, where) };
    case "remove":
      onlyKeys(v, ["type", "id"], where);
      return { type: "remove", id: id(v.id, where) };
    default:
      fail(`${where}: unknown type`);
  }
}

export function parseOpsRequest(body: unknown): Op[] {
  if (!isObj(body)) fail("body must be an object");
  onlyKeys(body, ["ops"], "body");
  if (!Array.isArray(body.ops)) fail("ops must be an array");
  if (body.ops.length > LIMITS.opsPerRequest) fail(`at most ${LIMITS.opsPerRequest} ops per request`);
  return body.ops.map(op);
}

export function parseSince(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  if (!/^\d{1,15}$/.test(v)) fail("since must be a non-negative integer");
  return Number(v);
}

/** Reads the request body, refusing anything over `max` bytes before or while reading it. */
export async function readBody(req: Request, max: number, requireLength: boolean): Promise<Uint8Array> {
  const header = req.headers.get("Content-Length");
  if (header === null ? requireLength : !/^\d{1,10}$/.test(header)) {
    throw new HttpProblem(411, "a valid Content-Length is required");
  }
  if (header !== null && Number(header) > max) throw new HttpProblem(413, "body too large");
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new HttpProblem(413, "body too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
