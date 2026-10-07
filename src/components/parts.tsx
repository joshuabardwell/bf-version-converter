import { useRef, useState } from "react";
import { UploadSimple, X } from "@phosphor-icons/react";

/** The "how to get your settings" helper (design 1a). */
export function Helper() {
  return (
    <div className="card">
      <h2>How to get your settings</h2>
      <ol className="steps">
        <li><span className="num">1</span><span>In the Betaflight Configurator App, open the CLI tab.</span></li>
        <li><span className="num">2</span><span>Type <code className="accent">diff all</code> and press Enter.</span></li>
        <li><span className="num">3</span><span>Copy everything it prints and paste it on the left.</span></li>
      </ol>
      <figure className="shot">
        <img src={`${import.meta.env.BASE_URL}cli-dump-all.webp`} width={1200} height={700} loading="lazy"
             alt="The CLI tab of the Betaflight Configurator App after dump all: the output ends with save" />
        <figcaption className="muted">The CLI tab after <code>dump all</code>: copy everything down to <code>save</code>.</figcaption>
      </figure>
      <p className="muted"><code>diff all</code> = only what you changed (recommended). <code>dump all</code> = everything.</p>
    </div>
  );
}

/** The pasted text: a textarea that also takes an uploaded or dropped .txt. */
export function Paste({ text, onText, onDone, autoFocus }: {
  text: string; onText: (t: string) => void; onDone?: () => void; autoFocus?: boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const read = (f?: File | null) => f && f.text().then(onText);
  return (
    <div className="card paste">
      <div className="bar">
        <h2>Your CLI text</h2>
        <button className="btn" onClick={() => file.current?.click()}><UploadSimple size={14} /> Upload .txt</button>
        {onDone && <button className="btn primary" onClick={onDone} title="Back to the side-by-side view (Esc)">Done</button>}
        <input ref={file} type="file" accept=".txt,text/plain" hidden onChange={(e) => read(e.target.files?.[0])} />
      </div>
      <textarea
        className={`cli${over ? " drop" : ""}`} value={text} spellCheck={false} autoFocus={autoFocus}
        placeholder={"paste the output of diff all or dump all,\nor just a few lines…"}
        onChange={(e) => onText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onDone?.()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files[0]); }}
        aria-label="Your Betaflight CLI text"
      />
    </div>
  );
}

export function HowItWorks({ onClose, mapsDate }: { onClose: () => void; mapsDate?: string }) {
  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-label="How it works" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="bar" style={{ display: "flex", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>How it works</h2>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <p>The converter reads your CLI text line by line and applies a <b>version map</b>: for every setting and
          command, what happened to it between two Betaflight releases, and how to carry your value over.</p>
        <p>The maps are built by comparing the Betaflight source of each release, setting by setting, and every
          conversion is tested by pasting converted configurations into Betaflight's simulator and reading them
          back. Where a value can't carry over, the converter says so with an <span className="amber">ATTENTION</span> line
          and tells you how to set it again.</p>
        <p>Paste the converted text into the CLI tab and press Enter. The final <code>save</code> reboots the
          board. Then work through the ATTENTION lines.</p>
        <p className="muted">Everything runs in your browser: your configuration is never uploaded or stored.
          {mapsDate ? ` Version maps of ${mapsDate}.` : ""} Not affiliated with the Betaflight project.</p>
      </div>
    </div>
  );
}
