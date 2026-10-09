import { test } from "node:test";
import assert from "node:assert/strict";
import { fitSplit } from "./display.ts";

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
