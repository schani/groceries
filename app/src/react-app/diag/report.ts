// Temporary: reports what an installed (home-screen) app measures about its viewport, so the iOS
// bottom-gap fix can be checked without asking. Delete this module, its call in App.tsx, postDiag
// and the /api/diag route once done.
import { postDiag } from "../api/client";

const MAX_REPORTS = 6;

const r1 = (n: number) => Math.round(n * 10) / 10;

function box(el: Element | null) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r1(r.x), y: r1(r.y), w: r1(r.width), h: r1(r.height), bottom: r1(r.bottom) };
}

function measure(trigger: string, seq: number): Record<string, unknown> {
  const nav = navigator as Navigator & { standalone?: boolean };
  const probes: HTMLElement[] = [];
  const probe = (css: string) => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none;" + css;
    document.body.appendChild(d);
    probes.push(d);
    return d;
  };
  try {
    const heights = Object.fromEntries(
      (["100vh", "100dvh", "100lvh", "100svh", "100%"] as const).map((v) => [v, probe(`height:${v}`)]),
    );
    const insets = Object.fromEntries(
      (["top", "right", "bottom", "left"] as const).map((s) => [s, probe(`width:env(safe-area-inset-${s},0px)`)]),
    );
    const bottomProbe = probe("top:auto;bottom:0");
    const app = document.querySelector<HTMLElement>(".app");
    const vv = window.visualViewport;
    const de = document.documentElement;
    return {
      build: __BUILD_ID__,
      trigger,
      seq,
      uptime: Math.round(performance.now()),
      ua: navigator.userAgent,
      standalone: nav.standalone ?? null,
      displayModeStandalone: matchMedia("(display-mode: standalone)").matches,
      standaloneClass: de.classList.contains("standalone"),
      inner: { w: r1(innerWidth), h: r1(innerHeight) },
      docClient: { w: r1(de.clientWidth), h: r1(de.clientHeight) },
      docRectH: r1(de.getBoundingClientRect().height),
      docScrollH: r1(de.scrollHeight),
      scrollY: r1(scrollY),
      vv: vv ? { w: r1(vv.width), h: r1(vv.height), offsetTop: r1(vv.offsetTop), scale: r1(vv.scale) } : null,
      screen: { w: screen.width, h: screen.height, orientation: screen.orientation?.type ?? null },
      units: Object.fromEntries(Object.entries(heights).map(([k, d]) => [k, r1(d.getBoundingClientRect().height)])),
      safeArea: Object.fromEntries(Object.entries(insets).map(([k, d]) => [k, r1(d.getBoundingClientRect().width)])),
      fixedBottomProbe: box(bottomProbe),
      app: box(app),
      scroller: box(document.getElementById("scroller")),
      composer: box(document.querySelector(".composer")),
      kb: app ? getComputedStyle(app).getPropertyValue("--kb").trim() : null,
      kbOpen: app?.classList.contains("kb-open") ?? null,
      active: document.activeElement?.tagName ?? null,
    };
  } finally {
    for (const d of probes) d.remove();
  }
}

/** Starts reporting when running as an installed app; returns a stop function. */
export function startDiagnostics(): () => void {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (!(nav.standalone === true || matchMedia("(display-mode: standalone)").matches)) return () => {};
  let sent = 0;
  const send = (trigger: string) => {
    if (sent >= MAX_REPORTS) return;
    sent++;
    try {
      postDiag(measure(trigger, sent)).catch(() => {});
    } catch {
      // diagnostics must never get in the way
    }
  };
  let timer = window.setTimeout(() => send("load"), 1500);
  const onChange = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => send("resize"), 1000);
  };
  window.addEventListener("resize", onChange);
  screen.orientation?.addEventListener("change", onChange);
  return () => {
    clearTimeout(timer);
    window.removeEventListener("resize", onChange);
    screen.orientation?.removeEventListener("change", onChange);
  };
}
