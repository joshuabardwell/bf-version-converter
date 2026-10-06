// The converter as a React hook: starts the worker on page open (so Python is usually ready by the
// time the pilot pastes) and converts, debounced, whenever the text or the versions change.
import { useEffect, useRef, useState } from "react";
import type { FromWorker, Manifest, Response } from "./protocol";

export interface EngineState {
  stage: string | null;        // loading progress, null once ready
  error: string | null;
  manifest: Manifest | null;
  response: Response | null;
  busy: boolean;
  target: string;              // the target series (the latest unless chosen)
}

export function useEngine(text: string, src: string | null, dst: string | null, delayMs = 250): EngineState {
  const worker = useRef<Worker | null>(null);
  const lastId = useRef(0);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [stage, setStage] = useState<string | null>("Starting…");
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<Response | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const w = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data;
      if (m.type === "status") setStage(m.stage);
      else if (m.type === "ready") { setStage(null); setManifest(m.manifest); }
      else if (m.type === "result" && m.id === lastId.current) { setResponse(m.response); setBusy(false); setError(null); }
      else if (m.type === "error" && (m.id === undefined || m.id === lastId.current)) { setError(m.message); setBusy(false); }
    };
    return () => w.terminate();
  }, []);

  const series = manifest?.series ?? [];
  const target = dst || series[series.length - 1]?.series || "";
  useEffect(() => {
    if (!manifest || !worker.current) return;
    if (!text.trim()) { setResponse(null); setBusy(false); return; }
    setBusy(true);
    const t = setTimeout(() => {
      const id = ++lastId.current;
      worker.current?.postMessage({ type: "convert", id, request: { text, src_series: src, dst_series: target } });
    }, delayMs);
    return () => clearTimeout(t);
  }, [manifest, text, src, target, delayMs]);

  return { stage, error, manifest, response, busy, target };
}
