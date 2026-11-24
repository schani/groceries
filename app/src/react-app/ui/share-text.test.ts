import { describe, expect, it } from "vitest";
import type { Item } from "../../shared/wire";
import { shareText } from "./share-text";

let n = 0;
const item = (name: string, more: Partial<Item> = {}): Item => ({
  id: `item${String(++n).padStart(4, "0")}`, name, description: "", photo: null, checked: false, pos: "V", ...more,
});

describe("shareText", () => {
  it("lists items in the given order, one line each, without a trailing newline", () => {
    expect(shareText([item("Eggs"), item("Milk"), item("Bread")])).toBe("- [ ] Eggs\n- [ ] Milk\n- [ ] Bread");
  });

  it("appends the description after a dash", () => {
    expect(shareText([item("Salad greens", { description: "romaine mix?" }), item("Eggs")]))
      .toBe("- [ ] Salad greens - romaine mix?\n- [ ] Eggs");
  });

  it("collapses newlines and runs of whitespace and trims", () => {
    expect(shareText([item("  Whole \t milk ", { description: "\n 2%,\n\n  organic \r\n if  possible  " })]))
      .toBe("- [ ] Whole milk - 2%, organic if possible");
  });

  it("drops a description that is only whitespace", () => {
    expect(shareText([item("Eggs", { description: " \n\t " })])).toBe("- [ ] Eggs");
  });

  it("excludes checked items", () => {
    expect(shareText([item("Butter", { checked: true }), item("Eggs"), item("Tea", { checked: true, description: "green" })]))
      .toBe("- [ ] Eggs");
  });

  it("is empty when nothing is unchecked", () => {
    expect(shareText([])).toBe("");
    expect(shareText([item("Butter", { checked: true })])).toBe("");
  });
});
