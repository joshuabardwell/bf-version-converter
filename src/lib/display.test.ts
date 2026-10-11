import { test } from "node:test";
import assert from "node:assert/strict";
import { fitSplit, hasNote, items, lines, withInput } from "./display.ts";
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

test("every pasted line shows on the left, even one no row claims", () => {
  const input = "set a = 1\nset gone = 2\nset c = 3\n";
  const merged = { ...row("successor", "merged", "set b = 2", 0), src_line: null, original: null };
  const rows = withInput([row("set", "unchanged", "set a = 1", 1), merged, row("set", "unchanged", "set c = 3", 3)], input);
  assert.deepEqual(rows.map((r) => [r.kind, r.src_line]), [["set", 1], ["successor", null], ["input", 2], ["set", 3]]);
  assert.deepEqual(lines(rows, input).filter((l) => l.left).map((l) => l.left!.n), [1, 2, 3]);
  const all = [row("set", "unchanged", "set a = 1", 1)];
  assert.equal(withInput(all, "set a = 1\n"), all);  // nothing missing: the same rows
  assert.deepEqual(withInput([], "x\ny").map((r) => r.src_line), [1, 2]);
});

test("only headers and unchanged lines: nothing folds", () => {
  assert.equal(folds([row("header", "unchanged", "# version", 1), ...plain(2)]), 0);
});
test("a changed line: the unchanged run folds", () => {
  assert.equal(folds([row("header", "unchanged", "# version", 1), ...plain(2),
                      row("set", "renamed", "set b = 1", 10)]), 1);
});

test("a kept line's note: shown in all changes, and in attention only when it asks for attention", () => {
  const kept = { ...row("set", "unchanged", "set gps_auto_baud = ON", 1), notes: [{ note: "No effect in 4.5.5." }] };
  assert.equal(hasNote(kept, "all"), true);
  assert.equal(hasNote(kept, "attention"), false);
  assert.equal(hasNote({ ...kept, attention: true }, "attention"), true);
  assert.equal(hasNote(kept, "off"), false);
  assert.equal(hasNote(row("set", "unchanged", "set a = 1", 2), "all"), false);  // no note, nothing shown
});
