import type { Ctx } from "./context";
import { pickPhoto } from "./photos";
import { cellEl } from "./rows";

/** The floating "Add item" capsule with its camera button. */
export function installComposer(c: Ctx): () => void {
  const { composer, input, sendBtn, camBtn, chip, chipImg, chipX, fileInput, g0 } = c.el;
  let pending: { blob: Blob; url: string } | null = null;

  function updateComposer() {
    const has = input.value.trim().length > 0;
    composer.classList.toggle("has-text", has);
    sendBtn.tabIndex = has ? 0 : -1;
    input.placeholder = pending ? "Name this item" : "Add item";
  }

  function setPending(blob: Blob | null) {
    if (pending) URL.revokeObjectURL(pending.url);
    pending = blob ? { blob, url: URL.createObjectURL(blob) } : null;
    chip.hidden = !pending;
    composer.classList.toggle("has-photo", !!pending);
    if (pending) chipImg.src = pending.url;
    else chipImg.removeAttribute("src");
    updateComposer();
  }

  function addItem() {
    if (!input.value.trim()) return;
    if (c.openId) c.collapse(c.cellById(c.openId), true);
    c.closeReveal(true);
    const it = c.store.add(input.value, pending?.blob);
    if (!it) return;
    const li = cellEl(it, c.src);
    li.classList.add("enter");
    c.flipAll(() => {
      g0.appendChild(li);
      c.updateShapes();
      if (!c.fanned) c.scrollToBottom();
    });
    input.value = "";
    setPending(null);
    c.haptic();
    if (c.fanned) requestAnimationFrame(() => c.ensureVisible(li, 14, true));
    setTimeout(() => li.classList.remove("enter"), 600);
  }

  input.addEventListener("input", updateComposer);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addItem(); }
  });
  input.addEventListener("focus", () => { if (c.openId) c.collapse(c.cellById(c.openId)); c.closeReveal(); });
  sendBtn.addEventListener("pointerdown", (e) => e.preventDefault());
  sendBtn.addEventListener("click", () => { addItem(); input.focus({ preventScroll: true }); });
  chipX.addEventListener("pointerdown", (e) => e.preventDefault());
  chipX.addEventListener("click", () => setPending(null));
  camBtn.addEventListener("click", async () => {
    const blob = await pickPhoto(fileInput);
    if (blob) { setPending(blob); input.focus({ preventScroll: true }); }
  });

  updateComposer();
  return () => setPending(null);
}
