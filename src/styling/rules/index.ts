// The app's rule set: Betaflight's CLI colouring, extended with the converter's own categories.
// New categories go here as named rules (and a Role in types.ts, and a theme entry in styles.css),
// never in components.
//   - a number is marked only when it is a whole word: the Configurator marks the leading digits of
//     `mcu_id 0028002b...` and leaves the rest plain (feedback#17); a dotted version (4.5.5) is
//     one number, and `30Hz` is a word, not a number
//   - a `set` value that isn't numbers is text, marked as one: no `85` picked out of `Petrel 85`
import { extend } from "../engine.ts";
import { betaflight } from "./betaflight.ts";

const SET = /^(\s*)set\s+\S+\s*=\s*(.*)$/;
const NUMERIC = /^(?:-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)*|0x[0-9A-Fa-f]+)?\s*$/;

export const appRules = extend(betaflight, {
  line: [{
    add: {
      id: "app.set-text",
      match: (l) => {
        const m = SET.exec(l.text);
        if (!m || NUMERIC.test(m[2])) return null;
        const start = m[1].length;
        return { head: { start, end: start + 3, roles: ["command"] }, tokens: false };
      },
    },
    before: "bf.first-word",
  }],
  token: [{ replace: "bf.number", with: { id: "app.number", pattern: /\b\d+(?:\.\d+)*(?!\w|\.\d)/, roles: ["number"] } }],
});
