// The converter as a React hook over the shared engine (client.ts): converts, debounced, whenever
// the text, the versions or the output mode change, and keeps only the latest answer.
import { useEffect, useRef, useState } from "react";
import { convert, engineStatus, onStatus, type Status } from "./client";
import type { Manifest, OutputMode, Response } from "./protocol";

export interface EngineState {
  stage: string | null;        // loading progress, null once ready
  error: string | null;
  manifest: Manifest | null;
  response: Response | null;
  busy: boolean;
  target: string;              // the target series (the latest unless chosen)
}

/** The engine's loading status, as React state. */
export function useEngineStatus(): Status {
  const [s, setS] = useState<Status>(engineStatus);
  useEffect(() => onStatus(setS), []);
  return s;
}

export function useEngine(text: string, src: string | null, dst: string | null, mode: OutputMode,
                          delayMs = 250): EngineState {
  const { stage, error: loadError, manifest } = useEngineStatus();
  const lastId = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<Response | null>(null);
  const [busy, setBusy] = useState(false);

  const series = manifest?.series ?? [];
  const target = dst || series[series.length - 1]?.series || "";
  useEffect(() => {
    if (!manifest) return;
    if (!text.trim()) { setResponse(null); setBusy(false); return; }
    setBusy(true);
    const t = setTimeout(() => {
      const id = ++lastId.current;
      convert({ text, src_series: src, dst_series: target, mode }).then(
        (r) => { if (id === lastId.current) { setResponse(r); setBusy(false); setError(null); } },
        (e: Error) => { if (id === lastId.current) { setError(e.message); setBusy(false); } });
    }, delayMs);
    return () => clearTimeout(t);
  }, [manifest, text, src, target, mode, delayMs]);

  return { stage, error: loadError ?? error, manifest, response, busy, target };
}
