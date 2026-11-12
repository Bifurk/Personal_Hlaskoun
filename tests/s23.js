// Test aplikace na emulovaném Samsungu Galaxy S23 (Chrome i Samsung Internet).
// Použití:
//   node tests/s23.js                 # spustí lokální server nad repozitářem a testuje ho
//   node tests/s23.js https://bifurk.github.io/Personal_Hlaskoun/   # testuje nasazenou verzi
// Snímky obrazovky ukládá do tests/screenshots/ (není v gitu).
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "screenshots");
const S23 = { // Galaxy S23 (SM-S911B): 1080×2340 px, 6,1", CSS viewport 360×780 @3×
  viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  locale: "cs-CZ", timezoneId: "Europe/Prague",
};
const BROWSERS = {
  chrome: "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
};
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".ogg": "audio/ogg", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, "127.0.0.1", () => res({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let url = process.argv[2], srv = null;
  if (!url) ({ srv, url } = await serve());
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  let failed = 0;
  const check = (name, ok, detail = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? " – " + detail : ""}`); if (!ok) failed++; };

  for (const [bname, ua] of Object.entries(BROWSERS)) {
    console.log(`\n== Galaxy S23 · ${bname} · ${url}`);
    const ctx = await browser.newContext({ ...S23, userAgent: ua });
    const page = await ctx.newPage();
    const errors = [], bad = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    page.on("response", r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
    const shot = n => page.screenshot({ path: path.join(OUT, `s23-${bname}-${n}.png`) });

    await page.goto(url, { waitUntil: "load" });
    await shot("1-start");
    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    check("bez vodorovného posouvání", noHScroll);
    check("tlačítko Přidat na plochu je vidět", await page.isVisible("#install"));

    const sw = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(r => !!r.active), new Promise(r => setTimeout(() => r(false), 8000))]));
    check("service worker běží", sw);
    const cdp = await ctx.newCDPSession(page);
    const inst = (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors;
    check("Chrome umí aplikaci nainstalovat", inst.length === 0, inst.map(e => e.errorId).join(", "));

    const t = Date.now();
    await page.click("#go");
    await page.waitForSelector("#start", { state: "detached", timeout: 20000 });
    const startMs = Date.now() - t;
    check("start do 3 s", startMs < 3000, `${startMs} ms`);
    await page.keyboard.press("Escape"); // zavřít dialog namlouvání hlásek
    const audio = await page.evaluate(async () => ({ phones: Object.keys(REC).length,
      words: (await Promise.all(["w_ŘÁD", "w_KŮŇ", "w_NOS"].map(k => load(k)))).every(Boolean),
      phrase: !!(await load("x_ok1")) }));
    check("hlásky načtené", audio.phones === 35, `${audio.phones}/35`);
    check("slova s diakritikou načtená", audio.words);
    check("hlášky načtené", audio.phrase);

    const modes = ["Slož slovo", "Najdi hlásku", "Napiš", "Přečti"];
    for (let i = 0; i < modes.length; i++) {
      await page.locator("#modes .mode").nth(i).tap();
      await page.waitForTimeout(400);
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      check(`režim ${modes[i]} se vejde na šířku`, fits);
      await shot(`${i + 2}-${modes[i].replace(/\s/g, "-")}`);
    }
    check("žádné chyby v konzoli", errors.length === 0, errors.join(" | "));
    check("žádné chybějící soubory", bad.length === 0, bad.join(" | "));
    await ctx.close();
  }
  await browser.close();
  if (srv) srv.close();
  console.log(failed ? `\n${failed} kontrol selhalo` : "\nVše v pořádku");
  process.exit(failed ? 1 : 0);
})();
