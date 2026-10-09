// Text styling: rules (data) -> engine -> roles (meaning) -> theme (styles.css). All colouring of CLI
// text goes through here.
export { styleDocument, extend, type Edit, type Extension } from "./engine.ts";
export { appRules } from "./rules/index.ts";
export { betaflight } from "./rules/betaflight.ts";
export type { Role, Span, RowFacts, StyleLine, State, RuleSet, LineRule, TokenRule, Tracker, LineMatch } from "./types.ts";
