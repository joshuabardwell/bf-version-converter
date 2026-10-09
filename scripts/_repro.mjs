import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", String(e.stack || e).slice(0, 600)));
await p.goto(process.argv[2]);
await p.getByRole("button", { name: "Version Map Explorer" }).click();
for (const s of [1, 5, 25]) { await p.waitForTimeout(s * 1000); console.log(`${s}s:`, (await p.locator("body").innerText()).slice(0, 120).replace(/\n/g, " | ")); }
await b.close();
