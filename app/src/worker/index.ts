import { app, cron } from "flingit";
import { LIMITS } from "../shared/wire.js";
import { diagRepo, registerDiagMigrations } from "./diag-repo.js";
import { createDiagService } from "./diag-service.js";
import { listRepo, registerMigrations } from "./list-repo.js";
import { createListService } from "./list-service.js";
import { photoStore } from "./photo-store.js";
import { HttpProblem, ValidationError, isId, parseDiagReport, parseOpsRequest, parseSince, readBody } from "./validate.js";

registerMigrations();
registerDiagMigrations();

const service = createListService(listRepo, photoStore);
const diag = createDiagService(diagRepo);
const NO_STORE = { "Cache-Control": "no-store" };

app.onError((err, c) => {
  if (err instanceof HttpProblem) return c.json({ error: err.message }, err.status, NO_STORE);
  console.error(err);
  return c.json({ error: "Internal error" }, 500, NO_STORE);
});

app.get("/api/list", async (c) => {
  const since = parseSince(c.req.query("since"));
  return c.json(await service.list(since), 200, NO_STORE);
});

app.post("/api/ops", async (c) => {
  const bytes = await readBody(c.req.raw, LIMITS.opsBodyBytes, false);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ValidationError("body must be JSON");
  }
  const ops = parseOpsRequest(body);
  return c.json(await service.apply(ops), 200, NO_STORE);
});

// temporary: device measurements from the installed app, read back with the CLI's SQL command
app.post("/api/diag", async (c) => {
  const bytes = await readBody(c.req.raw, LIMITS.diagBodyBytes, false);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ValidationError("body must be JSON");
  }
  await diag.record(parseDiagReport(body));
  return c.json({ ok: true }, 200, NO_STORE);
});

app.put("/api/photos/:key", async (c) => {
  const key = c.req.param("key");
  if (!isId(key)) throw new ValidationError("invalid photo key");
  const type = (c.req.header("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "image/jpeg") throw new HttpProblem(415, "only image/jpeg is accepted");
  const bytes = await readBody(c.req.raw, LIMITS.photoBytes, true);
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new ValidationError("body is not a JPEG");
  }
  await service.putPhoto(key, bytes.buffer as ArrayBuffer);
  return c.json({ key }, 200, NO_STORE);
});

app.get("/api/photos/:key", async (c) => {
  const key = c.req.param("key");
  if (!isId(key)) throw new ValidationError("invalid photo key");
  const photo = await service.getPhoto(key);
  if (!photo) return c.json({ error: "not found" }, 404, NO_STORE);
  return new Response(photo.body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(photo.size),
      ETag: photo.etag,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

cron("photo-gc", "17 4 * * *", () => service.collectPhotoGarbage(Date.now()));
