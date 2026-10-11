// "Report a problem": one line of the converted output -> the map-feedback issue form on GitHub,
// pre-filled (.github/ISSUE_TEMPLATE/map-feedback.yml; the private pipeline's `bfmap feedback` reads
// it). Nothing is sent from the app: the URL opens GitHub, where the pilot reviews it and submits.
import type { Manifest, Row } from "../engine/protocol";

export const NEW_ISSUE = "https://github.com/joshuabardwell/bf-version-converter/issues/new";
export const TEMPLATE = "map-feedback.yml";
// per field, so the URL stays well under what browsers and GitHub accept
export const FIELD_MAX = { line: 300, output: 1200, what_happened: 1500, expected: 1000, link: 300 };

export interface Report {
  from: string;          // the exact version the line came from (4.4.1), or its series without a header
  to: string;            // the target series' release
  line: string;          // the pasted line, as the pilot wrote it
  output: string[];      // what the converter wrote for it, minimal mode
  what?: string;
  expected?: string;
  link?: string | null;  // the entry in the map explorer
}

/** Can a pilot report this row? A line of their text, or a line merged from theirs: not the banner, a
 *  blank or a comment. */
export function reportable(r: Row): boolean {
  const o = (r.original ?? "").trim();
  if (["header", "new", "blank", "comment"].includes(r.kind) || o.startsWith("#")) return false;
  return (r.src_line != null && !!o) || (r.kind === "successor" && r.lines.length > 0);
}

/** The pasted line(s) a row came from: its own, or for a merged line the inputs of its merge (none
 *  when an earlier step of a chain dropped them: the rows don't carry them then). */
export function sourceLines(rows: Row[], k: number): string[] {
  const r = rows[k];
  if (r.original?.trim()) return [r.original.trim()];
  return r.group ? rows.filter((x) => x.group === r.group && x.original?.trim()).map((x) => x.original!.trim()) : [];
}

export function clip(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

/** The issue form's URL, every field pre-filled (empty ones left out). */
export function reportUrl(r: Report): string {
  const fields: Record<string, string> = {
    template: TEMPLATE,
    title: `Map feedback: ${clip(r.line.trim(), 60)} (${r.from} → ${r.to})`,
    from_version: r.from,
    to_version: r.to,
    line: clip(r.line.trim(), FIELD_MAX.line),
    output: clip(r.output.join("\n").trim(), FIELD_MAX.output),
    what_happened: clip((r.what ?? "").trim(), FIELD_MAX.what_happened),
    expected: clip((r.expected ?? "").trim(), FIELD_MAX.expected),
    link: clip(r.link ?? "", FIELD_MAX.link),
  };
  const q = new URLSearchParams(Object.entries(fields).filter(([, v]) => v));
  return `${NEW_ISSUE}?${q}`;
}

/** The explorer's id (`#maps/<id>/…`) of a conversion's first step ("4.4.0->4.4.1" in Response.hops):
 *  a patch map by its tags, a series map by its series. */
export function firstHopId(hops: string[] | undefined, m: Manifest | null): string | null {
  const h = hops?.[0];
  if (!h || !m) return null;
  const [a, b] = h.split("->");
  if ((m.patch_pairs ?? []).some((p) => p.a === a && p.b === b)) return `${a}-${b}`;
  const s = Object.fromEntries(m.series.map((x) => [x.tag, x.series]));
  return s[a] && s[b] ? `${s[a]}-${s[b]}` : null;
}
