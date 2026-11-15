import { storage } from "flingit";

export interface Photo {
  body: ReadableStream<Uint8Array>;
  size: number;
  etag: string;
}

export interface PhotoStore {
  /** Stores the JPEG unless the key already exists (keys are write-once). */
  put(key: string, jpeg: ArrayBuffer): Promise<void>;
  get(key: string): Promise<Photo | null>;
  exists(key: string): Promise<boolean>;
  /** Every stored photo with its upload time. */
  list(): Promise<{ key: string; uploaded: Date }[]>;
  delete(keys: string[]): Promise<void>;
}

const PREFIX = "photos/";
const path = (key: string) => PREFIX + key;

export const photoStore: PhotoStore = {
  async put(key, jpeg) {
    if (await storage.head(path(key))) return;
    await storage.put(path(key), jpeg, { contentType: "image/jpeg" });
  },
  async get(key) {
    const o = await storage.get(path(key));
    return o ? { body: o.body, size: o.size, etag: o.etag } : null;
  },
  async exists(key) {
    return !!(await storage.head(path(key)));
  },
  async list() {
    const out: { key: string; uploaded: Date }[] = [];
    let cursor: string | undefined;
    do {
      const page = await storage.list({ prefix: PREFIX, cursor, limit: 1000 });
      for (const o of page.objects) out.push({ key: o.key.slice(PREFIX.length), uploaded: new Date(o.uploaded) });
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return out;
  },
  async delete(keys) {
    if (keys.length) await storage.delete(keys.map(path));
  },
};
