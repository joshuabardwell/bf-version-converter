// Browser parity: the built app, in headless Chromium, converts each case exactly like the Python engine.
//   PARITY_CASES=<cases.json> npm run test:browser       (cases come from the private pipeline)
// Each case: {name, text, to, mode, expected, attention}; the test sets the Output toggle to `mode`. The app is served from dist/ by `vite preview`,
// loads Pyodide from the CDN and the bundle from public/engine, and the test reads what Copy writes.
// Explorer cases ({explorer: true, hop, entity, mode, expected: [lines per example]}) open the map
// explorer at #maps/<hop>/<entity> and read each example's converted column.
import { readFileSync } from "node:fs";
import { preview } from "vite";
import { chromium } from "playwright";

const cases = JSON.parse(readFileSync(process.env.PARITY_CASES, "utf-8"));
const server = await preview({ preview: { port: 4179, strictPort: true } });
const url = "http://localhost:4179/bf-version-converter/";
const browser = await chromium.launch();
let failed = 0;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    window.__copied = null;
    navigator.clipboard.writeText = async (t) => { window.__copied = t; };
  });
  await page.goto(url);
  const t0 = Date.now();
  await page.getByText("Converts as you paste").waitFor({ timeout: 120_000 });
  console.log(`engine ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const c of cases.filter((x) => !x.explorer)) {
    await page.evaluate(() => { window.__copied = null; });
    if (await page.getByRole("button", { name: "edit or paste again" }).isVisible().catch(() => false))
      await page.getByRole("button", { name: "edit or paste again" }).click();
    await page.locator("#to").selectOption(c.to);
    await page.getByLabel("Your Betaflight CLI text").fill(c.text);
    const t1 = Date.now();
    await page.getByRole("button", { name: /^Copy \d+ lines?$/ }).first().waitFor({ timeout: 60_000 });
    const seg = page.getByRole("group", { name: "Output" })
      .getByRole("button", { name: c.mode === "verbose" ? "Verbose" : "Minimal" });
    if ((await seg.getAttribute("aria-pressed")) !== "true") await seg.click();
    // wait for this case's result: the button shows the expected text's line count
    const n = c.expected.replace(/\n$/, "").split("\n").length;
    const copy = page.getByRole("button", { name: `Copy ${n} lines` }).first();
    await copy.waitFor({ timeout: 60_000 });
    await copy.click();
    const got = await page.evaluate(() => window.__copied);
    const ok = got === c.expected;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${c.name} (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
    if (!ok) {
      const g = (got ?? "").split("\n"), e = c.expected.split("\n");
      const i = e.findIndex((l, k) => l !== g[k]);
      console.log(`   first difference at line ${i + 1}:\n   want: ${e[i]}\n   got:  ${g[i]}`);
    }
    await page.keyboard.press("Escape");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
  }
  const ex = cases.filter((x) => x.explorer);
  let exFailed = 0;
  const t2 = Date.now();
  for (const c of ex) {
    await page.evaluate((h) => { location.hash = h; }, `#maps/${c.hop}/${c.entity}`);
    const seg = page.getByRole("group", { name: "Output" })
      .getByRole("button", { name: c.mode === "verbose" ? "Verbose" : "Minimal" });
    if ((await seg.getAttribute("aria-pressed")) !== "true") await seg.click();
    const card = page.locator(".edetail-card");
    let got = null;
    // the examples, then "Try your own line": wait until every one has converted (for this mode)
    for (let i = 0; i < 200; i++) {
      got = await card.evaluate((el, h) => {
        if (!el.querySelector("h2") || location.hash !== h) return null;
        const exs = [...el.querySelectorAll(".example")];
        if (exs.some((x) => x.querySelector(".loading"))) return null;
        // lines of the converted text: a numbered right cell (a row that writes nothing has none)
        return exs.map((x) => [...x.querySelectorAll(".grid > .t.right")]
          .filter((t) => t.previousElementSibling?.textContent).map((t) => t.textContent));
      }, `#maps/${c.hop}/${c.entity}`).catch(() => null);
      if (got && got.length === c.expected.length + 1 && JSON.stringify(got.slice(0, -1)) === JSON.stringify(c.expected)) break;
      await page.waitForTimeout(50);
    }
    const ok = !!got && JSON.stringify(got.slice(0, -1)) === JSON.stringify(c.expected);
    if (!ok) {
      exFailed++;
      console.log(`FAIL ${c.name}
   want: ${JSON.stringify(c.expected).slice(0, 400)}
   got:  ${JSON.stringify(got).slice(0, 400)}`);
    }
  }
  if (ex.length) console.log(`explorer: ${ex.length - exFailed}/${ex.length} PASS (${((Date.now() - t2) / 1000).toFixed(1)} s)`);
  failed += exFailed;
  if (process.env.SCREENSHOT) {
    await page.evaluate(() => { location.hash = "#maps/4.5-2025.12/set:motor_idle"; });
    await page.waitForTimeout(1500);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: process.env.SCREENSHOT, fullPage: true });
  }
  if (errors.length) { failed++; console.log("page errors:", errors); }
} finally {
  await browser.close();
  server.httpServer.close();
}
console.log(failed ? `${failed} FAILED` : `all ${cases.length} PASS`);
process.exit(failed ? 1 : 0);
