// "Report a problem" (user design, 2026-10-11): one button, then the pilot picks ONE line of the
// converted output (pick mode, in DiffView), then this dialog opens GitHub's map-feedback form
// pre-filled. One report is one line, so it targets one map entry. Nothing is sent from here.
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowSquareOut, X } from "@phosphor-icons/react";
import { reportUrl, type Report } from "../lib/report";

/** Pick mode's banner, in place of the output's toolbar. */
export function PickBanner({ onCancel, onShowUnchanged }: { onCancel: () => void; onShowUnchanged?: () => void }) {
  return (
    <span className="pickbar" role="status">
      <span>Click the line in the converted output that looks wrong.</span>
      {onShowUnchanged && <button className="link" onClick={onShowUnchanged}>Show unchanged lines</button>}
      <button className="btn" onClick={onCancel}>Cancel</button>
    </span>);
}

/** The review panel: what goes into the issue, two optional boxes, then GitHub in a new tab. */
export function ReportDialog({ report, explorer, onBack, onClose }: {
  report: Report; explorer?: string | null; onBack?: () => void; onClose: () => void;
}) {
  const [what, setWhat] = useState("");
  const [expected, setExpected] = useState("");
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  const open = () => {
    window.open(reportUrl({ ...report, what, expected }), "_blank", "noopener,noreferrer");
    onClose();
  };
  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-label="Report a problem" onClick={onClose}>
      <div className="card report" onClick={(e) => e.stopPropagation()}>
        <div className="bar">
          <h2>Report a problem</h2>
          <button className="btn" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <div className="muted">{report.from} → {report.to}</div>
        <dl>
          <dt>You pasted</dt>
          <dd>{report.line
            ? <code>{report.line}</code>
            : <span className="muted">Not shown: this line was merged from lines of yours that an earlier version
                step replaced. Please add your original line on GitHub.</span>}</dd>
          <dt>Converter</dt>
          <dd><pre>{report.output.join("\n") || "(no line written)"}</pre>
            {explorer && <a href={explorer} onClick={onClose}>View this entry in the map explorer</a>}</dd>
        </dl>
        <label htmlFor="r-what">What's wrong? <span className="muted">(optional)</span></label>
        <textarea id="r-what" rows={3} value={what} onChange={(e) => setWhat(e.target.value)} autoFocus />
        <label htmlFor="r-exp">What did you expect? <span className="muted">(optional)</span></label>
        <textarea id="r-exp" rows={2} value={expected} onChange={(e) => setExpected(e.target.value)} />
        <p className="muted">This opens a GitHub issue in a new tab with the above filled in. Nothing is sent until you
          press Submit there (you need a GitHub account). Only this line is included, not your whole config.</p>
        <div className="actions">
          {onBack && <button className="btn" onClick={onBack}><ArrowLeft size={14} /> Pick a different line</button>}
          <button className="btn primary" onClick={open}>Open on GitHub <ArrowSquareOut size={14} /></button>
        </div>
      </div>
    </div>);
}
