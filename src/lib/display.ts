// Engine rows -> the side-by-side diff: one display line per text line, left (pasted) and right
// (converted) aligned row by row, with runs of unchanged rows folded.
import type { Outcome, Row } from "../engine/protocol";

export interface Cell { n: number; text: string }
export interface Line {
  row: number;                 // index into the engine rows
  left: Cell | null;           // the pasted line (shown once per source line)
  right: Cell | null;          // a line of the converted text
  outcome: Outcome;
  attention: boolean;
  tone: "plain" | "changed" | "attention" | "muted" | "header";
}
export type Item =
  | { type: "line"; line: Line }
  | { type: "fold"; id: string; rows: number; lines: Line[] }
  | { type: "unfold"; id: string; rows: number; end: boolean }
  | { type: "note"; row: number };

const CHANGED: Outcome[] = ["renamed", "transformed", "merged"];
const FOLD_MIN = 6;  // rows; shorter unchanged runs stay visible
const HIDE_BOTH_ENDS = 20;  // rows; longer open folds get a "hide" bar at the bottom too

export function tone(r: Row): Line["tone"] {
  if (r.kind === "header" || r.kind === "new") return "header";
  if (r.attention) return "attention";
  if (CHANGED.includes(r.outcome)) return "changed";
  if (r.outcome === "removed" || r.outcome === "dropped") return "muted";
  return "plain";
}

/** All display lines, in order, with both columns' line numbers. */
export function lines(rows: Row[], input: string): Line[] {
  const src = input.replace(/\r\n/g, "\n").split("\n");
  const shown = new Set<number>();
  const out: Line[] = [];
  let right = 0;
  rows.forEach((r, k) => {
    const t = tone(r);
    const leftCell = (): Cell | null => {
      if (r.src_line == null || shown.has(r.src_line)) return null;
      shown.add(r.src_line);
      return { n: r.src_line, text: src[r.src_line - 1] ?? r.original ?? "" };
    };
    if (r.lines.length === 0) {  // e.g. a merge input: its value lives on in another row
      out.push({ row: k, left: leftCell(), right: null, outcome: r.outcome, attention: r.attention, tone: t });
      return;
    }
    r.lines.forEach((text) => {
      out.push({ row: k, left: leftCell(), right: { n: ++right, text }, outcome: r.outcome,
                 attention: r.attention, tone: t });
    });
  });
  return out;
}

export function hasNote(r: Row, mode: NotesMode): boolean {
  if (mode === "off") return false;
  if (r.outcome === "unrecognized") return true;
  if (!r.notes.some((n) => n.note)) return false;
  return mode === "all" ? r.outcome !== "unchanged" : r.attention;
}

export type NotesMode = "attention" | "all" | "off";

/** Display items: lines, folded runs of unchanged rows, and note rows under the rows that have one.
 *  A fold is open when `showUnchanged` XOR its id is in `toggled`; an open fold gets "hide" bars. */
export function items(rows: Row[], all: Line[], opts: { showUnchanged: boolean; toggled: Set<string>;
                                                       notes: NotesMode }): Item[] {
  const out: Item[] = [];
  // nothing but headers and unchanged lines: folding would leave a header over a bar, which reads
  // as no output, so everything stays open
  const fold = all.some((l) => (l.tone !== "plain" && l.tone !== "header") || hasNote(rows[l.row], opts.notes));
  let run: Line[] = [];
  const runRows = () => new Set(run.map((l) => l.row)).size;
  const flush = () => {
    if (!run.length) return;
    const id = `fold-${run[0].row}`;
    const n = runRows();
    if (fold && n >= FOLD_MIN) {  // the whole run folds into one bar
      if (opts.showUnchanged !== opts.toggled.has(id)) {
        out.push({ type: "unfold", id, rows: n, end: false });
        run.forEach((line) => out.push({ type: "line", line }));
        if (n > HIDE_BOTH_ENDS) out.push({ type: "unfold", id, rows: n, end: true });
      } else out.push({ type: "fold", id, rows: n, lines: run });
    } else run.forEach((line) => out.push({ type: "line", line }));
    run = [];
  };
  all.forEach((line, i) => {
    const r = rows[line.row];
    const noted = hasNote(r, opts.notes);
    if (line.tone === "plain" && !noted) {
      run.push(line);
      return;
    }
    flush();
    out.push({ type: "line", line });
    const next = all[i + 1];
    if (noted && (!next || next.row !== line.row))  // under the row's last line
      out.push({ type: "note", row: line.row });
  });
  flush();
  return out;
}

export interface Counts { lines: number; carried: number; converted: number; attention: number }

export function counts(rows: Row[], attentionLines: number): Counts {
  const real = rows.filter((r) => r.src_line != null && (r.kind === "set" || r.kind === "cmd" || r.kind === "section"));
  return {
    lines: new Set(real.map((r) => r.src_line)).size,
    carried: real.filter((r) => r.outcome === "unchanged").length,
    converted: real.filter((r) => CHANGED.includes(r.outcome)).length,
    attention: attentionLines,
  };
}

/** Where the divider goes, as the left column's share of the text width `T` (px): both columns
 *  untruncated if they fit (spare space split evenly), else the converted column first, down to a
 *  left column of `min`. Neither column goes below `min`. */
export function fitSplit(T: number, needL: number, needR: number, min: number): number {
  if (T <= 0) return 0.5;
  const left = needL + needR <= T ? needL + (T - needL - needR) / 2 : T - Math.min(needR, T - min);
  return clampSplit(left, T, min);
}

/** A left column of `left` px, kept at least `min` px from either edge, as a share of `T`. */
export function clampSplit(left: number, T: number, min: number): number {
  if (T <= 2 * min) return 0.5;
  return Math.min(T - min, Math.max(min, left)) / T;
}
