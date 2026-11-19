import type { DiagRepo } from "./diag-repo.js";

export const DIAG_KEEP = 50;

export interface DiagService {
  record(report: Record<string, unknown>): Promise<void>;
}

export function createDiagService(repo: DiagRepo, clock: () => number = Date.now): DiagService {
  return {
    async record(report) {
      await repo.add(JSON.stringify(report), clock(), DIAG_KEEP);
    },
  };
}
