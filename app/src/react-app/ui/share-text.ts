import type { Item } from "../../shared/wire";

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** The unchecked items as a Markdown task list, one line each, in the given order. */
export function shareText(items: readonly Item[]): string {
  return items
    .filter((it) => !it.checked)
    .map((it) => {
      const desc = oneLine(it.description);
      return `- [ ] ${oneLine(it.name)}${desc ? ` - ${desc}` : ""}`;
    })
    .join("\n");
}
