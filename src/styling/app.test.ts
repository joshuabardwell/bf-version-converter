// Golden cases: where the app's rules mark a line differently from the Configurator's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { styleDocument } from "./engine.ts";
import { appRules } from "./rules/index.ts";

type S = [string, string];  // [text, space-separated roles]
const style = (text: string) => styleDocument([{ text, side: "left" }], appRules)[0]
  .map((s): S => [s.text, s.roles.join(" ")]);
const C = "comment", N = "comment number";

const cases: [string, S[]][] = [
  // feedback#17: a hex ID is one word, not leading digits and a tail
  ["mcu_id 0028002b3034510a32373331", [["mcu_id", "command"], [" 0028002b3034510a32373331", ""]]],
  ["set name = Petrel 85", [["set", "command"], [" name = Petrel 85", ""]]],
  ["set name = 85", [["set", "command"], [" name = ", ""], ["85", "number"]]],
  ["set x = -5", [["set", "command"], [" x = -", ""], ["5", "number"]]],
  ["set acc_calibration = 0,0,0,0", [["set", "command"], [" acc_calibration = ", ""], ["0", "number"], [",", ""],
    ["0", "number"], [",", ""], ["0", "number"], [",", ""], ["0", "number"]]],
  ["set vtx_freq = 0x1F", [["set", "command"], [" vtx_freq = ", ""], ["0x1F", "number"]]],
  ["  set gyro_1_sensor_align = CW90", [["  ", ""], ["set", "command"], [" gyro_1_sensor_align = CW90", ""]]],
  ["aux 0 0 0 1700 2100 0 0", [["aux", "command"], [" ", ""], ["0", "number"], [" ", ""], ["0", "number"], [" ", ""],
    ["0", "number"], [" ", ""], ["1700", "number"], [" ", ""], ["2100", "number"], [" ", ""], ["0", "number"], [" ", ""],
    ["0", "number"]]],
  ["resource MOTOR 1 B06", [["resource", "command"], [" MOTOR ", ""], ["1", "number"], [" B06", ""]]],
  ["# Active setpoint and FF cutoff: 30Hz", [["# ", C], ["Active setpoint and FF cutoff:", "comment label"],
    [" 30Hz", C]]],
  ["# Betaflight / STM32F7X2 (S7X2) 4.5.5 Oct  3 2026", [["# Betaflight / STM32F7X2 (S7X2) ", C], ["4.5.5", N],
    [" Oct  ", C], ["3", N], [" ", C], ["2026", N]]],
];

for (const [text, want] of cases) {
  test(`app: ${JSON.stringify(text)}`, () => assert.deepEqual(style(text), want));
}
