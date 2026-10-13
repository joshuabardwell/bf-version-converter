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
  // the maps and the engine download while Pyodide loads: they don't need it until they're unpacked.
  // The manifest is always revalidated; every other file is fetched by its content hash, so a new
  // bundle never meets a cached file of an older one
  const bundle = (async () => {
    const manifest: Manifest = await (await fetch(`${BASE}manifest.json`, { cache: "no-cache" })).json();
    // patch maps too: a version with its own maps (4.4.0, 4.4.1) converts through them to the series' map
    const pairs = [...manifest.pairs, ...(manifest.patch_pairs ?? [])];
    const [zip, ...docs] = await Promise.all([
      fetch(`${BASE}${manifest.engine.file}?v=${manifest.engine.sha256}`).then((r) => r.arrayBuffer()),
      ...pairs.map((p) => fetch(`${BASE}${p.file}?v=${p.sha256}`).then((r) => r.text())),
    ]);
    return { manifest, pairs, zip: zip as ArrayBuffer, docs: docs as string[] };
  })();
  bundle.catch(() => {});  // a failed download is reported when it's awaited below, not as unhandled meanwhile
  const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE}pyodide.mjs`);
  const py = await loadPyodide({ indexURL: PYODIDE });

  post({ type: "status", stage: "Loading version maps…" });
  const { manifest, pairs, zip, docs } = await bundle;
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
  pairs.forEach((p, i) => {
    py.globals.set("DOC_JSON", docs[i]);
    py.runPython(`DOCS["${p.a}_to_${p.b}"] = json.loads(DOC_JSON)`);
  });
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
