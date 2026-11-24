import type { Item } from "../../shared/wire";
import type { ListStore } from "../store/store";
import type { Els } from "./dom";

export interface Gesture {
  li: HTMLElement;
  row: HTMLElement;
  thumb: boolean;
  base: number;
  x: number;
  y: number;
  pid: number;
  mode: "pending" | "swipe";
  dx: number;
  lastX: number;
  lastT: number;
  v: number;
  w?: number;
  pressTimer?: number;
}

export interface Drag {
  li: HTMLElement;
  group: HTMLElement;
  i: number;
  target: number;
  cards: HTMLElement[];
  metrics: { top: number; h: number }[];
  startY: number;
  lastY: number;
  startScroll: number;
  pid: number;
  raf: number;
}

/** Shared state and late-bound functions of the list view; each ui module installs its part. */
export interface Ctx {
  el: Els;
  store: ListStore;
  signal: AbortSignal;

  openId: string | null;
  revealed: HTMLElement | null;
  gesture: Gesture | null;
  drag: Drag | null;
  /** a dropped row is still gliding into its slot */
  settling: boolean;
  /** the share sheet is open */
  sharing: boolean;
  swallow: number | null;
  dismiss: { pid: number; x: number; y: number } | null;
  fanned: boolean;
  kb: number;
  reflowTimer: number;
  /** checked rows still flying into the collapsed stack */
  landing: Set<Element>;

  // core (list-view)
  reduced(): boolean;
  dur(ms: number): number;
  haptic(): void;
  src(key: string): string;
  findItem(id: string | undefined): Item | undefined;
  allCells(): HTMLElement[];
  cellById(id: string | null | undefined): HTMLElement | null;
  live(g: HTMLElement): HTMLElement[];
  updateShapes(): void;
  topInset(): number;
  composerTop(): number;
  atBottom(): boolean;
  scrollToBottom(): void;
  layoutPad(stick?: boolean): void;
  ensureVisible(el: Element, margin?: number, smooth?: boolean): void;
  removeCell(li: HTMLElement, swiped: boolean): void;
  removeCellDom(li: HTMLElement, swiped: boolean): void;
  toggleChecked(li: HTMLElement): void;

  // motion
  flipAll(mutate: () => void, movers?: Set<Element>): void;
  ghostOf(el: HTMLElement, r: DOMRect): HTMLElement;

  // stack
  updatePile(): void;
  setFanned(v: boolean): void;
  scheduleReflow(delay?: number): void;
  tryReflow(): void;
  reflow(animate: boolean): void;
  openStack(): void;
  closeStack(): void;

  // editor
  expand(li: HTMLElement): void;
  collapse(li: HTMLElement | null, instant?: boolean): void;
  refreshEditor(li: HTMLElement, it: Item): void;

  // swipe
  setSlide(li: HTMLElement, x: number, cls?: "snap" | "fly"): void;
  openReveal(li: HTMLElement): void;
  closeReveal(instant?: boolean): void;
  fullDelete(li: HTMLElement): void;

  // drag
  startDrag(e: PointerEvent, li: HTMLElement, grip: HTMLElement): void;
  dragMove(): void;
  endDrag(): void;

  // viewer
  openViewer(li: HTMLElement): void;
  closeViewer(): void;
}
