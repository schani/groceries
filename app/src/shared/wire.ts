// Wire format shared by the worker and the web app.

export interface Item {
  id: string;
  name: string;
  description: string;
  /** Storage key of the photo (served at /api/photos/:key), or null. */
  photo: string | null;
  checked: boolean;
  /** Fractional-index sort key; global order is (pos, id). */
  pos: string;
}

export interface Snapshot {
  version: number;
  items: Item[];
}

export interface Unchanged {
  version: number;
  unchanged: true;
}

export type ListResponse = Snapshot | Unchanged;

export interface ItemFields {
  name?: string;
  description?: string;
  checked?: boolean;
  pos?: string;
  photo?: string | null;
}

export type AddOp = {
  type: "add";
  id: string;
  name: string;
  pos: string;
  description?: string;
  photo?: string | null;
  checked?: boolean;
};
export type SetOp = { type: "set"; id: string; fields: ItemFields };
export type RemoveOp = { type: "remove"; id: string };
export type Op = AddOp | SetOp | RemoveOp;

export interface OpsRequest {
  ops: Op[];
}

export const LIMITS = {
  name: 200,
  description: 2000,
  pos: 200,
  opsPerRequest: 200,
  photoBytes: 2 * 1024 * 1024,
  opsBodyBytes: 256 * 1024,
} as const;

export const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
/** Base-62 digits, never ending in the zero digit (a fractional-index invariant). */
export const POS_RE = /^[0-9A-Za-z]*[1-9A-Za-z]$/;

export const byPos = (a: Item, b: Item): number =>
  a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
