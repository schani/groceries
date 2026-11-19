import type { Item } from "../../shared/wire";
import type { ChangeSource, ListStore } from "../store/store";
import { installComposer } from "./composer";
import type { Ctx } from "./context";
import { $, buildDom } from "./dom";
import { installDrag } from "./drag";
import { installEditor } from "./editor";
import { installMotion } from "./motion";
import { cellEl, fillRow, shapeGroup } from "./rows";
import { installStack } from "./stack";
import { REV, installSwipe } from "./swipe";
import { installViewer } from "./viewer";
import "./styles.css";

export interface ListView {
  /** "unsaved": a reload now would lose input; "interacting": the user is mid-action */
  busy(): "idle" | "interacting" | "unsaved";
  destroy(): void;
}

export function mountListView(container: HTMLElement, store: ListStore): ListView {
  const el = buildDom(container);
  const { app, scroller, content, g0, g1, emptyEl, emptyTitle, emptyText, topfade, stack, composer, viewer, input } = el;
  const ac = new AbortController();
  const signal = ac.signal;
  const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");

  const c = {
    el, store, signal,
    openId: null, revealed: null, gesture: null, drag: null, settling: false,
    swallow: null, dismiss: null, fanned: false, kb: 0, reflowTimer: 0, landing: new Set(),
  } as unknown as Ctx;

  c.reduced = () => reduceMQ.matches;
  c.dur = (ms) => (reduceMQ.matches ? 0 : ms);
  c.haptic = () => { try { navigator.vibrate?.(8); } catch { /* unsupported */ } };
  c.src = (key) => store.photoSrc(key);
  c.findItem = (id) => (id ? store.get(id) : undefined);
  c.allCells = () => [...g0.children, ...g1.children] as HTMLElement[];
  c.cellById = (id) => (id ? c.allCells().find((x) => x.dataset.id === id) || null : null);
  c.live = (g) => ([...g.children] as HTMLElement[]).filter((x) => !x.classList.contains("removing"));

  /* ---------------- Rendering ---------------- */
  let rendered = false;
  function render() {
    rendered = true;
    g0.textContent = "";
    g1.textContent = "";
    for (const it of store.items()) (it.checked ? g1 : g0).appendChild(cellEl(it, c.src));
    c.updateShapes();
  }

  c.updateShapes = () => {
    shapeGroup(c.live(g0));
    shapeGroup(c.live(g1));
    const anyChecked = g1.children.length > 0;
    stack.hidden = !anyChecked;
    if (!anyChecked && c.fanned) c.setFanned(false);
    c.updatePile();
    const noOpen = c.live(g0).length === 0;
    emptyEl.hidden = !rendered || !noOpen;
    if (noOpen) {
      const none = store.items().length === 0;
      emptyTitle.textContent = none ? "Nothing to buy" : "All done";
      emptyText.textContent = none ? "Add what you need below." : "Everything is in the cart.";
    }
  };

  /* ---------------- Layout: composer, keyboard, padding ---------------- */
  c.topInset = () => Math.max(topfade.offsetHeight - 8, window.visualViewport?.offsetTop ?? 0);
  c.composerTop = () => { // y within scroller viewport where composer begins
    const r = composer.getBoundingClientRect(), s = scroller.getBoundingClientRect();
    return app.classList.contains("editing") ? s.height - c.kb : r.top - s.top;
  };
  c.atBottom = () => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 24;
  c.scrollToBottom = () => { scroller.scrollTop = scroller.scrollHeight; };
  c.layoutPad = (stick = c.atBottom()) => {
    const editing = app.classList.contains("editing");
    // layout position, so the composer's slide-away transform doesn't count
    const pad = editing ? c.kb + 24 : Math.max(0, scroller.clientHeight - composer.offsetTop) + 16;
    content.style.setProperty("--pad-bottom", pad + "px");
    if (stick) c.scrollToBottom();
  };
  // whether the list was scrolled to the bottom before the viewport last changed size
  let pinned = true;
  scroller.addEventListener("scroll", () => { pinned = c.atBottom(); }, { passive: true, signal });
  let lastW = window.innerWidth, lastSize = "";
  const scrollerSize = () => scroller.clientWidth + "x" + scroller.clientHeight;
  function onViewport() {
    const vv = window.visualViewport;
    // open: the visual viewport lost height to something; how much of the app it covers is measured
    // from the app's own bottom, which in an iOS home-screen app can lie below innerHeight
    const open = !!vv && window.innerHeight - vv.height - vv.offsetTop >= 60;
    const kb = open ? Math.max(0, Math.round(app.getBoundingClientRect().bottom - vv!.offsetTop - vv!.height)) : 0;
    c.kb = kb;
    app.style.setProperty("--kb", kb + "px");
    app.classList.toggle("kb-open", kb > 0);
    // rotation: a finger still down would act on stale geometry
    if (window.innerWidth !== lastW) { lastW = window.innerWidth; cancelPointers(); }
    const resized = scrollerSize() !== lastSize;
    lastSize = scrollerSize();
    setTimeout(() => {
      c.layoutPad();
      const a = document.activeElement;
      const cell = (a && a.closest(".cell")) || (resized && c.cellById(c.openId));
      if (cell) c.ensureVisible(cell, 12);
    }, c.dur(320));
    c.layoutPad(resized ? pinned : undefined);
  }
  if (window.visualViewport) {
    visualViewport!.addEventListener("resize", onViewport, { signal });
    visualViewport!.addEventListener("scroll", onViewport, { signal });
  }
  window.addEventListener("resize", onViewport, { signal });

  // keep an element's rect between the top inset and the composer/keyboard
  c.ensureVisible = (target, margin = 12, smooth) => {
    const sr = scroller.getBoundingClientRect(), r = target.getBoundingClientRect();
    const top = r.top - sr.top, bottom = r.bottom - sr.top;
    const limitBottom = c.composerTop() - margin, limitTop = c.topInset() + margin;
    let delta = 0;
    if (bottom > limitBottom) delta = Math.min(bottom - limitBottom, top - limitTop);
    else if (top < limitTop) delta = top - limitTop;
    if (!delta) return;
    if (smooth && !reduceMQ.matches) scroller.scrollBy({ top: delta, behavior: "smooth" });
    else scroller.scrollTop += delta;
  };

  /* ---------------- Check / uncheck ---------------- */
  c.toggleChecked = (li) => {
    const it = c.findItem(li.dataset.id);
    if (!it) return;
    const checked = !it.checked;
    store.setChecked(it.id, checked);
    li.classList.toggle("checked", checked);
    $(".row", li).setAttribute("aria-checked", String(checked));
    const ck = $(".check", li);
    ck.classList.remove("pop");
    void ck.offsetWidth;
    ck.classList.add("pop");
    setTimeout(() => ck.classList.remove("pop"), 450);
    c.haptic();
    c.scheduleReflow();
  };

  /* ---------------- Removal ---------------- */
  c.removeCell = (li, swiped) => {
    store.remove(li.dataset.id!);
    c.haptic();
    c.removeCellDom(li, swiped);
  };
  c.removeCellDom = (li, swiped) => {
    if (c.openId === li.dataset.id) c.openId = null;
    if (c.revealed === li) c.revealed = null;
    const a = document.activeElement;
    if (a && li.contains(a)) (a as HTMLElement).blur();
    // deleting the last checked row folds the whole fanned section away with it
    const lastChecked = li.parentElement === g1 && c.live(g1).length === 1;
    li.style.height = li.offsetHeight + "px";
    li.getBoundingClientRect();
    li.classList.add("removing");
    if (!swiped) li.classList.add("fade");
    li.style.height = "0px";
    if (lastChecked) {
      stack.style.height = stack.offsetHeight + "px";
      stack.style.overflow = "hidden";
      stack.getBoundingClientRect();
      stack.style.transition = "height .34s var(--ease),opacity .25s var(--ease)";
      stack.style.height = "0px";
      stack.style.opacity = "0";
    }
    c.updateShapes();
    setTimeout(() => {
      li.remove();
      c.updateShapes();
      if (lastChecked) stack.style.height = stack.style.overflow = stack.style.transition = stack.style.opacity = "";
    }, c.dur(360));
  };

  installMotion(c);
  installStack(c);
  const disposeEditor = installEditor(c);
  installSwipe(c);
  installDrag(c);
  installViewer(c);
  const disposeComposer = installComposer(c);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { c.closeViewer(); c.closeReveal(); if (c.openId) c.collapse(c.cellById(c.openId)); }
  }, { signal });

  /* ---------------- Pointer handling ---------------- */
  // capture phase: a tap anywhere first dismisses revealed actions / open editor
  document.addEventListener("pointerdown", (e) => {
    c.swallow = null;
    c.dismiss = null;
    if (!viewer.hidden) return;
    const t = e.target as Element;
    if (c.revealed) {
      if (c.revealed.contains(t)) return;
      c.closeReveal();
      c.swallow = e.pointerId;
      return;
    }
    if (c.openId) {
      const li = c.cellById(c.openId);
      if (li && !li.contains(t) && !composer.contains(t) && !t.closest?.(".grip")) {
        c.dismiss = { pid: e.pointerId, x: e.clientX, y: e.clientY };
        c.swallow = e.pointerId;
      }
    }
  }, { capture: true, signal });

  function onListDown(e: PointerEvent) {
    if (e.button !== 0 || c.drag || c.swallow === e.pointerId) return;
    const t = e.target as Element;
    const li = t.closest<HTMLElement>(".cell");
    if (!li || li.classList.contains("removing") || li.classList.contains("open")) return;
    if (t.closest(".acts")) return;
    const grip = t.closest<HTMLElement>(".grip");
    if (grip) { c.startDrag(e, li, grip); return; }
    const row = t.closest<HTMLElement>(".row");
    if (!row) return;
    const thumb = !!t.closest(".thumb");
    const base = c.revealed === li ? -REV : 0;
    const now = performance.now();
    const g = { li, row, thumb, base, x: e.clientX, y: e.clientY, pid: e.pointerId, mode: "pending" as const, dx: base, lastX: e.clientX, lastT: now, v: 0, pressTimer: 0 };
    c.gesture = g;
    if (!thumb && !base) g.pressTimer = window.setTimeout(() => { if (c.gesture === g && g.mode === "pending") li.classList.add("pressed"); }, 60);
  }
  g0.addEventListener("pointerdown", onListDown);
  g1.addEventListener("pointerdown", onListDown);

  document.addEventListener("pointermove", (e) => {
    if (c.drag && e.pointerId === c.drag.pid) { c.drag.lastY = e.clientY; c.dragMove(); return; }
    const g = c.gesture;
    if (!g || e.pointerId !== g.pid) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.mode === "pending") {
      if (Math.hypot(dx, dy) <= 8) return;
      clearTimeout(g.pressTimer);
      g.li.classList.remove("pressed");
      if (Math.abs(dx) > Math.abs(dy) * 1.2 && (dx < 0 || g.base < 0)) {
        g.mode = "swipe";
        g.x = e.clientX; // start from here to avoid a jump
        g.w = Math.min(g.li.offsetWidth, 420); // full-swipe distance stays phone-sized on wide rows
        if (c.revealed && c.revealed !== g.li) c.closeReveal();
        g.li.classList.remove("snap", "fly");
        try { g.row.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      } else {
        c.gesture = null; // native scroll takes over
      }
      return;
    }
    if (g.mode === "swipe") {
      e.preventDefault();
      let x = g.base + (e.clientX - g.x);
      if (x > 0) x = x * 0.2; // resist rightward
      const now = performance.now();
      g.v = (e.clientX - g.lastX) / Math.max(1, now - g.lastT);
      g.lastX = e.clientX;
      g.lastT = now;
      g.dx = x;
      c.setSlide(g.li, x);
      const armed = -x > g.w! * 0.62;
      if (armed !== g.li.classList.contains("armed")) { g.li.classList.toggle("armed", armed); if (armed) c.haptic(); }
    }
  }, { passive: false, signal });

  function flashPress(li: HTMLElement) {
    li.classList.add("pressed");
    requestAnimationFrame(() => requestAnimationFrame(() => li.classList.remove("pressed")));
  }
  function endPointer(e: PointerEvent, cancelled: boolean) {
    if (c.drag && e.pointerId === c.drag.pid) { c.endDrag(); return; }
    if (c.dismiss && e.pointerId === c.dismiss.pid) {
      const d = c.dismiss;
      c.dismiss = null;
      if (!cancelled && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10 && c.openId) c.collapse(c.cellById(c.openId));
      return;
    }
    const g = c.gesture;
    if (!g || e.pointerId !== g.pid) return;
    c.gesture = null;
    clearTimeout(g.pressTimer);
    if (g.mode === "pending") {
      if (cancelled) { g.li.classList.remove("pressed"); return; }
      if (g.base < 0) { c.closeReveal(); return; }
      if (g.thumb) { c.openViewer(g.li); return; }
      if (!g.li.classList.contains("pressed")) g.li.classList.add("pressed");
      c.toggleChecked(g.li);
      requestAnimationFrame(() => requestAnimationFrame(() => g.li.classList.remove("pressed")));
      return;
    }
    if (g.mode === "swipe") {
      const x = g.dx;
      if (!cancelled && (g.li.classList.contains("armed") || (g.v < -1.2 && -x > g.w! * 0.4))) { c.fullDelete(g.li); return; }
      g.li.classList.remove("armed");
      if (!cancelled && (-x > REV * 0.5 || (g.v < -0.4 && -x > 30)) && !(g.v > 0.3)) c.openReveal(g.li);
      else { if (c.revealed === g.li) c.revealed = null; c.setSlide(g.li, 0, "snap"); }
    }
  }
  function cancelPointers() {
    for (const pid of [c.drag?.pid, c.gesture?.pid, c.dismiss?.pid]) {
      if (pid != null) endPointer({ pointerId: pid, clientX: 0, clientY: 0 } as PointerEvent, true);
    }
  }
  document.addEventListener("pointerup", (e) => endPointer(e, false), { signal });
  document.addEventListener("pointercancel", (e) => endPointer(e, true), { signal });

  function onListKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.matches?.(".done") && (e.key === "Enter" || e.key === " ")) return;
    const row = t.classList?.contains("row") ? t : null;
    if (!row) return;
    const li = row.closest<HTMLElement>(".cell")!;
    if (li.classList.contains("open")) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.toggleChecked(li); flashPress(li); }
    else if (e.key === "e" || e.key === "E") { e.preventDefault(); c.expand(li); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); c.removeCell(li, false); }
  }
  function onListClick(e: MouseEvent) {
    const t = e.target as Element;
    const done = t.closest(".done");
    if (done) { c.collapse(done.closest<HTMLElement>(".cell")); return; }
    // keyboard activation of the thumbnail (pointer taps are handled above)
    const th = t.closest(".thumb");
    if (th && e.detail === 0) c.openViewer(th.closest<HTMLElement>(".cell")!);
  }
  g0.addEventListener("keydown", onListKey);
  g1.addEventListener("keydown", onListKey);
  g0.addEventListener("click", onListClick);
  g1.addEventListener("click", onListClick);

  // block page scroll while dragging / swiping (iOS)
  document.addEventListener("touchmove", (e) => { if (c.drag || c.gesture?.mode === "swipe") e.preventDefault(); }, { passive: false, signal });
  document.addEventListener("contextmenu", (e) => { if (!(e.target as Element).closest?.("input,textarea")) e.preventDefault(); }, { signal });

  /* ---------------- Changes from other people ---------------- */
  let syncTimer = 0;
  function scheduleSync(ms: number) {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(applyRemote, ms);
  }

  function applyRemote() {
    if (!rendered) return;
    // never touch rows under a finger; try again once it lifts
    if (c.gesture || c.drag || c.settling) { scheduleSync(250); return; }
    const items = store.items();
    const ids = new Set(items.map((i) => i.id));

    for (const cell of c.allCells()) {
      if (cell.classList.contains("removing") || ids.has(cell.dataset.id!)) continue;
      if (c.openId === cell.dataset.id) c.collapse(cell, true);
      if (c.revealed === cell) c.closeReveal(true);
      c.removeCellDom(cell, false);
    }

    const adds: Item[] = [];
    for (const it of items) {
      const cell = c.cellById(it.id);
      if (!cell) adds.push(it);
      else if (!cell.classList.contains("removing")) {
        fillRow(cell, it, c.src);
        c.refreshEditor(cell, it);
      }
    }

    if (adds.length) {
      const stick = c.atBottom();
      c.flipAll(() => {
        for (const it of adds) {
          const li = cellEl(it, c.src);
          li.classList.add("enter");
          setTimeout(() => li.classList.remove("enter"), 600);
          const g = it.checked ? g1 : g0;
          let ref: HTMLElement | null = null;
          for (let j = items.indexOf(it) + 1; j < items.length && !ref; j++) {
            if (items[j].checked !== it.checked) continue;
            const x = c.cellById(items[j].id);
            if (x && x.parentElement === g) ref = x;
          }
          g.insertBefore(li, ref);
        }
        c.updateShapes();
        if (stick) c.scrollToBottom();
      });
    }

    const order = (g: HTMLElement) => c.live(g).map((x) => x.dataset.id).join();
    const want = (checked: boolean) => items.filter((i) => i.checked === checked).map((i) => i.id).join();
    if (order(g0) !== want(false) || order(g1) !== want(true)) {
      if (!c.reflowTimer) c.scheduleReflow(0);
    } else c.updateShapes();
  }

  function onStore(source: ChangeSource) {
    if (!rendered) {
      if (!store.loaded) return;
      render();
      c.layoutPad();
      requestAnimationFrame(() => { c.layoutPad(); c.scrollToBottom(); });
      return;
    }
    // local changes were already applied to the DOM by the gesture that made them
    if (source === "remote") scheduleSync(0);
  }
  const unsubscribe = store.subscribe(onStore);

  /* ---------------- Boot ---------------- */
  lastSize = scrollerSize();
  if (store.loaded) render();
  c.layoutPad();
  requestAnimationFrame(() => { c.layoutPad(); c.scrollToBottom(); });

  return {
    busy() {
      const a = document.activeElement as HTMLElement | null;
      const field = !!a && (a.matches("input,textarea") || a.isContentEditable);
      // composer text and editor fields live only in the DOM until submitted / committed
      if (input.value.trim() || composer.classList.contains("has-photo") || (field && a!.closest(".cell"))) return "unsaved";
      if (field || c.gesture || c.drag || c.settling || c.openId || !viewer.hidden) return "interacting";
      return "idle";
    },
    destroy() {
      ac.abort();
      unsubscribe();
      clearTimeout(syncTimer);
      clearTimeout(c.reflowTimer);
      disposeEditor();
      disposeComposer();
      app.remove();
    },
  };
}
