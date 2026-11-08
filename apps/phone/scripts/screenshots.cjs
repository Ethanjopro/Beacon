// Visual check: screenshots every mock scenario at 390x844 and 1440x900.
// Run: npx vite --port 9150 --strictPort & node scripts/screenshots.cjs [desk|mob]
// Needs Playwright on the machine (not a lane dependency). Output: .scratch/phone/ (gitignored).
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const OUT = path.resolve(__dirname, "../../../.scratch/phone");
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:9150/?mock=1";
const which = process.argv[2] || "all";

async function page(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  p.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text()));
  await p.goto(BASE);
  await p.waitForSelector('[data-testid="home-screen"]');
  return p;
}

async function fire(p, id) {
  await p.keyboard.press("d");
  await p.waitForSelector(`[data-testid="fire-${id}"]`);
  await p.click(`[data-testid="fire-${id}"]`);
}

async function shot(p, name) {
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot", name);
}

(async () => {
  const browser = await chromium.launch();
  for (const [w, h, tag] of [
    [1440, 900, "desk"],
    [390, 844, "mob"],
  ]) {
    if (which !== "all" && which !== tag) continue;
    let p = await page(browser, w, h);
    await shot(p, `${tag}-01-home`);
    await p.keyboard.press("d");
    await shot(p, `${tag}-02-console`);
    await p.keyboard.press("Escape");

    // Act 1: toll smish
    await fire(p, "toll-smish");
    await p.waitForTimeout(900);
    await shot(p, `${tag}-03-toll-running`);
    await p.waitForSelector('[data-testid="verdict-sheet"]', { timeout: 15000 });
    await shot(p, `${tag}-04-toll-verdict`);
    await p.click('[data-testid="cta-recover"]');
    await shot(p, `${tag}-05-toll-recovery`);

    // Act 2: Mom gift cards
    p = await page(browser, w, h);
    await fire(p, "mom-new-number-giftcards");
    await p.waitForSelector('[data-testid="verification-card"]', { timeout: 15000 });
    await shot(p, `${tag}-06-mom-waiting`);
    await p.waitForSelector('[data-testid="verdict-sheet"]', { timeout: 20000 });
    await shot(p, `${tag}-07-mom-verdict`);
    await p.evaluate(() => {
      const s = document.querySelector('[data-testid="verdict-sheet"] .overflow-y-auto');
      if (s) s.scrollTop = s.scrollHeight;
    });
    await shot(p, `${tag}-08-mom-verdict-bottom`);

    // Act 3: call
    p = await page(browser, w, h);
    await fire(p, "grandson-bail-call");
    await p.waitForSelector('[data-testid="call-screen"]');
    await shot(p, `${tag}-09-call-ring`);
    await p.waitForSelector('[data-testid="call-warning"]', { timeout: 20000 });
    await p.waitForTimeout(6000);
    await shot(p, `${tag}-10-call-warning`);

    // Control: legit Mom
    p = await page(browser, w, h);
    await fire(p, "mom-dinner-legit");
    await p.waitForSelector('[data-testid="beacon-banner"][data-tone="safe"]', { timeout: 15000 });
    await shot(p, `${tag}-11-legit`);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
