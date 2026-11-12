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

    // Tlačítka v dialogu musí být celá vidět bez posouvání (chyba z 13. 11.: „Hotovo“ bylo useknuté pod okrajem)
    const dialogButtonsVisible = (sel) => page.evaluate(sel => {
      const d = document.querySelector(sel), r = d.getBoundingClientRect();
      const btns = [...d.querySelectorAll(".dlg > .row:last-child button")].filter(b => !b.hidden && b.offsetParent);
      const bad = btns.filter(b => { const q = b.getBoundingClientRect();
        return q.height === 0 || q.top < Math.max(0, r.top) - 1 || q.bottom > Math.min(innerHeight, r.bottom) + 1; });
      return { ok: btns.length > 0 && bad.length === 0, bad: bad.map(b => b.textContent.trim()).join(", "), dialogScroll: d.scrollHeight - d.clientHeight };
    }, sel).then(r => r);
    const checkDialog = async (name, sel) => { const r = await dialogButtonsVisible(sel);
      check(`${name}: tlačítka celá vidět`, r.ok, r.bad); check(`${name}: dialog se neposouvá jako celek`, r.dialogScroll <= 1, `${r.dialogScroll}px`); };

    // --- Namlouvání hlásek a odolnost zvuku (chyba z 12. 11.: po namluvení hlásek nic nefungovalo) ---
    await page.locator("#modes .mode").nth(0).tap();
    await page.tap("#openRec");
    await page.waitForSelector("#dlgRec[open]");
    const nRec = await page.locator(".rk").count();
    for (let i = 0; i < 6; i++) { await page.locator(".rk").nth(i).tap(); await page.waitForTimeout(2300); }
    const recMsg = await page.textContent("#recMsg");
    check("nahrání hlásky mikrofonem", /Uloženo/.test(recMsg), recMsg);
    await checkDialog("namlouvání hlásek", "#dlgRec");
    await page.locator(".recgrid").evaluate(g => g.scrollTop = g.scrollHeight);  // posunout na poslední hlásky
    await checkDialog("namlouvání hlásek po posunutí na konec", "#dlgRec");
    await shot("6-namlouvani");
    const hotovo = page.locator("#dlgRec .row .main");
    check("Hotovo jde stisknout bez posouvání", await hotovo.isVisible() && await hotovo.evaluate(b => {
      const q = b.getBoundingClientRect(); const el = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return b.contains(el); }));
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

    // --- Namluvení celého slova vlastním hlasem ---
    await page.locator("#modes .mode").nth(3).tap();   // Přečti – slovo je vidět
    await page.waitForTimeout(300);
    const recWord = await page.evaluate(() => word);
    check("tlačítko Namluvit slovo je vidět", await page.isVisible("#openWordRec"));
    await page.tap("#openWordRec");
    await page.waitForSelector("#dlgWordRec[open]");
    check("okno ukazuje správné slovo", (await page.textContent("#wrecWord")).toUpperCase() === recWord);
    await checkDialog("namlouvání slova", "#dlgWordRec");
    await page.tap("#wrecRec");
    await page.waitForFunction(() => /Uloženo/.test(document.querySelector("#wrecMsg").textContent), null, { timeout: 8000 })
      .then(() => check("nahrání slova mikrofonem", true))
      .catch(async () => check("nahrání slova mikrofonem", false, await page.textContent("#wrecMsg")));
    await shot("9-namluvit-slovo");
    check("po nahrání je nabídka Vrátit původní", await page.isVisible("#wrecOrig"));
    await page.tap("#dlgWordRec [data-close]");
    await page.waitForTimeout(400);
    check("po nahrání slova zvuk běží", await page.evaluate(() => ctx.state === "running"));
    check("u slova je značka vlastní nahrávky", await page.waitForFunction(() => /namluvené vámi/.test(document.querySelector("#openWordRec").textContent), null, { timeout: 3000 }).then(() => true, () => false));
    const usesOwn = await page.evaluate(async W => { let used = null; const orig = playBuf;
      playBuf = b => { used = b; return orig(b); }; await play("w_" + W); playBuf = orig; return used !== null && used === WREC[W]; }, recWord);
    check("slovo se přehrává z vaší nahrávky", usesOwn);
    await page.tap("#openList"); await page.waitForSelector("#dlgList[open]");
    check("v seznamu slov je vlastní nahrávka označená", await page.locator(".gw.own").count() >= 1);
    await page.tap("#dlgList .row .main");
    await suspend();
    await notHung("vlastní slovo se přehraje i po uspání zvuku", () => sayWord(word));

    // --- Volba hlasu v Nastavení: odkud se slovo/hláska opravdu přehraje ---
    const source = (W) => page.evaluate(async W => {
      let src = "nic"; const pb = playBuf, tts = ttsSay;
      playBuf = b => { src = b === WREC[W] ? "moje" : (b === buf["w_" + W] ? (OWNV.has("w_" + W) ? "aplikace" : "robot") : "jiné"); return pb(b); };
      ttsSay = t => { src = "telefon"; return Promise.resolve(); };
      await play("w_" + W); playBuf = pb; ttsSay = tts; return src;
    }, W);
    // emulace nemá český hlas telefonu – podstrčíme ho (pickVoice by ho jinak při otevření nastavení vynuloval)
    await page.evaluate(() => { pickVoice = () => { csVoice = { name: "Google čeština (test)", lang: "cs-CZ" }; }; pickVoice(); });
    const appWord = await page.evaluate(W => [...OWNV].map(k => k.slice(2)).find(w => w !== W), recWord);
    await page.tap("#openSet"); await page.waitForSelector("#dlgSet[open]");
    check("v nastavení je volba hlasu slov i hlásek", await page.isVisible("#wordVoice") && await page.isVisible("#phoneVoice"));
    const expect = { own: ["moje", "aplikace"], recorded: ["aplikace", "aplikace"], device: ["telefon", "telefon"], robot: ["robot", "aplikace"] };
    for (const [v, [mine, app]] of Object.entries(expect)) {
      await page.selectOption("#wordVoice", v); await page.waitForTimeout(150);
      const a = await source(recWord), b = await source(appWord);
      // u „recorded“ se moje nahrávka nepoužije: recWord (bez nahrávky aplikace) jde na hlas telefonu
      const okMine = v === "recorded" ? (a === "telefon" || a === "aplikace") : a === mine;
      check(`hlas slov „${v}“: moje namluvené slovo → ${a}`, v === "robot" ? ["robot", "aplikace"].includes(a) : okMine);
      check(`hlas slov „${v}“: slovo s nahrávkou aplikace → ${b}`, v === "robot" ? b === "robot" || b === "aplikace" : b === app);
    }
    await page.selectOption("#wordVoice", "device");
    check("popis hlasu ukazuje hlas telefonu", /Google čeština/.test(await page.textContent("#voiceNote")));
    const ph = await page.evaluate(() => Object.keys(OWNP)[0]);
    await page.selectOption("#phoneVoice", "default"); await page.waitForTimeout(150);
    check("hlásky „výchozí“: použije se nahrávka aplikace", await page.evaluate(k => REC[k] === DEFP[k] && REC[k] !== OWNP[k], ph));
    await page.selectOption("#phoneVoice", "own"); await page.waitForTimeout(150);
    check("hlásky „moje“: použije se moje nahrávka", await page.evaluate(k => REC[k] === OWNP[k], ph));
    await page.selectOption("#phoneVoice", "default");
    await checkDialog("nastavení s volbou hlasu", "#dlgSet");
    await shot("10-nastaveni-hlas");
    await page.tap("#dlgSet .row:last-child .main");
    await page.evaluate(() => { csVoice = null; });   // zrušit podstrčený hlas

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
    check("vlastní slovo zůstalo uložené", await page.evaluate(W => ownWords.has(W), recWord));
    check("volba hlasu se pamatuje", await page.evaluate(() => settings.wordVoice === "device" && settings.phoneVoice === "default"));
    check("moje hlásky zůstaly uložené i při výchozích hláskách", await page.evaluate(() => Object.keys(OWNP).length >= 6));
    await page.evaluate(() => { settings.wordVoice = "own"; settings.phoneVoice = "own"; saveAll(); applyPhoneVoice(); });
    await suspend();
    await notHung("hláskování po znovuotevření a uspání", () => spellOut(word));

    // Vrácení původního znění slova
    await page.evaluate(W => { word = W; render(); }, recWord);
    await page.tap("#openWordRec"); await page.waitForSelector("#dlgWordRec[open]");
    await page.tap("#wrecOrig"); await page.waitForTimeout(300);
    check("Vrátit původní smaže vlastní nahrávku", await page.evaluate(W => !ownWords.has(W), recWord));
    await page.tap("#dlgWordRec [data-close]");

    // --- Audit všech oken (menu) na různých výškách obrazovky S23 ---
    // 780 = celá obrazovka (aplikace na ploše), 660 = Chrome s lištou adresy a navigací,
    // 600 = Chrome + zobrazená lišta záložek/oznámení, 320×640 = Samsung „Zvětšení obrazovky“ / větší písmo
    const DIALOGS = {
      "#dlgSet": "nastavení", "#dlgRec": "namlouvání hlásek", "#dlgList": "seznam slov",
      "#dlgWordRec": "namlouvání slova", "#dlgDiag": "diagnostika" };
    const allDialogs = await page.$$eval("dialog", ds => ds.map(d => "#" + d.id));
    check("audit zná všechna okna aplikace", allDialogs.every(id => DIALOGS[id]), allDialogs.filter(id => !DIALOGS[id]).join(", "));
    for (const [w, hgt] of [[360, 780], [360, 660], [360, 600], [320, 640]]) {
      await page.setViewportSize({ width: w, height: hgt });
      for (const [sel, name] of Object.entries(DIALOGS)) {
        await page.evaluate(sel => { // otevřít okno tak, jak to dělá aplikace
          ({ "#dlgSet": () => $("openSet").click(), "#dlgRec": () => openRec(), "#dlgList": () => $("openList").click(),
             "#dlgWordRec": () => openWordRec(), "#dlgDiag": () => { renderDiag(); $("dlgDiag").showModal(); } })[sel]();
        }, sel);
        await page.waitForTimeout(150);
        const r = await page.evaluate(sel => {
          const d = document.querySelector(sel), dr = d.getBoundingClientRect();
          const inView = el => { const q = el.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2;
            return q.height > 0 && q.top >= Math.max(0, dr.top) - 1 && q.bottom <= Math.min(innerHeight, dr.bottom) + 1 && el.contains(document.elementFromPoint(x, y)); };
          const close = [...d.querySelectorAll(".dlg > .row:last-child button")].filter(b => !b.hidden);
          const closeOk = close.length > 0 && close.every(inView);
          // všechno ostatní ovladatelné musí jít na posunutí dosáhnout
          const unreachable = [];
          for (const el of d.querySelectorAll("button, input, select, textarea")) {
            if (el.hidden || !el.offsetParent) continue;
            el.scrollIntoView({ block: "nearest" });
            if (!inView(el)) unreachable.push((el.textContent || el.id || el.tagName).trim().slice(0, 20));
          }
          d.querySelector(".dlg").scrollTop = 0;
          const fits = dr.top >= 0 && dr.bottom <= innerHeight && dr.right <= innerWidth && d.scrollWidth <= d.clientWidth + 1;
          return { closeOk, close: close.map(b => b.textContent.trim()).join("/"), unreachable, fits };
        }, sel);
        check(`${w}×${hgt} ${name}: ${r.close} vidět bez posouvání`, r.closeOk);
        check(`${w}×${hgt} ${name}: vše ovladatelné je dosažitelné`, r.unreachable.length === 0, r.unreachable.join(", "));
        check(`${w}×${hgt} ${name}: okno se vejde na obrazovku`, r.fits);
        if (hgt === 600 || w === 320) await shot(`menu-${w}x${hgt}-${sel.slice(4)}`);
        await page.evaluate(sel => document.querySelector(sel).close(), sel);
      }
      // hlavní obrazovka ve všech režimech: tlačítka dole i nahoře celá vidět, nic nepřetéká do strany
      for (let i = 0; i < modes.length; i++) {
        await page.evaluate(i => { state.mode = MODES[i].id; renderModes(); render(); }, i);
        await page.waitForTimeout(100);
        const m = await page.evaluate(() => {
          const cut = [...document.querySelectorAll("#actions button, header button, #modes button, #panel button")].filter(b => {
            const q = b.getBoundingClientRect(); return q.width > 0 && (q.left < -1 || q.right > innerWidth + 1 || b.scrollWidth > b.clientWidth + 2); });
          return { cut: cut.map(b => b.textContent.trim().slice(0, 15)), hs: document.documentElement.scrollWidth <= innerWidth };
        });
        check(`${w}×${hgt} režim ${modes[i]}: tlačítka celá vidět`, m.cut.length === 0 && m.hs, m.cut.join(", "));
        if (w === 320) await shot(`main-${w}x${hgt}-${i}`);
      }
    }
    await page.setViewportSize(S23.viewport);
    await page.waitForTimeout(400);

    // Diagnostika
    await page.tap("#openList"); await page.waitForSelector("#dlgList[open]");
    await checkDialog("seznam slov", "#dlgList");
    await shot("8-seznam-slov");
    await page.tap("#dlgList .row .main");
    await page.tap("#openSet"); await page.waitForSelector("#dlgSet[open]");
    await checkDialog("nastavení", "#dlgSet");
    await page.tap("#openDiag");
    await checkDialog("diagnostika", "#dlgDiag");
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
