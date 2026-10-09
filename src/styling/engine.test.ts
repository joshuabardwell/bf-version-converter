// Engine invariants: styling never changes the text, rule sets extend predictably, state threads through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extend, styleDocument } from "./engine.ts";
import { betaflight } from "./rules/betaflight.ts";
import { appRules } from "./rules/index.ts";
import type { RuleSet, StyleLine } from "./types.ts";

const awkward = [
  "set motor_idle = 550", "# profile 0", "###ERROR###", "", " ", "\t", "\tset x = 1\r", "set name = Ünïcødé 🚁 12",
  "#", "##", "a:", ":", "-", "set x = 0x", "1.2.3.4", "set x = -5", "# 0x1F:0x2E", "x".repeat(500) + " 9",
  "batch start", "# start the command batch", "defaults nosave", "save",
];

test("spans join back to exactly the line, for every rule set", () => {
  for (const rules of [betaflight, appRules]) {
    const lines: StyleLine[] = awkward.map((text) => ({ text, side: "right" }));
    styleDocument(lines, rules).forEach((spans, k) => {
      assert.equal(spans.map((s) => s.text).join(""), awkward[k], JSON.stringify(awkward[k]));
      assert.ok(spans.every((s) => s.text.length > 0), "no empty spans");
      spans.slice(1).forEach((s, i) => assert.notDeepEqual(s.roles, spans[i].roles, "adjacent spans differ"));
    });
  }
});

test("extend: add before/after, replace, remove; unknown ids throw", () => {
  const ids = (r: RuleSet) => r.token.map((t) => t.id);
  const tok = (id: string) => ({ id, pattern: /z/, roles: [] });
  assert.deepEqual(ids(extend(betaflight, { token: [{ add: tok("x"), before: "bf.hex" }] })),
    ["bf.label", "x", "bf.hex", "bf.number"]);
  assert.deepEqual(ids(extend(betaflight, { token: [{ add: tok("x"), after: "bf.hex" }, { add: tok("y") }] })),
    ["bf.label", "bf.hex", "x", "bf.number", "y"]);
  assert.deepEqual(ids(extend(betaflight, { token: [{ replace: "bf.hex", with: tok("x") }, { remove: "bf.label" }] })),
    ["x", "bf.number"]);
  assert.throws(() => extend(betaflight, { token: [{ remove: "nope" }] }), /no rule "nope"/);
  assert.deepEqual(ids(betaflight), ["bf.label", "bf.hex", "bf.number"], "the base is not modified");
});

test("token order breaks ties at the same position", () => {
  const first = extend(betaflight, { token: [{ add: { id: "word", pattern: /\w+/, roles: ["label"] }, before: "bf.label" }] });
  const spans = styleDocument([{ text: "set x = 12", side: "left" }], first)[0];
  assert.deepEqual(spans.map((s) => [s.text, s.roles.join(" ")]),
    [["set", "command"], [" ", ""], ["x", "label"], [" = ", ""], ["12", "label"]]);
});

test("trackers thread state from line to line", () => {
  // a toy scope tracker: lines after `profile N` are marked as labels
  const scoped = extend(betaflight, {
    line: [{ add: { id: "in-profile", match: (_l, s) => s.profile != null ? { roles: ["label"], tokens: false } : null },
             before: "bf.error" }],
    trackers: [{ add: { id: "profile", update: (l, s) => { const m = /^profile (\d)/.exec(l.text); if (m) s.profile = m[1]; } } }],
  });
  const out = styleDocument(["set a = 1", "profile 1", "set b = 2"].map((text) => ({ text, side: "left" as const })), scoped);
  assert.deepEqual(out.map((spans) => spans.map((s) => s.roles.join(" "))),
    [["command", "", "number"], ["command", "", "number"], ["label"]]);
});
