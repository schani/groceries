import type { Item } from "../../shared/wire";
import type { Ctx } from "./context";
import { $, ICON } from "./dom";
import { pickPhoto } from "./photos";
import { fillRow } from "./rows";

const IDLE_COMMIT_MS = 600;

/** Edit in place: the row expands into name / description / photo fields. */
export function installEditor(c: Ctx): () => void {
  const { app, scroller, fileInput } = c.el;

  // text edits reach the store on commit (blur, Done, Return) or after a pause
  let draft: { id: string; dirty: Set<"name" | "description">; timer: number } | null = null;

  function commit() {
    if (!draft) return;
    clearTimeout(draft.timer);
    const { id, dirty } = draft;
    const li = c.cellById(id);
    if (!li || !dirty.size) return;
    const fields: { name?: string; description?: string } = {};
    const ni = $<HTMLInputElement>(".name-input", li), fd = $<HTMLTextAreaElement>(".f-desc", li);
    if (dirty.has("name") && ni && ni.value.trim()) fields.name = ni.value;
    if (dirty.has("description") && fd) fields.description = fd.value;
    dirty.clear();
    c.store.update(id, fields);
    const it = c.findItem(id);
    if (it) fillRow(li, it, c.src);
  }

  function touch(id: string, field: "name" | "description") {
    if (!draft || draft.id !== id) {
      commit();
      draft = { id, dirty: new Set(), timer: 0 };
    }
    draft.dirty.add(field);
    clearTimeout(draft.timer);
    draft.timer = window.setTimeout(commit, IDLE_COMMIT_MS);
  }

  function buildEditor(li: HTMLElement, it: Item) {
    const id = it.id;
    // the row's own name becomes the field — no duplicate name
    const nameInput = document.createElement("input");
    Object.assign(nameInput, { className: "name-input", type: "text", placeholder: "Name", autocomplete: "off", maxLength: 80 });
    nameInput.setAttribute("aria-label", "Name");
    nameInput.setAttribute("enterkeyhint", "done");
    nameInput.setAttribute("autocapitalize", "sentences");
    nameInput.value = it.name;
    $(".name", li).after(nameInput);
    nameInput.addEventListener("input", () => { if (nameInput.value.trim()) touch(id, "name"); });
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); nameInput.blur(); } });
    nameInput.addEventListener("blur", () => {
      if (!nameInput.value.trim()) nameInput.value = c.findItem(id)?.name ?? "";
      commit();
    });

    const ed = $(".editor", li);
    ed.innerHTML =
      `<div class="ed-inner">
        <textarea class="f-desc" rows="1" aria-label="Description" placeholder="Add a description"></textarea>
        <div class="photo-slot"></div>
      </div>`;
    const fDesc = $<HTMLTextAreaElement>(".f-desc", ed);
    fDesc.value = it.description;
    fDesc.addEventListener("input", () => { touch(id, "description"); grow(fDesc); });
    fDesc.addEventListener("blur", commit);
    renderPhotoSlot(li, it);
    grow(fDesc);
  }

  function grow(fDesc: HTMLTextAreaElement) {
    fDesc.style.height = "auto";
    fDesc.style.height = fDesc.scrollHeight + "px";
  }

  function renderPhotoSlot(li: HTMLElement, it: Item) {
    const slot = $(".photo-slot", li);
    if (!slot) return;
    slot.dataset.key = it.photo ?? "";
    if (it.photo) {
      slot.innerHTML = `<div class="photo"><img alt="">
        <div class="photo-actions">
          <button class="pill replace">${ICON.camera}<span>Replace</span></button>
          <button class="pill icon rm-photo" aria-label="Remove photo">${ICON.x}</button>
        </div></div>`;
      const img = $<HTMLImageElement>("img", slot);
      img.src = c.src(it.photo);
      img.alt = "Photo of " + it.name;
      $(".replace", slot).addEventListener("click", () => choosePhoto(li, it.id));
      $(".rm-photo", slot).addEventListener("click", () => {
        c.store.setPhoto(it.id, null);
        refreshPhoto(li, it.id);
      });
    } else {
      slot.innerHTML = `<button class="add-photo">${ICON.camera}<span>Add Photo</span></button>`;
      $(".add-photo", slot).addEventListener("click", () => choosePhoto(li, it.id));
    }
  }

  function refreshPhoto(li: HTMLElement, id: string) {
    const it = c.findItem(id);
    if (!it) return;
    fillRow(li, it, c.src);
    renderPhotoSlot(li, it);
  }

  async function choosePhoto(li: HTMLElement, id: string) {
    const blob = await pickPhoto(fileInput);
    if (!blob || !c.findItem(id)) return;
    c.store.setPhoto(id, blob);
    refreshPhoto(li, id);
    const p = $(".photo", li);
    if (p) setTimeout(() => c.ensureVisible(p, 16, true), 60);
  }

  c.refreshEditor = (li, it) => {
    if (c.openId !== it.id || !li.classList.contains("open")) return;
    const dirty = draft && draft.id === it.id ? draft.dirty : new Set<string>();
    const active = document.activeElement;
    const ni = $<HTMLInputElement>(".name-input", li), fd = $<HTMLTextAreaElement>(".f-desc", li);
    if (ni && ni !== active && !dirty.has("name") && ni.value !== it.name) ni.value = it.name;
    if (fd && fd !== active && !dirty.has("description") && fd.value !== it.description) {
      fd.value = it.description;
      grow(fd);
    }
    const slot = $(".photo-slot", li);
    if (slot && slot.dataset.key !== (it.photo ?? "")) renderPhotoSlot(li, it);
  };

  c.expand = (li) => {
    const id = li.dataset.id!, it = c.findItem(id);
    if (!it || li.classList.contains("removing")) return;
    if (c.openId && c.openId !== id) c.collapse(c.cellById(c.openId));
    c.openId = id;
    buildEditor(li, it);
    const ed = $(".editor", li);
    li.classList.add("open");
    const h = $(".ed-inner", ed).offsetHeight;
    ed.style.height = "0px";
    ed.getBoundingClientRect();
    ed.style.height = h + "px";
    // follow the growing row so it stays visible (scroll down only, never past its top)
    const t0 = performance.now(), D = c.dur(500);
    const follow = () => {
      if (c.openId !== id) return;
      const sr = scroller.getBoundingClientRect(), r = li.getBoundingClientRect();
      const over = r.bottom - sr.top - (c.composerTop() - 8);
      const room = r.top - sr.top - (c.topInset() + 8);
      if (over > 0 && room > 0) scroller.scrollTop += Math.min(over, room);
      if (performance.now() - t0 < D + 60) requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
    setTimeout(() => { if (c.openId === id) ed.style.height = "auto"; }, D);
  };

  c.collapse = (li, instant) => {
    if (!li) { c.openId = null; return; }
    commit();
    draft = null;
    if (c.openId === li.dataset.id) c.openId = null;
    const ed = $(".editor", li);
    const a = document.activeElement;
    if (a && li.contains(a)) (a as HTMLElement).blur();
    const finish = () => {
      if (li.classList.contains("open")) return;
      ed.textContent = "";
      const ni = $(".name-input", li);
      if (ni) ni.remove();
    };
    const it = c.findItem(li.dataset.id);
    if (it) fillRow(li, it, c.src);
    if (instant || c.reduced()) {
      li.classList.add("no-anim");
      li.classList.remove("open");
      ed.style.height = "0px";
      finish();
      li.getBoundingClientRect();
      li.classList.remove("no-anim");
      return;
    }
    // keep the header height stable while the editor shrinks, then swap back to the label
    ed.style.height = ed.offsetHeight + "px";
    ed.getBoundingClientRect();
    ed.style.transition = "height .36s var(--ease)";
    ed.style.height = "0px";
    li.classList.remove("open");
    setTimeout(() => { ed.style.transition = ""; finish(); }, c.dur(380));
  };

  // editing state: hide composer while a row field has focus
  const isField = (t: EventTarget | null): t is HTMLElement =>
    t instanceof HTMLElement && !!t.closest(".cell") && t.matches("input,textarea");
  document.addEventListener("focusin", (e) => {
    app.classList.toggle("editing", isField(e.target));
    c.layoutPad();
  }, { signal: c.signal });
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      if (!isField(document.activeElement)) { app.classList.remove("editing"); c.layoutPad(); }
    }, 0);
  }, { signal: c.signal });

  // a rotated row is wider or narrower, so the description wraps differently
  window.addEventListener("resize", () => app.querySelectorAll<HTMLTextAreaElement>(".f-desc").forEach(grow), { signal: c.signal });

  return () => {
    if (draft) clearTimeout(draft.timer);
    draft = null;
  };
}
