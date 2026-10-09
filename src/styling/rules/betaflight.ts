// How Betaflight Configurator's CLI tab colours its output, re-stated as rules (observed behaviour of
// the Configurator's CLI highlighter, master 2026-10; written here, not copied). Quirks are kept on
// purpose: this is the baseline the app's own rules extend.
//   - `###ERROR` lines: error, nothing else marked
//   - `#` lines: comment, with labels and numbers inside still marked
//   - first word all lowercase letters/underscores: command (set, aux, board_name, ...)
//   - otherwise a first word directly followed by `:`: label, colon included
//   - anywhere after that: `Words:` labels, 0x hex and decimals
// Not marked, as in the Configurator: ON/OFF and other word values, setting names, `-GPS`, pins
// like `B06` (no word boundary before the digits), anything in a line that starts with a symbol
// other than `#` (a line starting with a digit is a "first word" and still gets its numbers marked).
import type { RuleSet } from "../types.ts";

const ERROR = /^###ERROR/;
const COMMENT = /^\s*#/;
const FIRST = /^(\s*)([\w-]+)/;
const COMMAND = /^[a-z][a-z_]*$/;

export const betaflight: RuleSet = {
  line: [
    { id: "bf.error", match: (l) => ERROR.test(l.text) ? { roles: ["error"], tokens: false } : null },
    { id: "bf.comment", match: (l) => COMMENT.test(l.text) ? { roles: ["comment"] } : null },
    {
      id: "bf.first-word",
      match: (l) => {
        const m = FIRST.exec(l.text);
        if (!m) return { tokens: false };  // starts with a symbol: nothing marked, numbers included
        const start = m[1].length, end = start + m[2].length;
        if (COMMAND.test(m[2])) return { head: { start, end, roles: ["command"] }, tokens: { from: end } };
        if (l.text[end] === ":") return { head: { start, end: end + 1, roles: ["label"] }, tokens: { from: end + 1 } };
        return { tokens: { from: start } };
      },
    },
  ],
  token: [
    { id: "bf.label", pattern: /\b[A-Za-z_]\w*(?:\s+[A-Za-z_]\w*)*:/, roles: ["label"] },
    { id: "bf.hex", pattern: /\b0x[0-9A-Fa-f]+/, roles: ["number"] },
    { id: "bf.number", pattern: /\b\d+(?:\.\d+)?/, roles: ["number"] },
  ],
  trackers: [],
};
