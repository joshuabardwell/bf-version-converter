import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Check, Copy, DownloadSimple, Flag, SpinnerGap, Warning } from "@phosphor-icons/react";
import { convert } from "./engine/client";
import { useEngine } from "./engine/useEngine";
import type { OutputMode, Response, Row } from "./engine/protocol";
import { DiffView, rich, type DiffHandle } from "./components/DiffView";
import { Helper, HowItWorks, Paste } from "./components/parts";
import { Explorer, ExplorerBoundary, parseRoute, routeHash, type Route } from "./components/Explorer";
import { PickBanner, ReportDialog } from "./components/Report";
import { counts, withInput, type NotesMode } from "./lib/display";
import { firstHopId, sourceLines, type Report } from "./lib/report";

export default function App() {
  const [text, setText] = useState("");
  const [src, setSrc] = useState<string>("auto");
  const [dst, setDst] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState<NotesMode>("attention");
  const [mode, setMode] = useState<OutputMode>("minimal");
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [about, setAbout] = useState(false);
  // "Report a problem": pick one output line, then the dialog (Report.tsx)
  const [picking, setPicking] = useState(false);
  const [report, setReport] = useState<(Report & { explorer: string | null }) | null>(null);
  const diff = useRef<DiffHandle>(null);
  // the map explorer lives at #maps…; the converter keeps its state (and pasted text) underneath
  const [route, setRoute] = useState<Route | null>(() => parseRoute(location.hash));
  useEffect(() => {
    const f = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const go = (r: Route | null) => { location.hash = r ? routeHash(r) : ""; };

  const engine = useEngine(text, src === "auto" ? null : src, dst || null, mode);
  const series = engine.manifest?.series ?? [];
  const target = engine.target;
  const res = engine.response;
  // every pasted line shows on the left, whatever rows the engine returned
  const rows = useMemo(() => res?.status === "converted" ? withInput(res.rows ?? [], text) : [], [res, text]);
  const c = useMemo(() => counts(rows, res?.attention_lines ?? 0), [rows, res?.attention_lines]);
  // the banner's button jumps to the first ATTENTION line, then on through the rest (feedback from Delay)
  const [jumped, setJumped] = useState(false);
  useEffect(() => setJumped(false), [rows]);

  const det = res?.detect;
  const order = series.map((s) => s.series);
  const from = res?.src_series ?? (src === "auto" ? det?.series ?? null : src);
  const downgrade = from && order.indexOf(target) < order.indexOf(from);
  const mismatch = src !== "auto" && det?.status === "detected" && det.series && det.series !== src;
  // a patch release the drift check hasn't verified against the map's version: converted anyway, with a warning
  const unverified = det?.status === "detected" && det.covered === false && (src === "auto" || src === det.series);
  // what the drift check found about this exact patch release that a pilot should know (scope.json pilot notes)
  const versionNotes = det?.status === "detected" && (src === "auto" || src === det.series) ? det.notes ?? [] : [];

  const copy = async (t: string) => {
    await navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const download = (t: string) => {
    const tag = series.find((s) => s.series === target)?.tag ?? target;
    const name = `${det?.board ? det.board + "_" : ""}${tag}.txt`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([t], { type: "text/plain" }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const editLine = (row: Row, f: (line: string) => string) => {
    if (row.src_line == null) return;
    const ls = text.replace(/\r\n/g, "\n").split("\n");
    ls[row.src_line - 1] = f(ls[row.src_line - 1] ?? "");
    setText(ls.join("\n"));
  };
  const applySuggestion = (row: Row, name: string) => editLine(row, (l) => {
    const w = l.trim().split(/\s+/);
    if (w[0] === "set" && w.length > 1) w[1] = name; else w[0] = name;
    return w.join(" ");
  });

  const pickRow = async (k: number) => {
    const r = rows[k];
    let out = r.lines;
    if (mode !== "minimal") {  // the issue gets the short form: labels, not the explanation blocks
      const m = await convert({ text, src_series: src === "auto" ? null : src, dst_series: target, mode: "minimal" });
      out = withInput(m.rows ?? [], text)[k]?.lines ?? out;
    }
    const hop = firstHopId(res?.hops, engine.manifest);
    const hash = hop && r.entity ? routeHash({ hop, entity: r.entity }) : null;
    setReport({ from: det?.version ?? from ?? "", to: series.find((s) => s.series === target)?.tag ?? target,
                line: sourceLines(rows, k).join("\n"), output: out.filter((x) => x.trim()),
                link: hash && `${location.origin}${location.pathname}${hash}`, explorer: hash });
    setPicking(false);
  };

  const empty = !text.trim();
  const converted = res?.status === "converted" && !!res.text;
  const lines = res?.text ? res.text.replace(/\n$/, "").split("\n").length : 0;

  const header = converted && res ? (
    <div className="heads">
      {!editing && (
        <div>
          <span>Your text · {det?.version ?? from}</span>
          <span className="grow">
            <button className="link" onClick={() => setEditing(true)}>edit or paste again</button>
          </span>
        </div>)}
      <div>
        <span>Converted · {target}</span>
        {picking ? <PickBanner onCancel={() => setPicking(false)}
                               onShowUnchanged={showUnchanged ? undefined : () => setShowUnchanged(true)} /> :
        <span className="grow">
          {c.attention > 0 && <button className="link" onClick={() => diff.current?.nextAttention()}>
            <ArrowDown size={12} /> next attention</button>}
          <span className="seg" role="group" aria-label="Output">
            {(["minimal", "verbose"] as OutputMode[]).map((m) => (
              <button key={m} className={mode === m ? "on" : undefined} aria-pressed={mode === m} onClick={() => setMode(m)}
                      title={m === "minimal" ? "Short labels in the text; the reasons are in the notes here"
                        : "Every change followed by its explanation, PRs included"}>
                {{ minimal: "Minimal", verbose: "Verbose" }[m]}</button>))}
          </span>
          <button className="btn" onClick={() => download(res.text!)} title="Download as a .txt file">
            <DownloadSimple size={14} /> .txt</button>
          <button className="btn primary" onClick={() => copy(res.text!)}>
            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy {lines} lines</>}</button>
          <button className="link" onClick={() => setPicking(true)}
                  title="Pick a line of the converted output, then open a pre-filled GitHub issue">
            <Flag size={12} /> Report a problem</button>
        </span>}
      </div>
    </div>) : null;

  return (
    <div className="page">
      <header className="top">
        <h1>bf-version-converter</h1>
        <span className="muted">for Betaflight</span>
        <nav>
          <a href="https://github.com/joshuabardwell/bf-version-converter" target="_blank" rel="noopener noreferrer">
            Source Code (GitHub)</a>
          <button onClick={() => go(route ? null : { hop: null, entity: null })} aria-pressed={!!route}
                  className={route ? "on" : undefined}>Version Map Explorer</button>
          <button onClick={() => setAbout(true)}>How it works</button>
        </nav>
      </header>
      <div className="narrow">Works best on a bigger screen. On a phone you can still paste, convert and copy.</div>

      {route ? <ExplorerBoundary onBack={() => go(null)}>
                 <Explorer manifest={engine.manifest} mode={mode} onMode={setMode} route={route} onRoute={go}
                           onBack={() => go(null)} />
               </ExplorerBoundary> : <>

      <div className="versions">
        <label htmlFor="from">From</label>
        <select id="from" value={src} onChange={(e) => setSrc(e.target.value)}
                className={!empty && res?.status === "need_source" ? "amber-field" : undefined}>
          <option value="auto">{det?.status === "detected" && det.version ? `${det.version} · from header${det.covered === false ? "" : " ✓"}` : "auto-detect"}</option>
          {series.map((s) => <option key={s.series} value={s.series}>{s.series}</option>)}
        </select>
        <span aria-hidden>→</span>
        <label htmlFor="to">To</label>
        <select id="to" value={target} onChange={(e) => setDst(e.target.value)} disabled={!series.length}>
          {series.length ? series.map((s) => <option key={s.series} value={s.series}>{s.series}</option>)
            : <option value="">loading…</option>}
        </select>
        {downgrade && res?.status === "converted" && <span className="tag">downgrade</span>}
        {mismatch && <><span className="amber">Header says {det!.version}.</span>
          <button className="chip" onClick={() => setSrc(det!.series!)}>Use {det!.series}</button></>}
        {unverified && <span className="amber">
          {det!.newer ? `${det!.version} is newer than our maps, which were checked against ${det!.tag}.`
                      : `${det!.version} isn't verified to match ${det!.tag}.`} Converted with the {det!.tag} map: check the result.
        </span>}
        {versionNotes.map((n, i) => <span key={i} className="amber">{det!.version}: {rich(n)}</span>)}
        {converted ? (
          <span className="summary">
            {c.lines} {c.lines === 1 ? "line" : "lines"} · <span>{c.carried} carried over</span> · <span className="accent">{c.converted} converted</span>
            {" · "}<span className={c.attention ? "amber" : undefined}>{c.attention} need your attention</span>
          </span>) : <span className="hint">{engine.stage ?? "Converts as you paste"}</span>}
      </div>

      {converted && c.attention > 0 && !editing && (
        <div className="banner">
          <Warning size={16} className="amber" />
          <span><span className="amber">{c.attention} {c.attention === 1 ? "line needs" : "lines need"} your attention before you fly.</span>
            <span className="muted"> The rest converted automatically.</span></span>
          <button onClick={() => { if (jumped) diff.current?.nextAttention(); else diff.current?.first(); setJumped(true); }}>
            {jumped && c.attention > 1 ? "Jump to next ↓" : "Jump to first ↓"}</button>
        </div>)}

      {converted && !editing ? (
        <>
          <div className="versions">
            <span className="muted">Notes</span>
            {(["attention", "all", "off"] as NotesMode[]).map((m) => (
              <button key={m} className={`chip${notes === m ? " on" : ""}`} onClick={() => setNotes(m)}>
                {{ attention: "Attention only", all: "All changes", off: "Off" }[m]}</button>))}
            <button className={`chip${showUnchanged ? " on" : ""}`} onClick={() => setShowUnchanged((x) => !x)}>
              Show unchanged</button>
          </div>
          <DiffView ref={diff} rows={rows} input={text} notes={notes} showUnchanged={showUnchanged}
                    onEditLeft={() => setEditing(true)} header={header}
                    onApplySuggestion={applySuggestion} onKeepAsComment={(r) => editLine(r, (l) => `# ${l}`)}
                    picking={picking} onPick={pickRow} onPickCancel={() => setPicking(false)} />
        </>
      ) : (
        <div className="panes">
          <Paste text={text} onText={setText} autoFocus={editing}
                 onDone={converted ? () => setEditing(false) : undefined} />
          {converted ? (
            <DiffView ref={diff} rows={rows} input={text} notes="off" showUnchanged={showUnchanged} rightOnly header={header}
                      picking={picking} onPick={pickRow} onPickCancel={() => setPicking(false)} />
          ) : (
            <RightPane res={res} empty={empty} stage={engine.stage} error={engine.error}
                       series={order} onSource={setSrc} onTarget={setDst} onCopyOriginal={() => copy(text)} />
          )}
        </div>
      )}

      </>}

      <footer className="foot">
        {converted && !route
          ? <span>Next: paste into the CLI tab · press Enter · the final <code className="accent">save</code> reboots the board
            {c.attention ? ` · then read through the ${c.attention} ATTENTION ${c.attention === 1 ? "line" : "lines"}` : ""}</span>
          : <span />}
        <span className="privacy">Your config never leaves your browser and isn't saved: "Report a problem" opens a
          GitHub issue with just the line you pick, for you to review. Not affiliated with the Betaflight project.</span>
      </footer>
      {about && <HowItWorks onClose={() => setAbout(false)} mapsDate={engine.manifest?.maps_date} />}
      {report && <ReportDialog report={report} explorer={report.explorer}
                               onBack={() => { setReport(null); setPicking(true); }} onClose={() => setReport(null)} />}
    </div>
  );
}

/** Edge states, in the right column where the result would be (design 1p/1r). */
function RightPane({ res, empty, stage, error, series, onSource, onTarget, onCopyOriginal }: {
  res: Response | null; empty: boolean; stage: string | null; error: string | null; series: string[];
  onSource: (s: string) => void; onTarget: (s: string) => void; onCopyOriginal: () => void;
}) {
  if (error) return <div className="card state"><div className="title">Something went wrong</div><p className="muted">{error}</p></div>;
  if (empty || !res) {
    return stage && !empty
      ? <div className="card state"><div className="loading"><SpinnerGap size={16} /> {stage}</div></div>
      : <Helper />;
  }
  const d = res.detect;
  const chips = (pick: (s: string) => void, highlight?: string | null) => (
    <div className="actions">{series.map((s) => (
      <button key={s} className={`chip${s === highlight ? " on" : ""}`} onClick={() => pick(s)}>{s}</button>))}</div>);
  if (res.status === "not_cli") return (
    <div className="card state">
      <div className="label">Unrecognized text</div>
      <div className="title">This doesn't look like Betaflight CLI output</div>
      <p className="muted">We look for lines like <code>set …</code>, <code>feature …</code>, <code>aux …</code>. First line we saw:</p>
      {d.first_line && <code className="muted">"{d.first_line.slice(0, 80)}"</code>}
    </div>);
  if (res.status === "unsupported") return (
    <div className="card state">
      <div className="label">Unsupported version</div>
      <div className="title">The header says {d.version}. This converter supports {series[0]} and newer.</div>
      <p className="muted">If the text is really from a newer version, pick it:</p>{chips(onSource)}
    </div>);
  if (res.status === "need_source" && d.status === "dev") return (
    <div className="card state">
      <div className="label">Unknown version</div>
      <div className="title">The header says {d.version}. We don't have a map for it.</div>
      <p className="muted">Pick the version it's closest to:</p>{chips(onSource, d.closest)}
    </div>);
  if (res.status === "need_source") return (
    <div className="card state">
      <div className="label">No header</div>
      <div className="title">No version line found. Which firmware is this from?</div>
      {chips(onSource)}
    </div>);
  if (res.status === "same") return (
    <div className="card state">
      <div className="label">Same version</div>
      <div className="title">From and To are both {res.dst_series}</div>
      <p className="muted">Nothing to convert. Your text works as is.</p>
      <div className="actions">
        {series.filter((s) => s !== res.dst_series).slice(-1).map((s) =>
          <button key={s} className="chip" onClick={() => onTarget(s)}>Change target</button>)}
        <button className="chip" onClick={onCopyOriginal}>Copy original</button>
      </div>
    </div>);
  return <Helper />;
}
