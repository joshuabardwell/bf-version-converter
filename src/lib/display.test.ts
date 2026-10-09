import { test } from "node:test";
import assert from "node:assert/strict";
import { fitSplit, items, lines } from "./display.ts";
import type { Row } from "../engine/protocol.ts";

test("both fit: spare space split evenly", () => {
  assert.equal(fitSplit(1000, 300, 500, 150), 400 / 1000);
});
test("too narrow: converted column gets what it needs", () => {
  assert.equal(fitSplit(1000, 600, 700, 150), 300 / 1000);
});
test("too narrow: left column stops at the floor", () => {
  assert.equal(fitSplit(1000, 600, 950, 150), 150 / 1000);
});
test("tiny width: even split", () => {
  assert.equal(fitSplit(200, 600, 950, 150), 0.5);
  assert.equal(fitSplit(0, 10, 10, 150), 0.5);
});

const row = (kind: string, outcome: Row["outcome"], text: string, n: number): Row => ({
  src_line: n, original: text, kind, entity: null, outcome, attention: false, lines: [text],
  group: null, suggest: [], notes: [], prs: [] });
const folds = (rows: Row[]) => {
  const input = rows.map((r) => r.original).join("\n");
  return items(rows, lines(rows, input), { showUnchanged: false, toggled: new Set(), notes: "attention" })
    .filter((it) => it.type === "fold").length;
};
const plain = (from: number) => Array.from({ length: 8 }, (_, i) => row("set", "unchanged", `set a${i} = 1`, from + i));

test("only headers and unchanged lines: nothing folds", () => {
  assert.equal(folds([row("header", "unchanged", "# version", 1), ...plain(2)]), 0);
});
test("a changed line: the unchanged run folds", () => {
  assert.equal(folds([row("header", "unchanged", "# version", 1), ...plain(2),
                      row("set", "renamed", "set b = 1", 10)]), 1);
});
