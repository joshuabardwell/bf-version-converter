// The map explorer: every setting, command and feature of a version step, and what the converter
// writes for it. Nothing here is the map's own wording: each example line (from the bundle, see
// bfmap/examples.py) is converted live by the same engine as a paste, and shown the same way.
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, MagnifyingGlass } from "@phosphor-icons/react";
import { convert } from "../engine/client";
import type { Example, Manifest, Outcome, OutputMode, PairDoc, Row } from "../engine/protocol";
import { DiffView, label } from "./DiffView";

export interface Route { hop: string | null; entity: string | null }

/** `#maps/<from>-<to>/<entity>` <-> Route; null when the hash isn't the explorer's. */
export function parseRoute(hash: string): Route | null {
  const m = hash.match(/^#maps(?:\/([^/]+))?(?:\/(.+))?$/);
  return m ? { hop: m[1] ? decodeURIComponent(m[1]) : null, entity: m[2] ? decodeURIComponent(m[2]) : null } : null;
}
export const routeHash = (r: Route) => `#maps${r.hop ? `/${r.hop}${r.entity ? `/${r.entity}` : ""}` : ""}`;

const SEVERITY: Outcome[] = ["unchanged", "renamed", "transformed", "merged", "removed", "dropped", "reinterpreted",
  "reset", "unrecognized"];
type Show = "changes" | "attention" | "converted" | "removed" | "new" | "all";
const SHOW: Record<Show, string> = { changes: "All changes", attention: "Needs attention", converted: "Converted",
  removed: "Removed", new: "New", all: "Everything" };
type Kind = "all" | "set" | "cmd" | "feature";
const KIND: Record<Kind, string> = { all: "All", set: "Settings", cmd: "Commands", feature: "Features" };

interface Hop { id: string; from: string; to: string; fromTag: string; toTag: string; pair: string;
  dir: "upgrade" | "downgrade" }
interface Entry { k: string; name: string; type: string; ex: Example[]; worst: Outcome; att: boolean;
  added: boolean }

function hops(m: Manifest): Hop[] {
  const tag = Object.fromEntries(m.series.map((s) => [s.tag, s.series]));
  return m.pairs.flatMap((p) => {
    const a = tag[p.a], b = tag[p.b], pair = `${p.a}_to_${p.b}`;
    return [{ id: `${a}-${b}`, from: a, to: b, fromTag: p.a, toTag: p.b, pair, dir: "upgrade" as const },
            { id: `${b}-${a}`, from: b, to: a, fromTag: p.b, toTag: p.a, pair, dir: "downgrade" as const }];
  });
}

function entries(doc: PairDoc, dir: Hop["dir"]): Entry[] {
  const target = dir === "upgrade" ? "b_only" : "a_only";
  const out: Entry[] = [];
  for (const [k, e] of Object.entries(doc.entities)) {
    const ex = doc.examples?.[k]?.[dir] ?? [];
    const added = e.presence === target && !ex.length;
    if (!ex.length && !added) continue;
    const worst = ex.reduce<Outcome>((w, x) => SEVERITY.indexOf(x.o) > SEVERITY.indexOf(w) ? x.o : w, "unchanged");
    const [type, ...rest] = k.split(":");
    out.push({ k, name: rest.join(":"), type, ex, worst, att: ex.some((x) => x.att), added });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name) || x.type.localeCompare(y.type));
}

function matches(e: Entry, show: Show): boolean {
  const changed = e.added || e.att || e.worst !== "unchanged";
  if (show === "all") return true;
  if (show === "changes") return changed;
  if (show === "attention") return e.att;
  if (show === "new") return e.added;
  if (show === "converted") return !e.att && ["renamed", "transformed", "merged"].includes(e.worst);
  return !e.att && ["removed", "dropped"].includes(e.worst);
}

const badge = (e: Pick<Entry, "worst" | "att" | "added">) =>
  e.added ? "New" : e.att ? "Needs you" : e.worst === "unchanged" ? "Unchanged" : label({ outcome: e.worst });
const tone = (e: Pick<Entry, "worst" | "att" | "added">) =>
  e.att ? "attn" : e.added || ["renamed", "transformed", "merged"].includes(e.worst) ? "chg" : e.worst === "unchanged" ? "" : "mut";

export function Explorer({ manifest, mode, onMode, route, onRoute, onBack }: {
  manifest: Manifest | null; mode: OutputMode; onMode: (m: OutputMode) => void;
  route: Route; onRoute: (r: Route) => void; onBack: () => void;
}) {
  const [docs, setDocs] = useState<Record<string, PairDoc>>({});
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("changes");
  const [kind, setKind] = useState<Kind>("all");

  useEffect(() => {
    if (!manifest) return;
    const base = `${import.meta.env.BASE_URL}engine/`;
    // by content hash, as the worker loads them: never a cached file of an older bundle
    Promise.all(manifest.pairs.map(async (p) =>
      [`${p.a}_to_${p.b}`, await (await fetch(`${base}${p.file}?v=${p.sha256}`)).json()] as const))
      .then((xs) => setDocs(Object.fromEntries(xs)), (e) => setError(String(e?.message ?? e)));
  }, [manifest]);

  const all = useMemo(() => manifest ? hops(manifest) : [], [manifest]);
  const order = manifest?.series.map((s) => s.series) ?? [];
  // default: the newest upgrade
  const hop = all.find((h) => h.id === route.hop) ?? all.filter((h) => h.dir === "upgrade").at(-1) ?? null;
  const doc = hop ? docs[hop.pair] : undefined;
  const list = useMemo(() => doc && hop ? entries(doc, hop.dir) : [], [doc, hop]);
  const needle = q.trim().toLowerCase();
  const shown = list.filter((e) => (kind === "all" || e.type === kind) && matches(e, needle ? "all" : show) &&
    (!needle || e.name.toLowerCase().includes(needle) || e.ex.some((x) => x.text.toLowerCase().includes(needle))));
  const current = list.find((e) => e.k === route.entity) ?? null;

  const pick = (h: string) => onRoute({ hop: h, entity: route.entity });
  const loading = !manifest || (!doc && !error);

  return (
    <>
      <div className="versions">
        <button className="btn" onClick={onBack}><ArrowLeft size={14} /> Converter</button>
        <label htmlFor="hop">Version step</label>
        <select id="hop" value={hop?.id ?? ""} onChange={(e) => pick(e.target.value)} disabled={!all.length}>
          {all.length ? [...all].sort((x, y) => order.indexOf(x.from) - order.indexOf(y.from) || (x.dir === "upgrade" ? -1 : 1))
            .map((h) => <option key={h.id} value={h.id}>{h.from} → {h.to}{h.dir === "downgrade" ? " (downgrade)" : ""}</option>)
            : <option value="">loading…</option>}
        </select>
        <span className="search">
          <MagnifyingGlass size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names and lines"
                 aria-label="Search the map" spellCheck={false} />
        </span>
        <span className="seg" role="group" aria-label="Output">
          {(["minimal", "verbose"] as OutputMode[]).map((m) => (
            <button key={m} className={mode === m ? "on" : undefined} aria-pressed={mode === m} onClick={() => onMode(m)}>
              {{ minimal: "Minimal", verbose: "Verbose" }[m]}</button>))}
        </span>
      </div>
      <div className="versions">
        <span className="muted">Show</span>
        {(Object.keys(SHOW) as Show[]).map((s) => (
          <button key={s} className={`chip${show === s && !needle ? " on" : ""}`} onClick={() => { setShow(s); setQ(""); }}>
            {SHOW[s]}</button>))}
        <span className="seg" role="group" aria-label="Type" style={{ marginLeft: "auto" }}>
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <button key={k} className={kind === k ? "on" : undefined} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {KIND[k]}</button>))}
        </span>
      </div>

      {error ? <div className="card state"><div className="title">Couldn't load the maps</div><p className="muted">{error}</p></div>
        : loading || !hop ? <div className="card state"><div className="loading">Loading the maps…</div></div> : (
        <div className="explorer">
          <ul className="elist" aria-label="Entries">
            <li className="count muted">{shown.length} of {list.length} entries{needle ? " match" : ""}</li>
            {shown.map((e) => (
              <li key={e.k}>
                <button className={e.k === current?.k ? "on" : undefined} onClick={() => onRoute({ hop: hop.id, entity: e.k })}>
                  <span className="mono">{e.type === "set" ? e.name : `${e.type === "feature" ? "feature " : ""}${e.name}`}</span>
                  <span className={`badge ${tone(e)}`}>{badge(e)}</span>
                </button>
              </li>))}
          </ul>
          <div className="edetail">
            {current ? <Detail key={`${hop.id}/${current.k}`} e={current} hop={hop} doc={doc!} mode={mode} />
              : <div className="card state">
                  <div className="title">{hop.from} → {hop.to}</div>
                  <p className="muted">Pick an entry to see what the converter writes for it. Every example is converted
                    live, exactly as if you pasted that line, and you can try your own.</p>
                </div>}
          </div>
        </div>)}
    </>
  );
}

function Detail({ e, hop, doc, mode }: { e: Entry; hop: Hop; doc: PairDoc; mode: OutputMode }) {
  const first = e.ex[0]?.text.split("\n").at(-1) ?? (e.type === "set" ? `set ${e.name} = ` : e.name);
  const [own, setOwn] = useState(first);
  const [tried, setTried] = useState(first);
  useEffect(() => { const t = setTimeout(() => setTried(own), 300); return () => clearTimeout(t); }, [own]);
  const added = doc.pilot_text[`${e.k}|${hop.dir}|*`];
  const prs = doc.entities[e.k]?.prs ?? [];
  return (
    <div className="card edetail-card">
      <div className="ehead">
        <h2 className="mono">{e.name}</h2>
        <span className="muted">{KIND[e.type as Kind]?.replace(/s$/, "").toLowerCase()} · {hop.from} → {hop.to}</span>
        <span className={`badge ${tone(e)}`}>{badge(e)}</span>
      </div>
      {e.added ? (
        <p>New in {hop.to}. {hop.from} has no <code>{e.name}</code>, so there's no line to convert: after converting,
          it starts at its {hop.to} default.{added?.comment ? <> {added.comment}.</> : null}</p>
      ) : (
        <>
          {e.ex.map((x) => (
            <div key={x.text} className="example">
              {x.via && <div className="muted via">Written from <code>{x.via.split(":").slice(1).join(":")}</code>:</div>}
              <Converted text={x.text} hop={hop} mode={mode} />
            </div>))}
          <div className="example">
            <label className="muted" htmlFor="own">Try your own line</label>
            <input id="own" className="cli-input" value={own} onChange={(ev) => setOwn(ev.target.value)} spellCheck={false} />
            {tried.trim() && <Converted text={tried} hop={hop} mode={mode} />}
          </div>
        </>)}
      {prs.length > 0 && (
        <div className="prs"><span className="muted">PRs</span>
          {prs.map((p) => <a key={p.n} className="pr" href={`https://github.com/betaflight/betaflight/pull/${p.n}`}
                             target="_blank" rel="noreferrer" title={p.title}>#{p.n}</a>)}
        </div>)}
    </div>
  );
}

/** A crash in the explorer shows its message and the way back, never a blank page. */
export class ExplorerBoundary extends Component<{ children: ReactNode; onBack: () => void }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { error: String((e as Error)?.message ?? e) }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card state">
        <div className="title">The version maps couldn't be shown</div>
        <p className="muted">{this.state.error}</p>
        <div className="actions">
          <button className="btn" onClick={() => location.reload()}>Reload</button>
          <button className="btn" onClick={() => { this.setState({ error: null }); this.props.onBack(); }}>
            <ArrowLeft size={14} /> Converter</button>
        </div>
      </div>);
  }
}

/** One input, converted live by the engine, shown as the converter shows it. */
function Converted({ text, hop, mode }: { text: string; hop: Hop; mode: OutputMode }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    convert({ text, src_series: hop.from, dst_series: hop.to, mode }).then((r) => {
      if (!live) return;
      if (r.status === "converted") { setRows((r.rows ?? []).filter((x) => x.kind !== "header")); setErr(null); }
      else { setRows(null); setErr(r.status === "not_cli" ? "Not a CLI line" : r.status); }
    }, (e: Error) => live && setErr(e.message));
    return () => { live = false; };
  }, [text, hop.from, hop.to, mode]);
  if (err) return <div className="muted">{err}</div>;
  if (!rows) return <div className="loading muted">Converting…</div>;
  return (
    <DiffView compact rows={rows} input={text} notes="all" showUnchanged
              header={<div className="heads"><div><span className="muted">Pasted · {hop.from}</span></div>
                <div><span className="muted">Converted · {hop.to}</span></div></div>} />
  );
}
