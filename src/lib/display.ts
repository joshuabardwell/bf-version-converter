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
  | { type: "note"; row: number };

const CHANGED: Outcome[] = ["renamed", "transformed", "merged"];
const FOLD_MIN = 6;  // rows; shorter unchanged runs stay visible

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

/** Display items: lines, folded runs of unchanged rows, and note rows under the rows that have one. */
export function items(rows: Row[], all: Line[], opts: { showUnchanged: boolean; expanded: Set<string>;
                                                       notes: NotesMode }): Item[] {
  const out: Item[] = [];
  let run: Line[] = [];
  const runRows = () => new Set(run.map((l) => l.row)).size;
  const flush = () => {
    if (!run.length) return;
    const id = `fold-${run[0].row}`;
    if (!opts.showUnchanged && runRows() >= FOLD_MIN && !opts.expanded.has(id)) {
      // keep one line of context on each side of the fold
      const head = run.filter((l) => l.row === run[0].row);
      const tail = run.filter((l) => l.row === run[run.length - 1].row);
      const middle = run.filter((l) => !head.includes(l) && !tail.includes(l));
      head.forEach((line) => out.push({ type: "line", line }));
      out.push({ type: "fold", id, rows: new Set(middle.map((l) => l.row)).size, lines: middle });
      tail.forEach((line) => out.push({ type: "line", line }));
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
