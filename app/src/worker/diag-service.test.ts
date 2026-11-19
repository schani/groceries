import { describe, expect, it } from "vitest";
import type { DiagRepo } from "./diag-repo.js";
import { DIAG_KEEP, createDiagService } from "./diag-service.js";

/** In-memory stand-in with the same semantics as the SQL in diag-repo. */
function memoryRepo(): DiagRepo & { rows: { id: number; created_at: number; body: string }[] } {
  const rows: { id: number; created_at: number; body: string }[] = [];
  let next = 1;
  return {
    rows,
    async add(body, now, keep) {
      rows.push({ id: next++, created_at: now, body });
      rows.splice(0, Math.max(0, rows.length - keep));
    },
  };
}

describe("diag service", () => {
  it("stores the report as JSON with a timestamp", async () => {
    const repo = memoryRepo();
    await createDiagService(repo, () => 1234).record({ innerHeight: 812.5, standalone: true });
    expect(repo.rows).toEqual([{ id: 1, created_at: 1234, body: '{"innerHeight":812.5,"standalone":true}' }]);
  });

  it("keeps only the newest reports", async () => {
    const repo = memoryRepo();
    const diag = createDiagService(repo);
    for (let i = 0; i < DIAG_KEEP + 7; i++) await diag.record({ i });
    expect(DIAG_KEEP).toBe(50);
    expect(repo.rows).toHaveLength(50);
    expect(JSON.parse(repo.rows[0].body)).toEqual({ i: 7 });
    expect(JSON.parse(repo.rows[49].body)).toEqual({ i: 56 });
  });
});
