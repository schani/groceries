import type { Ctx } from "./context";
import { $ } from "./dom";

/** Full-screen photo that zooms out of (and back into) the row thumbnail. */
export function installViewer(c: Ctx): void {
  const { app, scroller, viewer, viewerImg } = c.el;
  let viewerFrom: string | null = null;

  function thumbTransform(thumb: Element) {
    const ar = app.getBoundingClientRect(), tr = thumb.getBoundingClientRect();
    const iw = viewerImg.offsetWidth, ih = viewerImg.offsetHeight;
    const il = viewerImg.offsetLeft, it = viewerImg.offsetTop;
    const s = Math.max(tr.width / iw, tr.height / ih);
    const x = tr.left - ar.left + tr.width / 2 - (il + (iw * s) / 2);
    const y = tr.top - ar.top + tr.height / 2 - (it + (ih * s) / 2);
    return `translate(${x}px,${y}px) scale(${s})`;
  }

  c.openViewer = async (li) => {
    const it = c.findItem(li.dataset.id);
    if (!it || !it.photo) return;
    c.closeReveal();
    const thumb = $(".thumb", li);
    viewerFrom = it.id;
    viewerImg.src = c.src(it.photo);
    viewerImg.alt = `Photo of ${it.name}`;
    try { await viewerImg.decode(); } catch { /* show whatever loaded */ }
    viewer.hidden = false;
    viewerImg.classList.remove("anim");
    viewerImg.style.opacity = "1";
    viewerImg.style.transform = thumbTransform(thumb);
    viewer.getBoundingClientRect();
    viewerImg.classList.add("anim");
    viewer.classList.add("on");
    viewerImg.style.transform = "";
    viewer.tabIndex = -1;
    viewer.focus({ preventScroll: true });
  };

  c.closeViewer = () => {
    if (viewer.hidden) return;
    const li = c.cellById(viewerFrom);
    const thumb = li && $(".thumb", li);
    viewer.classList.remove("on");
    let visible = false;
    if (li && thumb && li.classList.contains("has-photo")) {
      const r = thumb.getBoundingClientRect(), s = scroller.getBoundingClientRect();
      visible = r.height > 0 && r.bottom > s.top && r.top < s.bottom;
    }
    if (visible) viewerImg.style.transform = thumbTransform(thumb!);
    else viewerImg.style.opacity = "0";
    setTimeout(() => {
      viewer.hidden = true;
      viewerImg.classList.remove("anim");
      viewerImg.style.transform = "";
      viewerImg.removeAttribute("src");
    }, c.dur(400));
    viewerFrom = null;
  };

  viewer.addEventListener("click", c.closeViewer);
}
