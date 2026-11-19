import type { Ctx } from "./context";
import { EASE, SPRING_HI } from "./motion";

// the pile's i-th layer: 5% smaller per step, but no more than 10px a side once rows are wider than 400px
const layerScale = (i: number, w: number) => `scale(${1 - i * Math.min(0.05, 20 / w)},${1 - i * 0.05})`;

/** Batched check/uncheck reflow and the collapsible "Checked" stack. */
export function installStack(c: Ctx): void {
  const { app, scroller, g0, g1, stack, stackHead, pile, pileFront, pileSub, pileCount, lessBtn } = c.el;

  // the pile shows what is in the checked block, minus rows still flying into it
  c.updatePile = () => {
    const cells = c.live(g1).filter((x) => !c.landing.has(x));
    const n = cells.length;
    stack.dataset.n = String(Math.min(n, 2));
    pileCount.textContent = String(n);
    pileSub.textContent = cells.map((x) => c.findItem(x.dataset.id)?.name).filter(Boolean).join(", ");
    pile.setAttribute("aria-label", `${n} checked item${n === 1 ? "" : "s"}. Show all`);
  };

  c.setFanned = (v) => {
    c.fanned = v;
    stack.classList.toggle("fanned", v);
    pile.setAttribute("aria-expanded", String(v));
  };

  function fadeHead(r: DOMRect) {
    if (c.reduced()) return;
    const g = c.ghostOf(stackHead, r);
    g.style.display = "flex";
    g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out", fill: "both" }).onfinish = () => g.remove();
  }

  function bumpPile() {
    if (c.reduced()) return;
    pileCount.animate([{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 420, easing: SPRING_HI });
    pileFront.animate([{ transform: "translate3d(0,3px,0) scale(.985)" }, { transform: "none" }], { duration: 480, easing: SPRING_HI });
  }

  c.scheduleReflow = (delay = 500) => {
    clearTimeout(c.reflowTimer);
    c.reflowTimer = window.setTimeout(c.tryReflow, delay);
  };

  const typingInRow = () => app.classList.contains("editing");

  c.tryReflow = () => {
    // never move rows while a finger is down on the list or someone is typing in a row
    if (c.gesture || c.drag || c.settling || typingInRow()) {
      c.reflowTimer = window.setTimeout(c.tryReflow, 250);
      return;
    }
    c.reflow(true);
  };

  c.reflow = (animate) => {
    clearTimeout(c.reflowTimer);
    c.reflowTimer = 0;
    const anim = animate && !c.reduced();
    const movers = new Set<Element>();
    const going: { c: HTMLElement; r: DOMRect }[] = [];
    const wasVisible = !stack.hidden;
    const headR = c.fanned ? stackHead.getBoundingClientRect() : null;
    const items = c.store.items();
    // rows checked while the stack is collapsed fly into it as ghosts
    if (!c.fanned) for (const it of items) {
      const cell = c.cellById(it.id);
      if (!it.checked || !cell || cell.parentElement !== g0 || cell.classList.contains("removing")) continue;
      if (c.openId === it.id) c.collapse(cell, true);
      if (c.revealed === cell) c.closeReveal(true);
      going.push({ c: cell, r: cell.getBoundingClientRect() });
    }
    if (anim && wasVisible) going.forEach(({ c: x }) => c.landing.add(x));
    const stick = c.atBottom();
    const place = () => {
      for (const it of items) {
        const cell = c.cellById(it.id);
        if (!cell) continue;
        const g = it.checked ? g1 : g0;
        if (cell.parentElement !== g) {
          movers.add(cell);
          // out of the collapsed stack: nothing to slide from, so spring in instead
          if (anim && !c.fanned && g === g0) {
            cell.classList.add("enter");
            setTimeout(() => cell.classList.remove("enter"), 600);
          }
        }
        g.appendChild(cell);
      }
      c.updateShapes();
      if (stick) c.scrollToBottom();
    };
    if (animate) c.flipAll(place, movers);
    else place();
    if (!anim) return;
    if (headR && !c.fanned) fadeHead(headR); // last checked row left the fanned block
    if (!going.length || stack.hidden) return;
    const pr = pileFront.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
    const D = 500, STAG = 55;
    const flying = going.filter(({ r }) => r.bottom > sr.top && r.top < sr.bottom).slice(-7);
    flying.forEach(({ c: cell, r }, j) => {
      const g = c.ghostOf(cell, r);
      const dy = pr.top - r.top;
      const a = g.animate([
        { transform: "none", opacity: 1, offset: 0 },
        { transform: `translate3d(0,${dy * 0.35}px,0) scale(.985)`, opacity: 1, offset: 0.35 },
        { transform: `translate3d(0,${dy}px,0) scale(.94)`, opacity: 0, offset: 1 },
      ], { duration: D, delay: j * STAG, easing: "cubic-bezier(.5,0,.3,1)", fill: "both" });
      a.onfinish = a.oncancel = () => g.remove();
    });
    const land = D + Math.max(0, flying.length - 1) * STAG - 120;
    if (!wasVisible) pile.animate([{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: land - 60, easing: SPRING_HI, fill: "backwards" });
    setTimeout(() => {
      going.forEach(({ c: x }) => c.landing.delete(x));
      const pin = c.atBottom(), t0 = performance.now();
      c.updatePile();
      bumpPile();
      // the peeking edges can grow the pile; stay pinned while they slide in
      const follow = () => { c.scrollToBottom(); if (performance.now() - t0 < 400) requestAnimationFrame(follow); };
      if (pin) follow();
    }, land);
  };

  c.openStack = () => {
    if (c.fanned || stack.hidden) return;
    if (c.reflowTimer) c.reflow(false);
    if (stack.hidden) return;
    c.closeReveal(true);
    const pr = pileFront.getBoundingClientRect();
    c.flipAll(() => {
      c.setFanned(true);
      // keep the header on screen and reveal as much of the fanned list as fits
      const sr = scroller.getBoundingClientRect(), hr = stackHead.getBoundingClientRect();
      const max = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = Math.max(0, Math.min(max, scroller.scrollTop + (hr.top - sr.top) - (c.topInset() + 8)));
    });
    c.haptic();
    if (c.reduced()) return;
    const cells = c.live(g1);
    g1.classList.add("fanning");
    setTimeout(() => g1.classList.remove("fanning"), 260);
    cells.forEach((cell, j) => {
      const r = cell.getBoundingClientRect(), i = Math.min(j, 2);
      const dy = pr.top + i * 7 - r.top;
      cell.style.zIndex = String(cells.length - j);
      const a = cell.animate([
        { transform: `translate3d(0,${dy}px,0) ${layerScale(i, r.width)}`, opacity: j < 3 ? 1 : 0 },
        { transform: "none", opacity: 1 },
      ], { duration: 640, delay: Math.min(j, 8) * 26, easing: SPRING_HI, fill: "backwards" });
      a.onfinish = a.oncancel = () => { cell.style.zIndex = ""; };
    });
    stackHead.animate([{ opacity: 0, transform: "translate3d(0,10px,0)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: 80, easing: EASE, fill: "backwards" });
  };

  c.closeStack = () => {
    if (!c.fanned) return;
    if (c.reflowTimer) c.reflow(false);
    if (!c.fanned) return;
    const o = c.cellById(c.openId);
    if (o && g1.contains(o)) c.collapse(o, true);
    if (c.revealed && g1.contains(c.revealed)) c.closeReveal(true);
    const sr = scroller.getBoundingClientRect();
    const cells = c.live(g1).map((x) => ({ c: x, r: x.getBoundingClientRect() }));
    const headR = stackHead.getBoundingClientRect();
    c.flipAll(() => { c.setFanned(false); c.updatePile(); });
    c.haptic();
    if (c.reduced()) return;
    const pr = pileFront.getBoundingClientRect();
    fadeHead(headR);
    pile.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 180, easing: "ease-out", fill: "backwards" });
    cells.forEach(({ c: cell, r }, j) => {
      if (r.bottom < sr.top || r.top > sr.bottom) return;
      const i = Math.min(j, 2);
      const g = c.ghostOf(cell, r);
      const dy = pr.top + i * 7 - r.top;
      const a = g.animate([
        { transform: "none", opacity: 1 },
        { transform: `translate3d(0,${dy}px,0) ${layerScale(i, r.width)}`, opacity: 0 },
      ], { duration: 420, easing: EASE, fill: "both" });
      a.onfinish = a.oncancel = () => g.remove();
    });
  };

  pile.addEventListener("click", (e) => { if (e.detail && c.swallow != null) return; c.openStack(); });
  lessBtn.addEventListener("click", (e) => { if (e.detail && c.swallow != null) return; c.closeStack(); });
}
