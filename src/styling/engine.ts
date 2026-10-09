// The styling engine: rules in, spans out. Every line goes through two passes:
//   1. line rules (first match wins) give the whole line roles and may mark a leading head;
//   2. token rules mark pieces of the rest (leftmost match first, rule order breaks ties).
// The spans of a line always join back to exactly the line's text.
import type { LineMatch, LineRule, Role, RuleSet, Span, State, StyleLine, TokenRule, Tracker } from "./types.ts";

/** Style every line of one column, in order, threading the trackers' state through. */
export function styleDocument(lines: StyleLine[], rules: RuleSet): Span[][] {
  const state: State = {};
  const tokens = rules.token.map((t) => ({ ...t, sticky: new RegExp(t.pattern.source, stickyFlags(t.pattern)) }));
  return lines.map((line) => {
    const spans = styleLine(line, rules.line, tokens, state);
    for (const t of rules.trackers) t.update(line, state);
    return spans;
  });
}

type Compiled = TokenRule & { sticky: RegExp };

function stickyFlags(p: RegExp): string {
  return p.flags.replace(/[gy]/g, "") + "y";
}

function styleLine(line: StyleLine, lineRules: LineRule[], tokens: Compiled[], state: State): Span[] {
  const text = line.text;
  let m: LineMatch = {};
  for (const r of lineRules) {
    const hit = r.match(line, state);
    if (hit) { m = hit; break; }
  }
  const base = m.roles ?? [];
  const out: Span[] = [];
  const push = (s: string, roles: Role[]) => {
    if (!s) return;
    const last = out[out.length - 1];
    if (last && same(last.roles, roles)) last.text += s;
    else out.push({ text: s, roles });
  };

  const head = m.head;
  const from = m.tokens === false ? text.length : m.tokens?.from ?? 0;
  // the text is cut into: before head, head, after head; token rules run on whatever lies at or past
  // `from` outside the head
  const pieces: [number, number, Role[] | null][] = head
    ? [[0, head.start, null], [head.start, head.end, head.roles], [head.end, text.length, null]]
    : [[0, text.length, null]];
  for (const [a, b, roles] of pieces) {
    if (roles) { push(text.slice(a, b), [...base, ...roles]); continue; }
    const t0 = Math.max(a, Math.min(from, b));
    push(text.slice(a, t0), base);
    for (const s of tokenize(text.slice(t0, b), tokens)) push(s.text, [...base, ...s.roles]);
  }
  return out;
}

/** Token pass over one segment (matched as a string of its own, so `\b` sees the segment's edges). */
function tokenize(seg: string, tokens: Compiled[]): Span[] {
  const out: Span[] = [];
  let plain = "";
  let i = 0;
  while (i < seg.length) {
    let hit: { len: number; roles: Role[] } | null = null;
    for (const t of tokens) {
      t.sticky.lastIndex = i;
      const r = t.sticky.exec(seg);
      if (r && r[0].length > 0) { hit = { len: r[0].length, roles: t.roles }; break; }
    }
    if (!hit) { plain += seg[i++]; continue; }
    if (plain) { out.push({ text: plain, roles: [] }); plain = ""; }
    out.push({ text: seg.slice(i, i + hit.len), roles: hit.roles });
    i += hit.len;
  }
  if (plain) out.push({ text: plain, roles: [] });
  return out;
}

function same(a: Role[], b: Role[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** A change to a rule set: add a rule before/after a named one (default: at the end), replace one,
 *  or remove one. Line rules, token rules and trackers are edited the same way. */
export type Edit<R extends { id: string }> =
  | { add: R; before?: string; after?: string }
  | { replace: string; with: R }
  | { remove: string };

export interface Extension {
  line?: Edit<LineRule>[];
  token?: Edit<TokenRule>[];
  trackers?: Edit<Tracker>[];
}

/** A new rule set: `base` with the edits applied in order. Unknown ids throw, so a renamed base rule
 *  can't silently turn an edit into a no-op. */
export function extend(base: RuleSet, ext: Extension): RuleSet {
  return {
    line: apply(base.line, ext.line ?? []),
    token: apply(base.token, ext.token ?? []),
    trackers: apply(base.trackers, ext.trackers ?? []),
  };
}

function apply<R extends { id: string }>(list: R[], edits: Edit<R>[]): R[] {
  const out = [...list];
  const at = (id: string) => {
    const k = out.findIndex((r) => r.id === id);
    if (k < 0) throw new Error(`styling: no rule "${id}"`);
    return k;
  };
  for (const e of edits) {
    if ("remove" in e) out.splice(at(e.remove), 1);
    else if ("replace" in e) out.splice(at(e.replace), 1, e.with);
    else if (e.before) out.splice(at(e.before), 0, e.add);
    else if (e.after) out.splice(at(e.after) + 1, 0, e.add);
    else out.push(e.add);
  }
  return out;
}
