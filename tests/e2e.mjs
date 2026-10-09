// End-to-end smoke test in headless Chromium.
// Usage: node tests/e2e.mjs [url]   (default http://localhost:4173/)
// Needs puppeteer-core and @sparticuz/chromium (or set CHROME_PATH).
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:4173/";
let executablePath = process.env.CHROME_PATH;
let args = [];
if (!executablePath) {
  const chromium = (await import("@sparticuz/chromium")).default;
  executablePath = await chromium.executablePath();
  args = chromium.args;
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath, args, headless: true, defaultViewport: { width: 1400, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const els = () => page.evaluate(() => window.narwhal.getSceneElements().map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, w: e.width, h: e.height, opacity: e.opacity })));
const selected = () => page.evaluate(() => Object.keys(window.narwhal.getAppState().selectedElementIds).length);
const clickBtn = (text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll(".bar button")].find((x) => x.textContent.includes(t));
    if (!b) throw new Error("no button " + t);
    b.click();
  }, text);
const saved = () => page.waitForFunction(() => document.querySelector(".status .save")?.classList.contains("saved"), { timeout: 5000 });

async function stroke(points) {
  await page.mouse.move(...points[0]);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...p, { steps: 4 });
  await page.mouse.up();
  await sleep(150);
}

await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.narwhal, { timeout: 15000 });
check("App loads with editor", true, await page.title());

// 1. Pen stroke
await clickBtn("Pen");
await stroke([[500, 300], [540, 320], [580, 300], [620, 330]]);
let list = await els();
check("Pen draws a freehand stroke", list.length === 1 && list[0].type === "freedraw");

// 2. Highlighter stroke
await clickBtn("Highlight");
await stroke([[500, 400], [650, 400]]);
list = await els();
check("Highlighter draws a translucent stroke", list.length === 2 && list[1].opacity === 35);

// 3. Text box next to the handwriting
await page.keyboard.press("Escape");
await page.keyboard.press("t");
await page.mouse.click(700, 300);
await sleep(200);
await page.keyboard.type("Hello from Narwhal");
await page.keyboard.press("Escape");
await sleep(200);
list = await els();
check("Text box created", list.some((e) => e.type === "text"));

// 4. Paste a screenshot image (synthetic clipboard paste)
await page.evaluate(async () => {
  const c = document.createElement("canvas");
  c.width = 120; c.height = 80;
  const g = c.getContext("2d"); g.fillStyle = "#4dabf7"; g.fillRect(0, 0, 120, 80);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const dt = new DataTransfer();
  dt.items.add(new File([blob], "shot.png", { type: "image/png" }));
  document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
});
await sleep(1200);
list = await els();
check("Pasted screenshot becomes an image object", list.some((e) => e.type === "image"));

// 5. Lasso around pen + highlighter + text (not the image if it landed elsewhere)
await page.keyboard.press("Escape");
await clickBtn("Lasso");
await sleep(100);
const lassoBox = await page.$(".lasso-overlay");
check("Lasso overlay appears", !!lassoBox);
await stroke([[470, 260], [900, 260], [900, 440], [470, 440], [470, 262]]);
const nSel = await selected();
const inBox = (await els()).filter((e) => e.type !== "image" && e.x > 400 && e.x < 900).length;
check("Lasso selects the circled objects", nSel >= 3 && nSel >= inBox, `${nSel} selected`);

// 6. Lasso "remove" mode
await clickBtn("Lasso");
await clickBtn("Remove");
await stroke([[480, 380], [670, 380], [670, 420], [480, 420], [480, 382]]);
check("Lasso remove-from-selection", (await selected()) === nSel - 1, `${await selected()} selected`);

// 7. Move selection by dragging (editor handles it)
const before = (await els()).find((e) => e.type === "text");
await page.keyboard.press("Escape");
await clickBtn("Lasso");
await stroke([[690, 280], [900, 280], [900, 330], [690, 330], [690, 282]]);
const t0 = (await els()).find((e) => e.type === "text");
await page.mouse.move(t0.x + 20 + 0, t0.y + 10);
const vp = await page.evaluate((x, y) => {
  const s = window.narwhal.getAppState();
  return { x: (x + s.scrollX) * s.zoom.value + s.offsetLeft, y: (y + s.scrollY) * s.zoom.value + s.offsetTop };
}, t0.x + 20, t0.y + 8);
await stroke([[vp.x, vp.y], [vp.x + 60, vp.y + 80]]);
const after = (await els()).find((e) => e.type === "text");
check("Dragging moves the lasso selection", Math.round(after.y - before.y) === 80, `dy=${Math.round(after.y - before.y)}`);

// 8. Undo / redo via toolbar buttons
await clickBtn("Undo");
await sleep(150);
const undone = (await els()).find((e) => e.type === "text");
check("Undo button reverts the move", Math.round(undone.y) === Math.round(before.y));
await clickBtn("Redo");
await sleep(150);
check("Redo button re-applies the move", Math.round((await els()).find((e) => e.type === "text").y) === Math.round(after.y));

// 9. Duplicate + delete buttons
const n0 = (await els()).length;
await page.click('button[title^="Duplicate selection"]');
await sleep(150);
check("Duplicate selection", (await els()).length === n0 + 1);
await page.click('button[title="Delete selection"]');
await sleep(150);
check("Delete selection", (await els()).length === n0);

// 10. Autosave + reload recovery
await saved();
const countBeforeReload = (await els()).length;
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction(() => window.narwhal, { timeout: 15000 });
await sleep(800);
const reloaded = await els();
check("Reload restores autosaved document (incl. image)", reloaded.length === countBeforeReload && reloaded.some((e) => e.type === "image"), `${reloaded.length} objects`);

// 11. Multiple documents
page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Second doc" : undefined));
await clickBtn("New");
await sleep(800);
check("New document starts empty", (await els()).length === 0);
const names = await page.$$eval(".doc-select option", (o) => o.map((x) => x.textContent));
check("Document list shows both docs", names.includes("Second doc") && names.includes("My first note"), names.join(", "));
const firstId = await page.$$eval(".doc-select option", (o) => o.find((x) => x.textContent === "My first note").value);
await page.select(".doc-select", firstId);
await sleep(800);
check("Switching back restores the first doc", (await els()).length === countBeforeReload);

// 12. Stylus mode toggle
await clickBtn("Stylus mode");
await sleep(100);
check("Stylus mode toggles penMode", await page.evaluate(() => window.narwhal.getAppState().penMode === true));

await page.screenshot({ path: process.env.SHOT || "e2e-screenshot.png" });

const relevantErrors = errors.filter((e) => !/favicon|Failed to load resource.*fonts/i.test(e));
check("No uncaught page errors", relevantErrors.length === 0, relevantErrors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
