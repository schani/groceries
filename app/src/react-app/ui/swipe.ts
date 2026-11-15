import type { Ctx } from "./context";
import { $ } from "./dom";

export const REV = 148; // revealed width (two 74px buttons)

type Cell = HTMLElement & { _snapT?: number };

/** Swipe-left actions (Edit / Delete) behind each row. */
export function installSwipe(c: Ctx): void {
  const { g0, g1, scroller } = c.el;

  c.setSlide = (li: Cell, x, cls) => {
    const slide = $(".slide", li), acts = $(".acts", li);
    if (cls) { li.classList.remove("snap", "fly"); li.classList.add(cls); }
    slide.style.transform = x ? `translate3d(${x}px,0,0)` : "";
    acts.style.width = Math.max(0, -x) + "px";
    if (cls) {
      clearTimeout(li._snapT);
      li._snapT = window.setTimeout(() => li.classList.remove(cls), c.dur(cls === "fly" ? 230 : 440));
    }
  };

  c.openReveal = (li) => {
    if (c.revealed && c.revealed !== li) c.closeReveal();
    c.revealed = li;
    li.classList.remove("armed");
    c.setSlide(li, -REV, "snap");
    $(".act-edit", li).tabIndex = 0;
    $(".act-del", li).tabIndex = 0;
  };

  c.closeReveal = (instant) => {
    const li = c.revealed;
    if (!li) return;
    c.revealed = null;
    li.classList.remove("armed");
    if (instant) { li.classList.add("no-anim"); c.setSlide(li, 0); li.getBoundingClientRect(); li.classList.remove("no-anim"); }
    else c.setSlide(li, 0, "snap");
    $(".act-edit", li).tabIndex = -1;
    $(".act-del", li).tabIndex = -1;
  };

  c.fullDelete = (li) => {
    if (c.revealed === li) c.revealed = null;
    li.classList.add("armed");
    c.setSlide(li, -li.offsetWidth - 2, "fly");
    setTimeout(() => c.removeCell(li, true), c.dur(200));
  };

  function onActClick(e: MouseEvent) {
    const btn = (e.target as Element).closest(".act");
    if (!btn) return;
    const li = btn.closest<HTMLElement>(".cell")!;
    if (btn.classList.contains("act-del")) c.fullDelete(li);
    else { c.closeReveal(); c.expand(li); }
  }
  g0.addEventListener("click", onActClick);
  g1.addEventListener("click", onActClick);
  scroller.addEventListener("scroll", () => { if (c.revealed && !c.gesture) c.closeReveal(); }, { passive: true });
}
