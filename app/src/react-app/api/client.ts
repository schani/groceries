import type { ListResponse, Op, Snapshot } from "../../shared/wire";

/** Server answered with a non-2xx status. `status` < 500 means the request itself is bad. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      // non-JSON error body
    }
    throw new HttpError(res.status, msg);
  }
  return res;
}

export async function getList(since?: number): Promise<ListResponse> {
  const q = since === undefined ? "" : `?since=${since}`;
  return (await request(`/api/list${q}`)).json() as Promise<ListResponse>;
}

export async function postOps(ops: Op[]): Promise<Snapshot> {
  const res = await request("/api/ops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops }),
  });
  return res.json() as Promise<Snapshot>;
}

export async function putPhoto(key: string, jpeg: Blob): Promise<void> {
  await request(`/api/photos/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: jpeg,
  });
}

export const photoUrl = (key: string): string => `/api/photos/${encodeURIComponent(key)}`;
