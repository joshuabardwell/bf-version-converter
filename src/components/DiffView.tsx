// The side-by-side diff (design 2a) with folded unchanged runs, note rows (2c) and the attention
// minimap (2b). One scroll container, so both columns scroll together.
import { Fragment, forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import type { Row } from "../engine/protocol";
import { type Item, type Line, type NotesMode, items as buildItems, lines as buildLines } from "../lib/display";
import { appRules, styleDocument, type Span, type StyleLine } from "../styling";
import { StyledText } from "./StyledText";

export interface DiffHandle { nextAttention: () => void; first: () => void }

interface Props {
  rows: Row[];
  input: string;
  rightOnly?: boolean;
  notes: NotesMode;
  showUnchanged: boolean;
  onEditLeft?: () => void;
  onApplySuggestion?: (row: Row, name: string) => void;
  onKeepAsComment?: (row: Row) => void;
  header: React.ReactNode;
}

export const DiffView = forwardRef<DiffHandle, Props>(function DiffView(p, ref) {
  // folds flipped by hand, relative to "Show unchanged"; the toggle resets them all
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [toggledFor, setToggledFor] = useState(p.showUnchanged);
  if (toggledFor !== p.showUnchanged) { setToggledFor(p.showUnchanged); setToggled(new Set()); }
  const flip = (id: string) => setToggled((s) => { const t = new Set(s); t.has(id) ? t.delete(id) : t.add(id); return t; });
  const [details, setDetails] = useState<Set<number>>(new Set());
  const scroller = useRef<HTMLDivElement>(null);
  const cursor = useRef(-1);
  const all = useMemo(() => buildLines(p.rows, p.input), [p.rows, p.input]);
  const shown = useMemo(() => buildItems(p.rows, all, { showUnchanged: p.showUnchanged, toggled, notes: p.notes }),
    [p.rows, all, p.showUnchanged, toggled, p.notes]);
  const styled = useMemo(() => styleColumns(all, p.rows), [all, p.rows]);
  const attentionRows = useMemo(() => [...new Set(all.filter((l) => l.attention).map((l) => l.row))], [all]);

  const goTo = (row: number) => {
    const fold = shown.find((it) => it.type === "fold" && it.lines.some((l) => l.row === row));
    if (fold && fold.type === "fold") flip(fold.id);
    requestAnimationFrame(() => {
      const el = scroller.current?.querySelector<HTMLElement>(`[data-row="${row}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.parentElement?.querySelectorAll(`[data-row="${row}"]`).forEach((x) => {
        x.classList.remove("flash"); void (x as HTMLElement).offsetWidth; x.classList.add("flash");
      });
    });
  };
  useImperativeHandle(ref, () => ({
    nextAttention: () => {
      if (!attentionRows.length) return;
      cursor.current = (cursor.current + 1) % attentionRows.length;
      goTo(attentionRows[cursor.current]);
    },
    first: () => { cursor.current = 0; if (attentionRows.length) goTo(attentionRows[0]); },
  }));

  const cells = (l: Line) => {
    const c = `c-${l.tone}`;
    const left = !p.rightOnly && [
      <div key="ln" className={`n lnum ${c}`} data-row={l.row}>{l.left?.n ?? ""}</div>,
      <div key="lt" className={`t left ${c}${l.outcome === "unrecognized" && l.left ? " underline" : ""}`}
           onClick={p.onEditLeft}>{l.left && <StyledText spans={styled.left.get(l)!} />}</div>,
    ];
    return [
      ...(left || []),
      <div key="rn" className={`n r rnum ${c}`} data-row={l.row}>{l.right?.n ?? ""}</div>,
      <div key="rt" className={`t right ${c}`}>{l.right && <StyledText spans={styled.right.get(l)!} />}</div>,
    ];
  };

  const note = (k: number) => {
    const r = p.rows[k];
    const name = (r.entity ?? "").split(":").slice(1).join(":") || (r.original ?? "").trim().split(/\s+/)[1] || "";
    if (r.outcome === "unrecognized") {
      const word = (r.original ?? "").trim().split(/\s+/);
      return (
        <div key={`note-${k}`} className="note attn">
          <span className="who">Not recognized. </span>
          {r.suggest.length ? <>Probably a typo for <code>{r.suggest[0]}</code>. </> : <>Not a setting or command of this version. </>}
          {r.suggest.length > 0 && p.onApplySuggestion && (
            <button className="link" onClick={() => p.onApplySuggestion!(r, r.suggest[0])}>
              Use {word[0] === "set" ? `${r.suggest[0]} ${word.slice(2).join(" ")}` : `${r.suggest[0]} ${word.slice(1).join(" ")}`}
            </button>)}
          {p.onKeepAsComment && <> · <button className="link" onClick={() => p.onKeepAsComment!(r)}>Keep as comment</button></>}
        </div>);
    }
    const n = r.notes.find((x) => x.note) ?? r.notes[0] ?? {};
    const open = details.has(k);
    // PRs the text doesn't already cite (and link) by number
    const cited = new Set(r.notes.flatMap((x) => [x.note, x.detail]).join(" ").match(/(?<=PR #)\d+/g) ?? []);
    const related = [...new Set(r.prs.map((pr) => String(pr.n)))].filter((x) => !cited.has(x));
    return (
      <div key={`note-${k}`} className={`note ${r.attention ? "attn" : "info"}`}>
        <span className="who">{r.attention ? "Needs you" : label(r)} · {name}. </span>{rich(n.note)}{" "}
        {(r.notes.some((x) => x.detail) || related.length > 0) && (
          <button className="link" onClick={() => setDetails((s) => { const t = new Set(s); t.has(k) ? t.delete(k) : t.add(k); return t; })}>
            Details {open ? <CaretDown size={11} /> : <CaretRight size={11} />}
          </button>)}
        {open && (
          <div className="detail">
            {[...new Set(r.notes.map((x) => x.detail).filter(Boolean))].map((d, i) => <p key={i}>{rich(d)}</p>)}
            {related.length > 0 && (
              <div className="prs"><span className="muted">Related PRs</span>
                {related.map((x) => <a key={x} className="pr" href={prUrl(x)} target="_blank" rel="noreferrer">#{x}</a>)}
              </div>)}
          </div>)}
      </div>);
  };

  // close an open fold and keep its bar in view (a click on a long fold's bottom bar would jump otherwise)
  const hide = (id: string) => {
    flip(id);
    requestAnimationFrame(() =>
      scroller.current?.querySelector(`[data-fold="${id}"]`)?.scrollIntoView({ block: "nearest" }));
  };

  const total = shown.length || 1;
  const ticks = shown.map((it, i) => it.type === "line" && it.line.right && it.line.tone !== "plain" && it.line.tone !== "header"
    ? { i, row: it.line.row, att: it.line.attention, mut: it.line.tone === "muted" } : null).filter(Boolean) as
    { i: number; row: number; att: boolean; mut: boolean }[];

  return (
    <div className="diffwrap" style={p.rightOnly ? { gridTemplateColumns: "1fr 14px" } : undefined}>
      <div className="diff">
        {p.header}
        <div className="scroll" ref={scroller}>
          <div className={`grid${p.rightOnly ? " right-only" : ""}`}>
            {shown.map((it: Item, i) => {
              if (it.type === "line") return cells(it.line);
              if (it.type === "note") return (  // under the converted column: it explains the converted line
                <Fragment key={`note-${it.row}`}>{!p.rightOnly && <div className="note-gap" />}{note(it.row)}</Fragment>);
              if (it.type === "unfold") return (
                <button key={`${it.id}-${it.end ? "end" : "start"}`} className="fold" onClick={() => hide(it.id)}>
                  ··· {it.rows} lines carried over unchanged · hide ···
                </button>);
              return (
                <button key={it.id} className="fold" data-fold={it.id} onClick={() => flip(it.id)}>
                  ··· {it.rows} lines carried over unchanged · show ···
                </button>);
              void i;
            })}
          </div>
        </div>
      </div>
      <div className="minimap" aria-label="Changes in the converted text">
        {ticks.map((t) => (
          <i key={`${t.i}`} className={t.att ? "att" : t.mut ? "mut" : ""} style={{ top: `${(100 * t.i) / total}%` }}
             onClick={() => goTo(t.row)} title={t.att ? "needs your attention" : "converted"} />))}
      </div>
    </div>
  );
});

/** Each column styled as one document, in order, with its rows' facts from the engine. */
function styleColumns(all: Line[], rows: Row[]): Record<"left" | "right", Map<Line, Span[]>> {
  const column = (side: "left" | "right") => {
    const shown = all.filter((l) => l[side]);
    const input: StyleLine[] = shown.map((l) => {
      const r = rows[l.row];
      return { text: l[side]!.text, side, row: { kind: r.kind, outcome: r.outcome, attention: r.attention, entity: r.entity } };
    });
    const spans = styleDocument(input, appRules);
    return new Map(shown.map((l, k) => [l, spans[k]]));
  };
  return { left: column("left"), right: column("right") };
}

function label(r: Row): string {
  return { renamed: "Renamed", transformed: "Converted", merged: "Merged", removed: "Removed", dropped: "Dropped",
           reset: "Reset", reinterpreted: "Changed meaning", unrecognized: "Not recognized", unchanged: "Note" }[r.outcome];
}

const prUrl = (n: string | number) => `https://github.com/betaflight/betaflight/pull/${n}`;

/** Pilot text with `inline code` rendered as code and "PR #123" linked to the pull request. */
function rich(s?: string | null) {
  if (!s) return null;
  return s.split(/(`[^`]+`|PR #\d+)/).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="accent">{part.slice(1, -1)}</code>;
    if (/^PR #\d+$/.test(part)) return <a key={i} href={prUrl(part.slice(4))} target="_blank" rel="noreferrer">{part}</a>;
    return part;
  });
}
