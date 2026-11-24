import type { Ctx } from "./context";
import { shareText } from "./share-text";

const TOAST_MS = 1500;

/** The "Share" pill above the unchecked items: the share sheet, or a copy with a toast. */
export function installShare(c: Ctx): () => void {
  const { shareBtn, toast, toastText } = c.el;
  let toastTimer = 0;

  function showToast(text: string, ok: boolean) {
    clearTimeout(toastTimer);
    toastText.textContent = text;
    toast.classList.toggle("fail", !ok);
    toast.classList.add("on");
    toastTimer = window.setTimeout(() => toast.classList.remove("on"), TOAST_MS);
  }

  function copy(text: string, n: number) {
    const done = () => showToast(`Copied ${n} item${n === 1 ? "" : "s"}`, true);
    const failed = () => showToast("Couldn't copy", false);
    try {
      navigator.clipboard.writeText(text).then(done, failed);
    } catch {
      failed();
    }
  }

  shareBtn.addEventListener("click", (e) => {
    if (e.detail && c.swallow != null) return;
    const items = c.store.items();
    const n = items.filter((it) => !it.checked).length;
    if (!n) return;
    const text = shareText(items);
    if (typeof navigator.share !== "function") { copy(text, n); return; }
    // iOS only opens the sheet with the tap's user activation still live: nothing may be awaited first
    let shared: Promise<void>;
    try {
      shared = navigator.share({ text });
    } catch {
      copy(text, n);
      return;
    }
    c.sharing = true;
    shared
      .catch((err: unknown) => { if ((err as Error | null)?.name !== "AbortError") copy(text, n); })
      .finally(() => { c.sharing = false; });
  }, { signal: c.signal });

  return () => clearTimeout(toastTimer);
}
