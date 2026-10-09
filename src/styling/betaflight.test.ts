// Golden cases: what Betaflight Configurator's CLI tab marks in each line, quirks included.
import { test } from "node:test";
import assert from "node:assert/strict";
import { styleDocument } from "./engine.ts";
import { betaflight } from "./rules/betaflight.ts";
import type { Role } from "./types.ts";

type S = [string, string];  // [text, space-separated roles]
const style = (text: string) => styleDocument([{ text, side: "left" }], betaflight)[0]
  .map((s): S => [s.text, s.roles.join(" ")]);
const C = "comment", N = "comment number", L = "comment label";

const cases: [string, S[]][] = [
  ["set motor_idle = 550", [["set", "command"], [" motor_idle = ", ""], ["550", "number"]]],
  ["feature -GPS", [["feature", "command"], [" -GPS", ""]]],
  ["aux 0 0 0 1700 2100 0 0", [["aux", "command"], [" ", ""], ["0", "number"], [" ", ""], ["0", "number"], [" ", ""],
    ["0", "number"], [" ", ""], ["1700", "number"], [" ", ""], ["2100", "number"], [" ", ""], ["0", "number"], [" ", ""],
    ["0", "number"]]],
  ["resource MOTOR 1 B06", [["resource", "command"], [" MOTOR ", ""], ["1", "number"], [" B06", ""]]],
  ["serial UART1 64 115200", [["serial", "command"], [" UART1 ", ""], ["64", "number"], [" ", ""], ["115200", "number"]]],
  ["board_name SPEEDYBEEF405V4", [["board_name", "command"], [" SPEEDYBEEF405V4", ""]]],
  ["set acc_calibration = 0,0,0,0", [["set", "command"], [" acc_calibration = ", ""], ["0", "number"], [",", ""],
    ["0", "number"], [",", ""], ["0", "number"], [",", ""], ["0", "number"]]],
  ["set dshot_bidir = ON", [["set", "command"], [" dshot_bidir = ON", ""]]],
  ["save", [["save", "command"]]],
  ["  set x = 1", [["  ", ""], ["set", "command"], [" x = ", ""], ["1", "number"]]],
  ["0x1F", [["0x1F", "number"]]],
  ["MCU: STM32F405", [["MCU:", "label"], [" STM32F405", ""]]],
  ["SD-CARD: ok 5", [["SD-CARD:", "label"], [" ok ", ""], ["5", "number"]]],
  ["Gyro 1 OK", [["Gyro ", ""], ["1", "number"], [" OK", ""]]],
  ["/ 5", [["/ 5", ""]]],
  ["", []],
  ["# profile 0", [["# profile ", C], ["0", N]]],
  ["# name: -", [["# ", C], ["name:", L], [" -", C]]],
  ["#set gyro_lpf1_static_hz = 250", [["#set gyro_lpf1_static_hz = ", C], ["250", N]]],
  ["# board: manufacturer_id: SPBE, board_name: X", [["# ", C], ["board:", L], [" ", C], ["manufacturer_id:", L],
    [" SPBE, ", C], ["board_name:", L], [" X", C]]],
  ["# Active setpoint and FF cutoff: 30Hz", [["# ", C], ["Active setpoint and FF cutoff:", L], [" ", C], ["30", N],
    ["Hz", C]]],
  ["# Betaflight / STM32F7X2 (S7X2) 4.5.5 Oct  3 2026 / 23:00:11 (abc1234) MSP API: 1.47", [
    ["# Betaflight / STM32F7X2 (S7X2) ", C], ["4.5", N], [".", C], ["5", N], [" Oct  ", C], ["3", N], [" ", C],
    ["2026", N], [" / ", C], ["23", N], [":", C], ["00", N], [":", C], ["11", N], [" (abc1234) ", C], ["MSP API:", L],
    [" ", C], ["1.47", N]]],
  ["###ERROR IN set foo = 1: INVALID NAME###", [["###ERROR IN set foo = 1: INVALID NAME###", "error"]]],
];

for (const [text, want] of cases) {
  test(`betaflight: ${JSON.stringify(text)}`, () => assert.deepEqual(style(text), want));
}

test("betaflight: roles are only the ones the Configurator uses", () => {
  const used = new Set<Role>(cases.flatMap(([t]) => styleDocument([{ text: t, side: "left" }], betaflight)[0])
    .flatMap((s) => s.roles));
  assert.deepEqual([...used].sort(), ["command", "comment", "error", "label", "number"]);
});
