// The styling engine's vocabulary. Roles say what a piece of text *is*; the theme in styles.css
// decides what each role looks like. Nothing here knows about colours, React or the DOM.

/** What a piece of CLI text is. Add a role here, a rule that assigns it, and a theme entry. */
export type Role =
  | "comment"   // a `#` line
  | "command"   // the command word that starts a line: set, aux, feature, ...
  | "label"     // `WORD:` or `Some Words:`
  | "number"    // decimal or 0x hex
  | "error";    // a `###ERROR ...` line from the firmware

/** A run of text and the roles it carries, outermost first (a number in a comment: comment, number). */
export interface Span { text: string; roles: Role[] }

/** What the converter engine said about the row a line belongs to (from the engine, never guessed). */
export interface RowFacts { kind: string; outcome: string; attention: boolean; entity: string | null }

/** One line to style: its text, which column it is in, and its row's facts when it has a row. */
export interface StyleLine { text: string; side: "left" | "right"; row?: RowFacts }

/** State carried from line to line through a document (e.g. the current profile). Trackers write it. */
export type State = Record<string, unknown>;

/** What a line rule decides about a whole line. */
export interface LineMatch {
  roles?: Role[];                                         // carried by every span of the line
  head?: { start: number; end: number; roles: Role[] };   // a leading part with roles of its own
  tokens?: { from: number } | false;                      // run token rules on text[from..] (outside head)
}

/** Ordered: the first line rule that returns a match decides the line. */
export interface LineRule {
  id: string;
  match: (line: StyleLine, state: Readonly<State>) => LineMatch | null;
}

/** Ordered: at each position, the first token rule whose pattern matches there wins (leftmost first).
 *  `pattern` must not be global or sticky; the engine anchors it. */
export interface TokenRule { id: string; pattern: RegExp; roles: Role[] }

/** Updates the state after each line is styled, so later lines can depend on earlier ones. */
export interface Tracker { id: string; update: (line: StyleLine, state: State) => void }

export interface RuleSet {
  line: LineRule[];
  token: TokenRule[];
  trackers: Tracker[];
}
