// The one engine worker of the page, shared by the converter and the map explorer: it starts on
// page open (so Python is usually ready by the time the pilot pastes), and every caller's
// conversion is answered by id.
import type { FromWorker, Manifest, Request, Response } from "./protocol";

export interface Status { stage: string | null; error: string | null; manifest: Manifest | null }

let worker: Worker | null = null;
let nextId = 0;
let status: Status = { stage: "Starting…", error: null, manifest: null };
const listeners = new Set<(s: Status) => void>();
const pending = new Map<number, { resolve: (r: Response) => void; reject: (e: Error) => void }>();

const set = (s: Partial<Status>) => {
  status = { ...status, ...s };
  listeners.forEach((f) => f(status));
};

function start(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const m = ev.data;
    if (m.type === "status") set({ stage: m.stage });
    else if (m.type === "ready") set({ stage: null, manifest: m.manifest });
    else if (m.type === "result") { pending.get(m.id)?.resolve(m.response); pending.delete(m.id); }
    else if (m.type === "error") {
      if (m.id === undefined) set({ error: m.message });
      else { pending.get(m.id)?.reject(new Error(m.message)); pending.delete(m.id); }
    }
  };
  return worker;
}

/** Current status, and a subscription to changes (returns the unsubscribe). */
export function engineStatus(): Status { start(); return status; }
export function onStatus(f: (s: Status) => void): () => void {
  start();
  listeners.add(f);
  return () => { listeners.delete(f); };
}

/** One conversion, exactly as the app's converter runs it. */
export function convert(request: Request): Promise<Response> {
  const w = start();
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type: "convert", id, request });
  });
}
