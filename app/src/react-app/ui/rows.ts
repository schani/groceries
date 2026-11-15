import type { Item } from "../../shared/wire";
import { $, ICON } from "./dom";

export type PhotoSrc = (key: string) => string;

export function cellEl(it: Item, src: PhotoSrc): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "cell";
  li.dataset.id = it.id;
  li.innerHTML =
    `<div class="acts">
       <button class="act act-edit" tabindex="-1">${ICON.pencil}<span>Edit</span></button>
       <button class="act act-del" tabindex="-1">${ICON.trash}<span>Delete</span></button>
     </div>
     <div class="slide">
       <div class="row" role="checkbox" tabindex="0" aria-checked="false">
         <span class="check" aria-hidden="true">${ICON.check}</span>
         <div class="text"><div class="name"></div><div class="desc"></div></div>
         <button class="thumb" tabindex="-1"></button>
         <button class="grip">${ICON.grip}</button>
         <button class="done">Done</button>
       </div>
       <div class="editor"></div>
     </div>`;
  fillRow(li, it, src);
  return li;
}

export function fillRow(li: HTMLElement, it: Item, src: PhotoSrc): void {
  $(".name", li).textContent = it.name;
  const d = $(".desc", li);
  d.textContent = it.description ? it.description.split("\n").find((l) => l.trim()) || "" : "";
  li.classList.toggle("has-desc", !!it.description.trim());
  const t = $(".thumb", li);
  const cur = $<HTMLImageElement>("img", t);
  if (it.photo) {
    if (!cur || cur.dataset.key !== it.photo) {
      t.textContent = "";
      const img = new Image();
      img.alt = "";
      img.decoding = "async";
      img.dataset.key = it.photo;
      img.src = src(it.photo);
      t.appendChild(img);
    }
  } else t.textContent = "";
  li.classList.toggle("has-photo", !!it.photo);
  li.classList.toggle("checked", it.checked);
  const row = $(".row", li);
  row.setAttribute("aria-checked", String(it.checked));
  row.setAttribute("aria-label", it.name + (it.description.trim() ? ", " + d.textContent : ""));
  t.setAttribute("aria-label", `View photo of ${it.name}`);
  $(".grip", li).setAttribute("aria-label", `Reorder ${it.name}`);
}

/** first/last rounding per group, in the given visual order */
export function shapeGroup(cells: Element[]): void {
  cells.forEach((c, i) => {
    c.classList.toggle("first", i === 0);
    c.classList.toggle("last", i === cells.length - 1);
  });
}
