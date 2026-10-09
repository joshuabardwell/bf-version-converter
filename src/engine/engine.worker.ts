/// <reference lib="webworker" />
// Runs the converter: Pyodide (pinned, from jsDelivr) + the bundle in public/engine/.
// Everything stays in the browser: the pasted text is only ever passed to this worker.
import type { FromWorker, Manifest, ToWorker } from "./protocol";

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
const BASE = new URL("engine/", new URL(import.meta.env.BASE_URL, self.location.origin)).href;

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let convert: ((requestJson: string) => string) | null = null;

async function start() {
  post({ type: "status", stage: "Loading converter…" });
  const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE}pyodide.mjs`);
  const py = await loadPyodide({ indexURL: PYODIDE });

  post({ type: "status", stage: "Loading version maps…" });
  // the manifest is always revalidated; every other file is fetched by its content hash, so a new
  // bundle never meets a cached file of an older one
  const manifest: Manifest = await (await fetch(`${BASE}manifest.json`, { cache: "no-cache" })).json();
  const zip = await (await fetch(`${BASE}${manifest.engine.file}?v=${manifest.engine.sha256}`)).arrayBuffer();
  py.unpackArchive(zip, "zip", { extractDir: "/engine" });
  py.globals.set("MANIFEST_JSON", JSON.stringify(manifest));
  py.runPython(`
import json, sys
sys.path.insert(0, "/engine")
from bfmap.engine import app_convert
MANIFEST = json.loads(MANIFEST_JSON)
DOCS = {}
def convert_json(request_json):
    return json.dumps(app_convert(json.loads(request_json), MANIFEST, DOCS))
`);
  for (const p of manifest.pairs) {
    const text = await (await fetch(`${BASE}${p.file}?v=${p.sha256}`)).text();
    py.globals.set("DOC_JSON", text);
    py.runPython(`DOCS["${p.a}_to_${p.b}"] = json.loads(DOC_JSON)`);
  }
  py.globals.delete("DOC_JSON");
  const fn = py.globals.get("convert_json");
  convert = (req: string) => fn(req) as string;
  post({ type: "ready", manifest });
}

const started = start().catch((e) => post({ type: "error", message: String(e?.message ?? e) }));

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type !== "convert") return;
  await started;
  if (!convert) return;
  try {
    post({ type: "result", id: msg.id, response: JSON.parse(convert(JSON.stringify(msg.request))) });
  } catch (e) {
    post({ type: "error", id: msg.id, message: String((e as Error)?.message ?? e) });
  }
};
