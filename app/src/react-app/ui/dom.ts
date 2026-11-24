export function $<T extends Element = HTMLElement>(s: string, r: ParentNode = document): T {
  return r.querySelector(s) as T;
}

export const ICON = {
  check: '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2.8 7.4 5.8 10.3 11.3 3.9"/></svg>',
  trash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h16M9.5 6.5V4.8c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3v1.7M6.2 6.5l.9 12.6c.1 1 .9 1.9 2 1.9h5.8c1 0 1.9-.8 2-1.9l.9-12.6M10.2 10.5v6.5M13.8 10.5v6.5"/></svg>',
  pencil: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.6 4.6a2 2 0 0 1 2.8 0l1 1a2 2 0 0 1 0 2.8L9 18.8 4.5 20l1.2-4.5L15.6 4.6Z"/><path d="m14 6.3 3.7 3.7"/></svg>',
  grip: '<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect y="0" width="18" height="1.8" rx=".9"/><rect y="5.1" width="18" height="1.8" rx=".9"/><rect y="10.2" width="18" height="1.8" rx=".9"/></svg>',
  camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4.5 7.5h3l1.6-2.2c.2-.3.5-.4.8-.4h4.2c.3 0 .6.1.8.4l1.6 2.2h3A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5Z"/><circle cx="12" cy="13.2" r="3.4"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>',
};

const MARKUP = `
<div class="scroller" id="scroller">
  <div class="content" id="content">
    <div class="spacer">
      <div class="empty" id="empty" hidden>
        <svg class="ico" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 20h40l-4.2 22.4A4 4 0 0 1 39.9 46H16.1a4 4 0 0 1-3.9-3.6L8 20Z"/><path d="M19 20 26 9M37 20 30 9M22 29v8M28 29v8M34 29v8"/></svg>
        <h2 id="emptyTitle">Nothing to buy</h2>
        <p id="emptyText">Add what you need below.</p>
      </div>
    </div>
    <div class="share-head" id="shareHead" hidden>
      <button class="share" id="share"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V1.6M5 4.4 8 1.4l3 3"/><path d="M5.6 6.4H4.4A1.4 1.4 0 0 0 3 7.8v5.8A1.4 1.4 0 0 0 4.4 15h7.2a1.4 1.4 0 0 0 1.4-1.4V7.8a1.4 1.4 0 0 0-1.4-1.4h-1.2"/></svg><span>Share</span></button>
    </div>
    <ul class="group" id="g0" aria-label="To buy"></ul>
    <section class="stack" id="stack" data-n="0" hidden aria-label="Checked items">
      <div class="stack-head" id="stackHead">
        <button class="less" id="less"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10 8 5.5l4.5 4.5"/></svg><span>Show less</span></button>
      </div>
      <button class="pile" id="pile" aria-expanded="false">
        <span class="pile-layer l2" aria-hidden="true"></span>
        <span class="pile-layer l1" aria-hidden="true"></span>
        <span class="pile-front" id="pileFront">
          <span class="check" aria-hidden="true">${ICON.check}</span>
          <span class="pile-text"><span class="pile-title">Checked</span><span class="pile-sub" id="pileSub"></span></span>
          <span class="pile-count" id="pileCount"></span>
        </span>
      </button>
      <ul class="group" id="g1" aria-label="Checked"></ul>
    </section>
  </div>
</div>
<div class="topfade" aria-hidden="true"></div>
<div class="botfade" aria-hidden="true"></div>

<div class="composer" id="composer">
  <button class="cam glass" id="cam" aria-label="Attach photo">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4.5 7.5h3l1.6-2.2c.2-.3.5-.4.8-.4h4.2c.3 0 .6.1.8.4l1.6 2.2h3A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5Z"/><circle cx="12" cy="13.2" r="3.4"/></svg>
  </button>
  <div class="capsule glass">
    <div class="chip" id="chip" hidden>
      <img id="chipImg" alt="Attached photo">
      <button class="chip-x" id="chipX" aria-label="Remove attached photo">
        <svg width="9" height="9" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M2 2l6 6M8 2 2 8"/></svg>
      </button>
    </div>
    <label class="sr" for="addInput">Add item</label>
    <input class="add-input" id="addInput" type="text" placeholder="Add item" enterkeyhint="send" autocomplete="off" autocapitalize="sentences" maxlength="80">
    <button class="send" id="send" aria-label="Add item" tabindex="-1">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13.5V2.8M3.2 7.4 8 2.6l4.8 4.8"/></svg>
    </button>
  </div>
</div>

<div class="toast" id="toast" role="status" aria-live="polite"><span class="toast-ico" aria-hidden="true">${ICON.check}</span><span id="toastText"></span></div>
<div class="viewer" id="viewer" hidden role="dialog" aria-label="Photo"><img id="viewerImg" alt=""></div>
<input class="file" id="file" type="file" accept="image/*" tabindex="-1" aria-hidden="true">
`;

export function buildDom(container: HTMLElement) {
  const app = document.createElement("div");
  app.className = "app";
  app.innerHTML = MARKUP;
  container.appendChild(app);
  const q = <T extends Element = HTMLElement>(s: string) => $<T>(s, app);
  return {
    app,
    scroller: q("#scroller"),
    content: q("#content"),
    g0: q("#g0"),
    g1: q("#g1"),
    emptyEl: q("#empty"),
    emptyTitle: q("#emptyTitle"),
    emptyText: q("#emptyText"),
    topfade: q(".topfade"),
    shareHead: q("#shareHead"),
    shareBtn: q("#share"),
    toast: q("#toast"),
    toastText: q("#toastText"),
    stack: q("#stack"),
    stackHead: q("#stackHead"),
    lessBtn: q("#less"),
    pile: q("#pile"),
    pileFront: q("#pileFront"),
    pileSub: q("#pileSub"),
    pileCount: q("#pileCount"),
    composer: q("#composer"),
    input: q<HTMLInputElement>("#addInput"),
    sendBtn: q("#send"),
    camBtn: q("#cam"),
    chip: q("#chip"),
    chipImg: q<HTMLImageElement>("#chipImg"),
    chipX: q("#chipX"),
    fileInput: q<HTMLInputElement>("#file"),
    viewer: q("#viewer"),
    viewerImg: q<HTMLImageElement>("#viewerImg"),
  };
}

export type Els = ReturnType<typeof buildDom>;
