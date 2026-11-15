import type { Ctx } from "./context";

export const SPRING_HI = "cubic-bezier(.34,1.32,.64,1)";
export const EASE = "cubic-bezier(.32,.72,0,1)";

type Flippable = HTMLElement & { _flipT?: number };

export function installMotion(c: Ctx): void {
  const { stackHead, pile, emptyEl, content } = c.el;

  c.flipAll = (mutate, movers) => {
    const els: Flippable[] = [...c.allCells(), stackHead, pile, emptyEl];
    const before = new Map<Flippable, number>();
    for (const e of els) {
      const r = e.getBoundingClientRect();
      if (r.height) before.set(e, r.top);
    }
    mutate();
    if (c.reduced()) return;
    for (const [e, t] of before) {
      if (!e.isConnected) { before.delete(e); continue; }
      const r = e.getBoundingClientRect();
      if (!r.height) { before.delete(e); continue; }
      const d = t - r.top;
      if (Math.abs(d) < 1) continue;
      e.classList.remove("flip");
      if (movers && movers.has(e)) e.classList.add("mover");
      e.style.transform = `translate3d(0,${d}px,0)`;
    }
    document.body.getBoundingClientRect();
    for (const [e] of before) {
      if (!e.style.transform || !e.isConnected) continue;
      e.classList.add("flip");
      e.style.transform = "";
      clearTimeout(e._flipT);
      e._flipT = window.setTimeout(() => e.classList.remove("flip", "mover"), 560);
    }
  };
  stackHead.style.transition = "transform .52s var(--spring-soft)";
  pile.style.transition = "transform .52s var(--spring-soft),padding .35s var(--ease)";
  emptyEl.style.transition = "transform .52s var(--spring-soft)";

  // absolutely positioned clone of el at viewport rect r, for flights out of hidden blocks
  c.ghostOf = (el, r) => {
    const cr = content.getBoundingClientRect();
    const g = el.cloneNode(true) as HTMLElement;
    g.classList.remove("pressed", "open", "enter", "flip", "mover", "armed", "snap", "fly", "shift", "first", "last");
    g.classList.add("ghost");
    g.removeAttribute("id");
    g.removeAttribute("data-id");
    g.setAttribute("aria-hidden", "true");
    g.style.cssText = `left:${r.left - cr.left}px;top:${r.top - cr.top}px;width:${r.width}px;height:${r.height}px;transform:none;transition:none`;
    content.appendChild(g);
    return g;
  };
}
