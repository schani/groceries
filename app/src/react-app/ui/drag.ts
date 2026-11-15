import type { Ctx, Drag } from "./context";
import { shapeGroup } from "./rows";

/** Reorder with the grip: pointer events, confined to the row's block. */
export function installDrag(c: Ctx): void {
  const { scroller } = c.el;

  c.startDrag = (e, li, grip) => {
    e.preventDefault();
    if (c.reflowTimer) c.reflow(false); // settle pending check moves first
    if (!li.getClientRects().length) return; // it just tucked into the collapsed stack
    if (c.openId) c.collapse(c.cellById(c.openId), true);
    c.closeReveal(true);
    const group = li.parentElement!;
    const cells = c.live(group);
    const i = cells.indexOf(li);
    if (i < 0) return;
    const metrics = cells.map((x) => ({ top: x.offsetTop, h: x.offsetHeight }));
    c.drag = { li, group, i, target: i, cards: cells, metrics, startY: e.clientY, lastY: e.clientY, startScroll: scroller.scrollTop, pid: e.pointerId, raf: 0 };
    try { grip.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    li.classList.add("dragging");
    li.style.transform = "translate3d(0,0,0) scale(1.03)";
    cells.forEach((x) => { if (x !== li) x.classList.add("shift"); });
    c.haptic();
    c.drag.raf = requestAnimationFrame(autoScroll);
  };

  function visualOrder(d: Drag) {
    const rest = d.cards.filter((x) => x !== d.li);
    rest.splice(d.target, 0, d.li);
    return rest;
  }

  c.dragMove = () => {
    const d = c.drag!, m = d.metrics, self = m[d.i];
    let dy = d.lastY - d.startY + (scroller.scrollTop - d.startScroll);
    const minDy = m[0].top - self.top, last = m[m.length - 1];
    const maxDy = last.top + last.h - self.h - self.top;
    if (dy < minDy) dy = minDy - Math.sqrt(minDy - dy) * 2;
    if (dy > maxDy) dy = maxDy + Math.sqrt(dy - maxDy) * 2;
    d.li.style.transform = `translate3d(0,${dy}px,0) scale(1.03)`;
    const center = self.top + dy + self.h / 2;
    let t = d.i;
    for (let j = d.i + 1; j < m.length; j++) if (center > m[j].top + m[j].h / 2) t = j;
    for (let j = d.i - 1; j >= 0; j--) if (center < m[j].top + m[j].h / 2) t = j;
    if (t !== d.target) {
      d.target = t;
      c.haptic();
      d.cards.forEach((x, j) => {
        if (j === d.i) return;
        let s = 0;
        if (t > d.i && j > d.i && j <= t) s = -self.h;
        else if (t < d.i && j < d.i && j >= t) s = self.h;
        x.style.transform = s ? `translate3d(0,${s}px,0)` : "";
      });
      shapeGroup(visualOrder(d)); // corners + separators follow the visual order
    }
  };

  function autoScroll() {
    if (!c.drag) return;
    const sr = scroller.getBoundingClientRect();
    const topEdge = sr.top + c.topInset() + 60;
    const botEdge = sr.top + c.composerTop() - 50;
    const y = c.drag.lastY;
    let v = 0;
    if (y < topEdge) v = -Math.min(1, (topEdge - y) / 90);
    else if (y > botEdge) v = Math.min(1, (y - botEdge) / 90);
    if (v) {
      const before = scroller.scrollTop;
      scroller.scrollTop += v * v * Math.sign(v) * 14 + Math.sign(v) * 2;
      if (scroller.scrollTop !== before) c.dragMove();
    }
    c.drag.raf = requestAnimationFrame(autoScroll);
  }

  c.endDrag = () => {
    const d = c.drag!;
    c.drag = null;
    c.settling = true;
    cancelAnimationFrame(d.raf);
    const m = d.metrics, self = m[d.i];
    let final = 0;
    if (d.target > d.i) final = m[d.target].top + m[d.target].h - self.h - self.top;
    else if (d.target < d.i) final = m[d.target].top - self.top;
    d.li.classList.add("settling");
    d.li.classList.remove("dragging");
    d.li.style.transform = `translate3d(0,${final}px,0)`;
    setTimeout(() => {
      c.settling = false;
      const order = visualOrder(d);
      const k = order.indexOf(d.li);
      if (d.target !== d.i) {
        // anchored on the nearest block neighbours, following ones first
        const ids = (cells: HTMLElement[]) => cells.map((x) => x.dataset.id!);
        c.store.move(d.li.dataset.id!, ids(order.slice(0, k).reverse()), ids(order.slice(k + 1)));
      }
      d.group.classList.add("no-anim");
      d.cards.forEach((x) => { x.classList.remove("shift", "settling"); x.style.transform = ""; });
      const ref = order[k + 1] || null;
      d.group.insertBefore(d.li, ref && ref.parentElement === d.group ? ref : null);
      c.updateShapes();
      d.group.getBoundingClientRect();
      d.group.classList.remove("no-anim");
    }, c.dur(300));
  };
}
