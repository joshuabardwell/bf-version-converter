import { test } from "node:test";
import assert from "node:assert/strict";
import { FIELD_MAX, firstHopId, reportable, reportUrl, sourceLines } from "./report.ts";
import type { Manifest, Row } from "../engine/protocol.ts";

const row = (kind: string, original: string | null, src_line: number | null = 1): Row => ({
  src_line, original, kind, entity: null, outcome: "unchanged", attention: false, lines: [], group: null,
  suggest: [], notes: [], prs: [],
});

test("only the pilot's own result lines are reportable", () => {
  assert.equal(reportable(row("set", "set gyro_lpf1_static_hz = 250")), true);
  assert.equal(reportable(row("cmd", "servo 0 1000 2000 1500 100 -1")), true);
  assert.equal(reportable(row("header", null, null)), false);
  assert.equal(reportable(row("new", null, null)), false);
  assert.equal(reportable(row("blank", "")), false);
  assert.equal(reportable(row("comment", "# master")), false);
  const merged = { ...row("successor", null, null), lines: ["set gps_rescue_max_angle = 40"], group: "g" };
  assert.equal(reportable(merged), true);  // a merged line: the pilot's value lives on in it
  assert.equal(reportable({ ...merged, lines: [] }), false);
});

test("a merged line reports the lines it was merged from", () => {
  const input = { ...row("set", "set gps_rescue_pitch_angle_max = 40"), group: "g" };
  const merged = { ...row("successor", null, null), lines: ["set gps_rescue_max_angle = 40"], group: "g" };
  assert.deepEqual(sourceLines([input, merged], 1), ["set gps_rescue_pitch_angle_max = 40"]);
  assert.deepEqual(sourceLines([merged], 0), []);  // a chain dropped the input before the last step
  assert.deepEqual(sourceLines([input], 0), ["set gps_rescue_pitch_angle_max = 40"]);
});

test("a block of moved lines is reportable and reports the lines that moved into it", () => {  // feedback #14
  const block = { ...row("relocated", null, null), lines: [
    "# battery_profile settings that were master in 2025.12.5, set in battery_profile 0 only", "battery_profile 0",
    "set vbat_max_cell_voltage = 440", "set force_battery_cell_count = 1"] };
  const a = { ...row("set", "set vbat_max_cell_voltage = 440"), lines: ["# MOVED: set vbat_max_cell_voltage = 440"] };
  const b = { ...row("set", "set force_battery_cell_count = 1"), lines: ["# MOVED: set force_battery_cell_count = 1"] };
  const other = { ...row("set", "set p_roll = 50"), lines: ["set p_roll = 50"] };
  assert.equal(reportable(block), true);
  assert.equal(reportable({ ...block, lines: [] }), false);
  assert.deepEqual(sourceLines([a, other, b, block], 3),
                   ["set vbat_max_cell_voltage = 440", "set force_battery_cell_count = 1"]);
});

test("the URL opens the map-feedback form with every field filled", () => {
  const u = new URL(reportUrl({ from: "4.4.1", to: "2025.12.5", line: "set gyro_lowpass_hz = 250",
                                output: ["set gyro_lpf1_static_hz = 250"], what: "Wrong value", link: "https://x/#maps/a" }));
  const q = u.searchParams;
  assert.equal(u.origin + u.pathname, "https://github.com/joshuabardwell/bf-version-converter/issues/new");
  assert.equal(q.get("template"), "map-feedback.yml");
  assert.equal(q.get("from_version"), "4.4.1");
  assert.equal(q.get("to_version"), "2025.12.5");
  assert.equal(q.get("line"), "set gyro_lowpass_hz = 250");
  assert.equal(q.get("output"), "set gyro_lpf1_static_hz = 250");
  assert.equal(q.get("what_happened"), "Wrong value");
  assert.equal(q.has("expected"), false);  // empty: left for the pilot on GitHub
  assert.match(q.get("title")!, /set gyro_lowpass_hz = 250 \(4\.4\.1 → 2025\.12\.5\)$/);
});

test("long fields are clipped", () => {
  const long = Array.from({ length: 200 }, (_, i) => `# line ${i} of a long explanation`);
  const q = new URL(reportUrl({ from: "4.5.5", to: "2026.6.2", line: "x".repeat(1000), output: long })).searchParams;
  assert.equal(q.get("line")!.length, FIELD_MAX.line);
  assert.equal(q.get("output")!.length, FIELD_MAX.output);
  assert.ok(q.get("output")!.endsWith("…"));
});

test("the explorer step of a conversion", () => {
  const m = { series: [{ series: "4.4", tag: "4.4.3" }, { series: "4.5", tag: "4.5.5" }],
              patch_pairs: [{ a: "4.4.0", b: "4.4.1" }] } as unknown as Manifest;
  assert.equal(firstHopId(["4.4.0->4.4.1", "4.4.1->4.4.3"], m), "4.4.0-4.4.1");
  assert.equal(firstHopId(["4.5.5->4.4.3"], m), "4.5-4.4");
  assert.equal(firstHopId([], m), null);
});
