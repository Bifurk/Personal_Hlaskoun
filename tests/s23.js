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
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required",
    "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] }); // falešný mikrofon (pípání)
  let failed = 0;
  const check = (name, ok, detail = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? " – " + detail : ""}`); if (!ok) failed++; };

  for (const [bname, ua] of Object.entries(BROWSERS)) {
    console.log(`\n== Galaxy S23 · ${bname} · ${url}`);
    const ctx = await browser.newContext({ ...S23, userAgent: ua, permissions: ["microphone"] });
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

    // --- Namlouvání hlásek a odolnost zvuku (chyba z 12. 11.: po namluvení hlásek nic nefungovalo) ---
    await page.locator("#modes .mode").nth(0).tap();
    await page.tap("#openRec");
    await page.waitForSelector("#dlgRec[open]");
    const nRec = await page.locator(".rk").count();
    for (let i = 0; i < 6; i++) { await page.locator(".rk").nth(i).tap(); await page.waitForTimeout(2300); }
    const recMsg = await page.textContent("#recMsg");
    check("nahrání hlásky mikrofonem", /Uloženo/.test(recMsg), recMsg);
    await shot("6-namlouvani");
    await page.tap("#dlgRec [data-close]");
    await page.waitForTimeout(600);
    check("po zavření namlouvání zvuk běží", await page.evaluate(() => ctx.state === "running"));

    // Android po použití mikrofonu / návratu z pozadí uspí AudioContext – tady to nasimulujeme
    const suspend = () => page.evaluate(() => ctx.suspend());
    const notHung = (name, fn, ms = 8000) => page.evaluate(([f, ms]) => Promise.race([
        (0, eval)(f)().then(() => "ok"), new Promise(r => setTimeout(() => r("ZASEKNUTO"), ms))]), [fn.toString(), ms])
      .then(r => check(name, r === "ok", r));
    await suspend();
    await notHung("hláskování po uspání zvuku doběhne", () => spellOut(word));
    check("zvuk se po uspání sám probudí", await page.evaluate(() => ctx.state === "running"));
    await suspend();
    await notHung("vyslovení slova po uspání zvuku doběhne", () => sayWord(word));
    await page.evaluate(() => ctx.close());
    await notHung("přehrání po zavření zvukového kontextu doběhne", () => play("x_ok1"));

    // Všechna tlačítka ve všech režimech po uspání zvuku: musí reagovat a nic nesmí zamrznout
    for (let i = 0; i < modes.length; i++) {
      await page.locator("#modes .mode").nth(i).tap();
      await page.waitForTimeout(300);
      await suspend();
      const labels = await page.$$eval("#actions button", bs => bs.map(b => b.textContent.trim()));
      for (const label of labels) {
        if (/Další/.test(label)) continue;
        await page.locator("#actions button", { hasText: label }).tap();
        await page.waitForTimeout(200);
      }
      if (modes[i] === "Slož slovo") {
        await page.locator("#actions button", { hasText: "Hláskuj" }).tap();
        await page.waitForFunction(() => document.querySelectorAll(".tile.seen").length > 0, null, { timeout: 5000 })
          .then(() => check("Slož slovo: po uspání zvuku se hláskuje", true))
          .catch(() => check("Slož slovo: po uspání zvuku se hláskuje", false, "dlaždice se nerozsvítily"));
      }
      if (modes[i] === "Najdi hlásku") { await page.locator(".opt").first().tap(); await page.waitForTimeout(300); }
      if (modes[i] === "Napiš") { await page.locator(".key").first().tap(); await page.waitForTimeout(300); }
      const w0 = await page.evaluate(() => word);
      await page.locator("#actions button", { hasText: "Další" }).tap();
      await page.waitForTimeout(300);
      check(`režim ${modes[i]}: tlačítka reagují i po uspání zvuku`, await page.evaluate(w => word !== w || LEVELS[state.level].length === 1, w0));
    }

    // Znovuotevření aplikace (jako z ikony na ploše) s namluvenými hláskami
    await page.reload({ waitUntil: "load" });
    const t2 = Date.now();
    await page.tap("#go");
    const restarted = await page.waitForSelector("#start", { state: "detached", timeout: 15000 }).then(() => true, () => false);
    check("znovuotevření s namluvenými hláskami", restarted, `${Date.now() - t2} ms`);
    const own = await page.evaluate(() => new Promise(r => { const q = indexedDB.open("hlaskoun"); q.onsuccess = () => {
      const c = q.result.transaction("rec").objectStore("rec").count(); c.onsuccess = () => r(c.result); }; }));
    check("namluvené hlásky zůstaly uložené", own >= 6, `${own}`);
    await page.keyboard.press("Escape");
    await suspend();
    await notHung("hláskování po znovuotevření a uspání", () => spellOut(word));

    // Diagnostika
    await page.tap("#openSet"); await page.tap("#openDiag");
    const diagTxt = await page.inputValue("#diagText");
    check("diagnostika se otevře a ukáže stav", /Zvuk: running/.test(diagTxt) && /audio:/.test(diagTxt));
    await shot("7-diagnostika");
    await page.tap("#dlgDiag [data-close]");

    check("žádné chyby v konzoli", errors.length === 0, errors.join(" | "));
    check("žádné chybějící soubory", bad.length === 0, bad.join(" | "));
    await ctx.close();
  }
  await browser.close();
  if (srv) srv.close();
  console.log(failed ? `\n${failed} kontrol selhalo` : "\nVše v pořádku");
  process.exit(failed ? 1 : 0);
})();
