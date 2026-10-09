// What the Python engine (bfmap.engine.app_convert) returns, and the worker's messages.

export type Outcome =
  | "unchanged" | "renamed" | "transformed" | "merged" | "removed" | "dropped" | "reinterpreted" | "reset"
  | "unrecognized";

export interface Row {
  src_line: number | null;      // line in the pasted text (1-based), null for lines the converter adds
  original: string | null;
  kind: string;                 // header / new / blank / comment / section / set / cmd / successor / relocated
  entity: string | null;        // e.g. set:motor_idle
  outcome: Outcome;
  attention: boolean;
  lines: string[];              // what this row writes into the converted text
  group: string | null;         // ties a merge's inputs to the merged line
  suggest: string[];            // close known names, for an unrecognized line
  notes: { note?: string | null; detail?: string | null }[];
  prs: { n: number; title: string }[];
}

export interface Detection {
  kind: "dump" | "diff" | "snippet" | "not_cli" | "empty";
  status: "detected" | "dev" | "unsupported" | "none";
  version: string | null;
  platform: string | null;
  board: string | null;
  series: string | null;
  closest?: string | null;
  covered?: boolean;
  reason?: string;
  first_line?: string | null;
}

export interface Response {
  status: "converted" | "same" | "need_source" | "unsupported" | "empty" | "not_cli";
  detect: Detection;
  src_series: string | null;
  dst_series: string;
  hops?: string[];
  text?: string;
  attention_lines?: number;
  kind?: string;
  rows?: Row[];
}

/** minimal: labels only, reasons in the app; verbose: each change followed by its explanation block. */
export type OutputMode = "minimal" | "verbose";

export interface Request {
  text: string;
  src_series: string | null;    // null: from the header
  dst_series: string;
  mode: OutputMode;
}

export interface Series { series: string; tag: string; covers: string[] }
export interface Manifest {
  name: string;
  maps_date: string;
  series: Series[];
  pairs: { a: string; b: string; file: string; sha256: string; bytes: number }[];
  engine: { file: string; sha256: string; bytes: number };
}

export type ToWorker =
  | { type: "convert"; id: number; request: Request };

export type FromWorker =
  | { type: "status"; stage: string }
  | { type: "ready"; manifest: Manifest }
  | { type: "result"; id: number; response: Response }
  | { type: "error"; id?: number; message: string };
