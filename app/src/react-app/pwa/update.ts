/**
 * Picks up a new deploy without a second launch: checks for a new service worker on load
 * and on resume, and reloads once the new worker has taken control and the user is idle.
 */

/** "unsaved": a reload would lose input; "interacting": defer, but a hidden page may reload. */
export type Busy = "idle" | "interacting" | "unsaved";

export const CHECK_INTERVAL_MS = 60_000;
const FIRST_CHECK_MS = 3_000;
const BUSY_POLL_MS = 500;

export function shouldReload(s: { pending: boolean; reloading: boolean; hidden: boolean; busy: Busy }): boolean {
  if (!s.pending || s.reloading) return false;
  return s.busy === "idle" || (s.hidden && s.busy === "interacting");
}

export function shouldCheck(now: number, lastCheck: number | null): boolean {
  return lastCheck === null || now - lastCheck >= CHECK_INTERVAL_MS;
}

export function startUpdates(busy: () => Busy): () => void {
  const sw = navigator.serviceWorker;
  if (!import.meta.env.PROD || !sw) return () => {};

  const ac = new AbortController();
  const signal = ac.signal;
  // a page loaded without a worker gets claimed on first install; that's not an update
  let controlled = !!sw.controller;
  let pending = false, reloading = false;
  let lastCheck: number | null = null;
  let poll = 0;

  function tryReload() {
    if (!shouldReload({ pending, reloading, hidden: document.visibilityState === "hidden", busy: busy() })) return;
    reloading = true;
    clearInterval(poll);
    location.reload();
  }

  function check() {
    const now = Date.now();
    if (!shouldCheck(now, lastCheck)) return;
    lastCheck = now;
    sw.getRegistration().then((r) => r?.update()).catch(() => { /* offline */ });
  }

  sw.addEventListener("controllerchange", () => {
    if (!controlled) { controlled = true; return; }
    pending = true;
    tryReload();
    if (!reloading && !poll) poll = window.setInterval(tryReload, BUSY_POLL_MS);
  }, { signal });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") tryReload();
    else check();
  }, { signal });

  const first = window.setTimeout(check, FIRST_CHECK_MS);

  return () => {
    ac.abort();
    clearTimeout(first);
    clearInterval(poll);
  };
}
