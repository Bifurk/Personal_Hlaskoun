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
// 780 = celá obrazovka (aplikace na ploše), 660 = Chrome s lištami, 600 = ještě nižší, 320×640 = Samsung „Zvětšení obrazovky“
const SIZES = [[360, 780], [360, 660], [360, 600], [320, 640], [412, 915]];   // 412×915 = Galaxy S21 FE
const GAME_IDS = ["listen", "first", "build", "read"];
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
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const notHung = (name, fn, ms = 8000) => page.evaluate(([f, ms]) => Promise.race([
        (0, eval)(f)().then(() => "ok"), new Promise(r => setTimeout(() => r("ZASEKNUTO"), ms))]), [fn.toString(), ms])
      .then(r => check(name, r === "ok", r));
    const suspend = () => ev(() => hl.audio._suspend());

    /* ---------- úvod ---------- */
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.hl, null, { timeout: 10000 });
    await shot("1-domu");
    check("domů: 4 hry jako velká tlačítka", await page.locator("#games .game").count() === 4);
    // viewport-fit=cover nechá Chrome na Androidu kreslit pod stavový řádek a navigační lištu (useknuté lišty, zjištěno na S21 FE)
    check("stránka se nekreslí pod lišty telefonu (bez viewport-fit=cover)", await ev(() => !/viewport-fit\s*=\s*cover/.test(document.querySelector('meta[name="viewport"]').content)));
    check("domů: bez vodorovného posouvání", await ev(() => document.documentElement.scrollWidth <= innerWidth));
    const sw = await ev(() => Promise.race([navigator.serviceWorker.ready.then(r => !!r.active), new Promise(r => setTimeout(() => r(false), 8000))]));
    check("service worker běží", sw);
    const cdp = await ctx.newCDPSession(page);
    const inst = (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors;
    check("Chrome umí aplikaci nainstalovat", inst.length === 0, inst.map(e => e.errorId).join(", "));
    check("domů: žádný dlouhý text pro dítě", await ev(() => document.querySelector("#home").innerText.replace(/\s+/g, " ").length < 120),
      await ev(() => document.querySelector("#home").innerText.replace(/\s+/g, " ").length + " znaků"));

    /* ---------- slova s obrázky ---------- */
    const pics = await ev(() => {
      const all = new Set(Object.values(LEVELS).flat()), words = Object.keys(PICS);
      const zwj = words.filter(w => /\u200d/.test(PICS[w]));
      const notInLevels = words.filter(w => !all.has(w));
      const sizes = hl.GAMES.listen.tiers.map(t => hl.tierPool("listen", hl.GAMES.listen.tiers.indexOf(t)).length);
      // emoji musí mít v písmu telefonu barevný obrázek (ne prázdný čtvereček) – změří se šířka vykreslení
      const c = document.createElement("canvas").getContext("2d"); c.font = "32px sans-serif";
      const tofu = c.measureText("\u{10FFFF}").width;
      const blank = words.filter(w => !PICS[w].startsWith("img:") && Math.abs(c.measureText(PICS[w]).width - tofu) < 0.5);
      return { n: words.length, zwj, notInLevels, sizes, blank };
    });
    check("obrázků je aspoň 240", pics.n >= 240, `${pics.n}`);
    check("každé slovo s obrázkem je v seznamu slov", pics.notInLevels.length === 0, pics.notInLevels.join(", "));
    check("obrázky bez složených emoji (ZWJ)", pics.zwj.length === 0, pics.zwj.join(", "));
    check("Poslouchej/Čti: každá úroveň má aspoň 20 slov, první aspoň 30", pics.sizes.every(n => n >= 20) && pics.sizes[0] >= 30, pics.sizes.join(" / "));
    check("všechny obrázky jdou vykreslit", pics.blank.length === 0, pics.blank.join(", "));
    const imgs = await ev(async () => {
      const list = Object.keys(PICS).filter(w => PICS[w].startsWith("img:"));
      const res = await Promise.all(list.map(w => new Promise(r => { const el = hl.picEl(w); el.onload = () => r([w, el.naturalWidth]); el.onerror = () => r([w, 0]); })));
      const ungrouped = list.filter(w => !PIC_GROUPS.flat().includes(w));
      return { n: list.length, bad: res.filter(([, nw]) => nw !== 512).map(([w]) => w), ungrouped };
    });
    check("vlastní obrázky: všechny se načtou (512 px)", imgs.n >= 36 && imgs.bad.length === 0, `${imgs.n} obrázků` + (imgs.bad.length ? ", chyba: " + imgs.bad.join(", ") : ""));
    const uniq = await ev(() => {
      const bad = [], missingGroup = Object.values(PIC_GROUPS).flat().filter(w => !PICS[w]);
      for (const W of Object.keys(PICS)) for (let k = 0; k < 40; k++) {
        const o = hl.pictureOptions(W);
        if (o.length !== 3 || !o.includes(W)) { bad.push(W + ": " + o.join(",")); break; }
        if (new Set(o.map(w => PICS[w])).size !== 3 || o.some((a, i) => o.some((b, j) => i < j && picsClash(a, b)))) { bad.push(o.join("/")); break; }
      }
      return { bad: bad.slice(0, 5), missingGroup };
    });
    check("nabídka obrázků: vždy 3 různé a navzájem nezaměnitelné, včetně správného", uniq.bad.length === 0, uniq.bad.join(" | "));
    check("skupiny podobných obrázků obsahují jen slova s obrázkem", uniq.missingGroup.length === 0, uniq.missingGroup.join(", "));
    const sayGate = await ev(() => {
      const silent = Object.values(LEVELS).flat().filter(w => !AUDIO_KEYS.has("w_" + w));
      const inFirst = hl.tierPool("first", 0).filter(w => silent.includes(w)), inBuild = hl.tierPool("build", 0).filter(w => silent.includes(w));
      hl.audio._setVoice({ name: "test", lang: "cs-CZ" });
      const withTts = hl.tierPool("build", 0).filter(w => silent.includes(w)).length;
      hl.audio._setVoice(null);
      return { silent: silent.length, inFirst: inFirst.length, inBuild: inBuild.length, withTts };
    });
    check("slova bez nahrávky se bez hlasu telefonu nenabízí ve hrách, kde musí zaznít", sayGate.inFirst === 0 && sayGate.inBuild === 0, JSON.stringify(sayGate));
    check("s hlasem telefonu se nová slova nabízí i tam", sayGate.withTts > 0, JSON.stringify(sayGate));

    /* ---------- koutek pro rodiče: zámek ---------- */
    await page.tap("#parentBtn");
    await page.waitForTimeout(300);
    check("rodiče: krátké ťuknutí koutek neotevře", !(await ev(() => document.querySelector("#dlgParent").open)));
    const pb = await page.locator("#parentBtn").boundingBox();
    await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await page.mouse.down(); await page.waitForTimeout(1700); await page.mouse.up();
    check("rodiče: podržení 1,5 s koutek otevře", await ev(() => document.querySelector("#dlgParent").open));
    await shot("2-rodice");
    await page.tap("#dlgParent .row:last-child .main");

    /* ---------- hry: celé kolo ---------- */
    const t0 = Date.now();
    await page.tap('#games .game[data-game="listen"]');
    await page.waitForFunction(() => hl.current === "game" && hl.R.word, null, { timeout: 20000 });
    check("start hry do 4 s", Date.now() - t0 < 4000, `${Date.now() - t0} ms`);
    const audioState = await ev(async () => ({ phones: Object.keys(hl.audio.REC).length,
      words: (await Promise.all(["w_ŘÁD", "w_KŮŇ", "w_NOS"].map(k => hl.audio.load(k)))).every(Boolean), phrase: !!(await hl.audio.load("x_ok1")) }));
    check("hlásky načtené", audioState.phones === 35, `${audioState.phones}/35`);
    check("slova s diakritikou načtená", audioState.words);
    check("pochvaly načtené", audioState.phrase);

    // správná odpověď pro aktuální slovo (a jedna špatná na prvním slově každé hry)
    const answer = async (g, wrongFirst) => {
      const W = await ev(() => hl.R.word);
      const L = await ev(W => { const r = []; for (let i = 0; i < W.length; i++) { if (W[i] === "C" && W[i + 1] === "H") { r.push("CH"); i++; } else r.push(W[i]); } return r; }, W);
      if (g === "listen" || g === "read") {
        if (wrongFirst) { await page.locator(`.pic:not([data-word="${W}"])`).first().tap(); await page.waitForTimeout(300); }
        await page.locator(`.answers .pic[data-word="${W}"]`).tap();
      } else if (g === "first") {
        if (wrongFirst) { await page.locator(".letter-btn").filter({ hasNotText: new RegExp(`^${L[0]}$`, "i") }).first().tap(); await page.waitForTimeout(300); }
        await page.locator(".letter-btn").filter({ hasText: new RegExp(`^${L[0]}$`, "i") }).first().tap();
      } else {
        if (wrongFirst) { await page.locator(".key:not([disabled])").filter({ hasNotText: new RegExp(`^${L[0]}$`, "i") }).first().tap(); await page.waitForTimeout(200); }
        for (const l of L) { await page.locator(".key:not([disabled])").filter({ hasText: new RegExp(`^${l}$`, "i") }).first().tap(); await page.waitForTimeout(120); }
      }
      return W;
    };
    for (const g of GAME_IDS) {
      if (g !== "listen") { await ev(g => hl.startGame(g), g); await page.waitForFunction(() => hl.current === "game" && hl.R.word); }
      const starsBefore = await ev(() => hl.core.progress.stars);
      await page.waitForTimeout(600);
      await shot(`3-hra-${g}`);
      const words = await ev(() => [...hl.R.words]);
      check(`${g}: kolo má 5 slov`, words.length === 5, words.join(" "));
      check(`${g}: zadání nemá text k přečtení (kromě hry Čti)`, g === "read" || await ev(() => (() => { const c = document.querySelector("#prompt").cloneNode(true); c.querySelectorAll(".ltr").forEach(e => e.remove());   // dlaždice písmen jsou součást hry
        return !/[a-zá-ž]{3,}/i.test(c.textContent.replace(/\s/g, "")); })()));
      let okAll = true;
      for (let k = 0; k < 5; k++) {
        const W = await answer(g, k === 0);
        const moved = await page.waitForFunction(k => hl.R.i > k || hl.current === "done", k, { timeout: 12000 }).then(() => true, () => false);
        if (!moved) { okAll = false; check(`${g}: slovo ${W} se po správné odpovědi posunulo`, false); break; }
      }
      check(`${g}: celé kolo dohráno správnými odpověďmi`, okAll);
      await page.waitForFunction(() => hl.current === "done", null, { timeout: 8000 }).catch(() => {});
      check(`${g}: oslava na konci kola`, await ev(() => hl.current === "done"));
      const res = await ev(() => hl.R.results);
      check(`${g}: chyba na 1. slově = stříbrná hvězda, ostatní zlaté`, res.length === 5 && res[0] === false && res.slice(1).every(Boolean), JSON.stringify(res));
      check(`${g}: hvězdy připsané`, await ev(() => hl.core.progress.stars) === starsBefore + 4);
      const st = await ev(([g, ws]) => ws.map(w => hl.core.progress.words[g]?.[w]), [g, words]);
      check(`${g}: výsledky slov uložené (1. slovo chyba, ostatní správně)`, st.every(Boolean) && st[0].bad === 1 && st[0].last === 0 && st.slice(1).every(x => x.ok >= 1 && x.last === 1),
        JSON.stringify(st.map(x => x && [x.ok, x.bad, x.last])));
      if (g === "listen") await page.waitForTimeout(700), await shot("4-oslava");
    }
    check("obtížnost se po 4/5 nezměnila", await ev(ids => ids.every(g => hl.tierOf(g) === 0), GAME_IDS));
    // záznam chyb: s čím si dítě slovo spletlo, čas, souhrn v diagnostice
    const learn = await ev(ids => {
      const r = {};
      for (const g of ids) { const ws = Object.entries(hl.core.progress.words[g] || {}).filter(([, x]) => x.wrong); r[g] = ws.length; }
      const diag = hl.core.DIAG.join("\n"), sum = hl.learningSummary().join("\n");
      return { r, cross: /✗ listen \S+ → \S+/.test(diag) && /✓ read \S+ · \d+,\d s/.test(diag), sum, conf: Object.keys(hl.core.progress.conf || {}).length };
    }, GAME_IDS);
    check("u chybných slov je uloženo, s čím si je dítě spletlo (všechny 4 hry)", GAME_IDS.every(g => learn.r[g] >= 1), JSON.stringify(learn.r));
    check("diagnostika zapisuje každou odpověď (✓/✗, volba, čas)", learn.cross);
    check("souhrn učení: nejtěžší slova a záměny písmen", /nejtěžší: /.test(learn.sum) && /Záměny písmen/.test(learn.sum) && learn.conf >= 1, learn.sum.replace(/\n/g, " | ").slice(0, 200));
    // neznámá slova nejsou ve hrách bez obrázku
    check("neznámá slova (CIT, HON, LEM…) se ve hrách První hláska a Skládej nenabízí", await ev(() =>
      ["first", "build"].every(g => hl.GAMES[g].tiers.every(t => !hl.GAMES[g].pool(t).some(w => hl.UNKNOWN_WORDS.has(w))))));
    // férovější návrat o úroveň níž
    const tierLog = await ev(() => {
      const g = "build", cov = { ready: true }, notReady = { ready: false }, out = [];
      const save = JSON.stringify([hl.core.progress.tier, hl.core.progress.grace, hl.core.progress.weak]);
      hl.core.progress.tier[g] = 0; hl.core.progress.grace = {}; hl.core.progress.weak = {};
      hl.applyTier(g, 5, cov); out.push(hl.tierOf(g));            // postup → 1
      hl.applyTier(g, 1, notReady); out.push(hl.tierOf(g));       // slabé kolo hned po postupu → zůstává 1
      hl.applyTier(g, 2, notReady); out.push(hl.tierOf(g));       // druhé slabé, ale ještě ochrana → 1
      hl.applyTier(g, 4, notReady); out.push(hl.tierOf(g));       // dobré kolo (ochrana končí) → 1
      hl.applyTier(g, 2, notReady); out.push(hl.tierOf(g));       // 1. slabé za sebou → 1
      hl.applyTier(g, 1, notReady); out.push(hl.tierOf(g));       // 2. slabé za sebou → 0
      const [t, gr, wk] = JSON.parse(save); hl.core.progress.tier = t; hl.core.progress.grace = gr; hl.core.progress.weak = wk;
      return out.join(",");
    });
    check("úroveň: po postupu ochrana, dolů až po 2 slabých kolech za sebou", tierLog === "1,1,1,1,1,0", tierLog);
    // opuštěné kolo se zapíše
    await ev(() => hl.startGame("listen")); await page.waitForFunction(() => hl.current === "game" && hl.R.word);
    await page.tap("#homeBtn"); await page.waitForTimeout(300);
    check("opuštěné kolo je v diagnostice", await ev(() => /kolo listen opuštěno po 0\/5/.test(hl.core.DIAG.slice(-3).join(" "))));
    // Poslouchej: po správné odpovědi zazní celé slovo
    const said = await ev(async () => {
      await hl.startGame("listen", ["PES", "KOS", "NOS", "LES", "SÝR"]); await new Promise(r => setTimeout(r, 300));
      let heard = null; hl.audio.hooks.playBuf = b => { if (b === hl.audio.buf["w_PES"]) heard = "PES"; };
      document.querySelector('.answers .pic[data-word="PES"]').click();
      await new Promise(r => setTimeout(r, 1500)); hl.audio.hooks.playBuf = null; return heard;
    });
    check("Poslouchej: po správné odpovědi robot řekne celé slovo", said === "PES", String(said));
    await page.tap("#homeBtn"); await page.waitForTimeout(300);
    // postup: kolo 5/5 A pravidlo hry (Poslouchej/Čti: všechna slova úrovně správně; První hláska/Skládej: ≥ 80 % slov hraných)
    const playRound = async (g, wrongFirst, words = null) => {
      await ev(([g, ws]) => hl.startGame(g, ws), [g, words]); await page.waitForFunction(() => hl.current === "game" && hl.R.word);
      for (let k = 0; k < 5; k++) { await answer(g, wrongFirst && k === 0); await page.waitForFunction(k => hl.R.i > k || hl.current === "done", k, { timeout: 12000 }).catch(() => {}); }
      await page.waitForFunction(() => hl.current === "done", null, { timeout: 8000 }).catch(() => {});
    };
    const setWords = (g, fn) => ev(([g, f]) => { const pool = hl.tierPool(g, 0), all = hl.core.progress.words[g] = {};
      (0, eval)(f)(pool, all); hl.core.saveProgress(); return pool; }, [g, fn.toString()]);
    check("pravidlo: Poslouchej a Čti chtějí všechna slova správně, ostatní 80 %", await ev(() => hl.needsAllCorrect("read") && hl.needsAllCorrect("listen") && !hl.needsAllCorrect("first") && !hl.needsAllCorrect("build")));
    // Čti: všechna slova kromě jednoho naposledy správně, to jedno naposledy špatně
    const readPool = await setWords("read", (pool, all) => { for (const w of pool) all[w] = { n: 1, ok: 1, bad: 0, last: 1 }; all[pool[0]] = { n: 1, ok: 0, bad: 1, last: 0 }; });
    await playRound("read", false, readPool.slice(1, 6));
    check("Čti: 5/5, ale jedno slovo úrovně naposledy špatně → úroveň zůstává", await ev(() => hl.tierOf("read")) === 0, JSON.stringify(await ev(() => hl.coverage("read"))));
    await playRound("read", true, [readPool[0], ...readPool.slice(1, 5)]);
    check("Čti: kolo s chybou (4/5) → úroveň zůstává", await ev(() => hl.tierOf("read")) === 0);
    await playRound("read", false, [readPool[0], ...readPool.slice(5, 9)]);
    check("Čti: všechna slova správně a kolo 5/5 → postup na těžší úroveň", await ev(() => hl.tierOf("read")) === 1, JSON.stringify(await ev(() => hl.coverage("read", 0))));
    // Čti: nehrané slovo také brání postupu
    await ev(() => { hl.core.progress.tier.read = 0; });
    const readPool2 = await setWords("read", (pool, all) => { for (const w of pool.slice(1)) all[w] = { n: 1, ok: 1, bad: 0, last: 1 }; });
    await playRound("read", false, readPool2.slice(1, 6));
    check("Čti: jedno slovo úrovně ještě nehrané → úroveň zůstává", await ev(() => hl.tierOf("read")) === 0);
    // První hláska: stačí ≥ 80 % slov hraných (i s dřívějšími chybami)
    await setWords("first", (pool, all) => { pool.slice(0, Math.ceil(pool.length * 0.8)).forEach((w, i) => { all[w] = i % 3 ? { n: 1, ok: 1, bad: 0, last: 1 } : { n: 1, ok: 0, bad: 1, last: 0 }; }); });
    await playRound("first", false);
    check("První hláska: ≥ 80 % slov hraných a 5/5 → postup", await ev(() => hl.tierOf("first")) === 1);
    await ev(() => { hl.core.progress.tier.first = 0; hl.core.progress.tier.read = 1; hl.core.saveProgress(); });
    // výběr slov: naposledy chybná slova častěji
    const freq = await ev(() => { const g = "listen", pool = hl.tierPool(g, 0), bad = pool[0];
      const all = hl.core.progress.words[g] = hl.core.progress.words[g] || {};
      for (const w of pool) all[w] = { n: 2, ok: 2, bad: 0, last: 1 };
      all[bad] = { n: 2, ok: 0, bad: 2, last: 0 };
      let hitBad = 0, hitOther = 0; const other = pool[1];
      for (let k = 0; k < 200; k++) { const ws = hl.chooseWords(g); if (ws.includes(bad)) hitBad++; if (ws.includes(other)) hitOther++; }
      return { hitBad, hitOther, size: pool.length }; });
    check("chybné slovo se nabízí výrazně častěji než zvládnuté", freq.hitBad > 100 && freq.hitBad > freq.hitOther * 5, JSON.stringify(freq));
    check("tlačítko Hrát znovu spustí stejnou hru", await page.tap("#playAgain").then(() => page.waitForFunction(() => hl.current === "game" && hl.R.game === "first", null, { timeout: 8000 })).then(() => true, () => false));
    await page.tap("#homeBtn"); await page.waitForTimeout(500);
    check("🏠 vrátí domů", await ev(() => hl.current === "home"));

    /* ---------- přehled pro rodiče: slova správně / špatně ---------- */
    await ev(() => hl.openParent()); await page.waitForSelector("#dlgParent[open]");
    check("pokrok: u hry je pokrytí slov úrovně", /\d+\/\d+ slov/.test(await page.textContent("#progressList")));
    await page.locator('#progressList [data-stats="listen"]').tap(); await page.waitForSelector("#dlgStats[open]");
    const badW = await ev(() => hl.tierPool("listen", 0)[0]);
    check("přehled: chybné slovo je v sekci Procvičit", await page.locator(`#statsBody .st-row.bad[data-word="${badW}"]`).count() === 1);
    check("přehled: počty ✓/✗ u slov", /✓ \d+/.test(await page.textContent("#statsBody")) && /✗ \d+/.test(await page.textContent("#statsBody")));
    await page.locator("#statsTabs button", { hasText: "Čti" }).tap();
    check("přehled: přepnutí na jinou hru", /Úroveň 2\//.test(await page.textContent("#statsBody")));
    await shot("8-prehled-slov");
    await ev(() => { for (const d of document.querySelectorAll("dialog[open]")) d.close(); });

    /* ---------- odolnost zvuku (Android uspí AudioContext) ---------- */
    await suspend();
    await notHung("hláskování po uspání zvuku doběhne", () => hl.audio.spellOut("NOS"));
    check("zvuk se po uspání sám probudí", await ev(() => hl.audio.ctx.state === "running"));
    await suspend();
    await notHung("vyslovení slova po uspání zvuku doběhne", () => hl.audio.sayWord("PES"));
    await ev(() => hl.audio._close());
    await notHung("přehrání po zavření zvukového kontextu doběhne", () => hl.audio.praise());
    for (const g of GAME_IDS) {
      await ev(g => hl.startGame(g), g); await page.waitForFunction(() => hl.current === "game" && hl.R.word);
      await suspend();
      await page.tap("#againBtn");
      const before = await ev(() => hl.R.i);
      await answer(g, false);
      check(`${g}: po uspání zvuku hra reaguje a pokračuje`, await page.waitForFunction(b => hl.R.i > b, before, { timeout: 12000 }).then(() => true, () => false));
      await page.tap("#homeBtn"); await page.waitForTimeout(300);
    }

    /* ---------- odchod z aplikace: zvuk musí hned ztichnout ---------- */
    const bg = await ev(async () => {
      const setHidden = v => { Object.defineProperty(document, "hidden", { value: v, configurable: true });
        Object.defineProperty(document, "visibilityState", { value: v ? "hidden" : "visible", configurable: true });
        document.dispatchEvent(new Event("visibilitychange")); };
      let steps = 0; const run = hl.audio.spellOut("POLENO", () => steps++);
      await new Promise(r => setTimeout(r, 300));
      setHidden(true);
      const at = steps; await new Promise(r => setTimeout(r, 1500));
      const after = steps, state = hl.audio.ctx.state; await run;
      setHidden(false); await new Promise(r => setTimeout(r, 300));
      await hl.audio.ensureAudio();
      return { stopped: after === at, state, back: hl.audio.ctx.state };
    });
    check("odchod z aplikace: hláskování se zastaví", bg.stopped);
    check("odchod z aplikace: zvuk ztichne", bg.state === "suspended", bg.state);
    check("návrat do aplikace: zvuk zase běží", bg.back === "running", bg.back);
    await notHung("po návratu do aplikace se hláskuje", () => hl.audio.spellOut("NOS"));

    /* ---------- namlouvání hlásek ---------- */
    await ev(() => hl.openParent()); await page.tap("#pRec"); await page.waitForSelector("#dlgRec[open]");
    for (let i = 0; i < 6; i++) { await page.locator(".rk").nth(i).tap(); await page.waitForTimeout(2300); }
    const recMsg = await page.textContent("#recMsg");
    check("nahrání hlásky mikrofonem", /Uloženo/.test(recMsg), recMsg);
    await shot("5-hlasky");
    await page.tap("#dlgRec .row:last-child .main"); await page.waitForTimeout(500);
    check("po namlouvání zvuk běží", await ev(() => hl.audio.ctx.state === "running"));
    await suspend();
    await notHung("hláskování mými hláskami po uspání", () => hl.audio.spellOut("MÁMA"));

    /* ---------- namlouvání slova ---------- */
    await page.tap("#pWords"); await page.waitForSelector("#dlgWords[open]");
    const recWord = await page.locator("#wordGrid .gw").first().getAttribute("data-word");
    await page.locator("#wordGrid .gw").first().tap(); await page.waitForSelector("#dlgWordRec[open]");
    await page.tap("#wrecRec");
    check("nahrání slova mikrofonem", await page.waitForFunction(() => /Uloženo/.test(document.querySelector("#wrecMsg").textContent), null, { timeout: 8000 }).then(() => true, () => false),
      await page.textContent("#wrecMsg"));
    check("po nahrání je nabídka Vrátit původní", await page.isVisible("#wrecOrig"));
    await shot("6-slovo");
    await page.tap("#dlgWordRec .row:last-child [data-close]"); await page.waitForTimeout(300);
    check("v seznamu slov je vlastní nahrávka označená", await page.locator(`#wordGrid .gw.own[data-word="${recWord}"]`).count() === 1);
    await page.tap("#dlgWords .row:last-child .main");

    /* ---------- volba hlasu: odkud se slovo/hláska opravdu přehraje ---------- */
    const source = W => ev(async W => {
      let src = "nic";
      hl.audio.hooks.playBuf = b => { src = b === hl.audio.WREC[W] ? "moje" : (b === hl.audio.buf["w_" + W] ? (OWNV.has("w_" + W) ? "aplikace" : "robot") : "jiné"); };
      hl.audio.hooks.tts = () => { src = "telefon"; };
      await hl.audio.sayWord(W); hl.audio.hooks.playBuf = hl.audio.hooks.tts = null; return src;
    }, W);
    await ev(() => hl.audio._setVoice({ name: "Google čeština (test)", lang: "cs-CZ" }));   // emulace nemá český hlas – podstrčíme
    const appWord = await ev(W => [...OWNV].map(k => k.slice(2)).find(w => w !== W), recWord);
    await ev(() => hl.openSet()); await page.waitForSelector("#dlgSet[open]");
    await ev(() => hl.audio._setVoice({ name: "Google čeština (test)", lang: "cs-CZ" }));   // openSet volá pickVoice
    const expect = { own: ["moje", "aplikace"], recorded: [null, "aplikace"], device: ["telefon", "telefon"], robot: [null, null] };
    for (const [v, [mine, app]] of Object.entries(expect)) {
      await page.selectOption("#wordVoice", v); await page.waitForTimeout(150);
      await ev(() => hl.audio._setVoice({ name: "Google čeština (test)", lang: "cs-CZ" }));
      const a = await source(recWord), b = await source(appWord);
      check(`hlas slov „${v}“: moje namluvené slovo → ${a}`, mine ? a === mine : a !== "moje" && (v !== "robot" || a !== "telefon"));
      check(`hlas slov „${v}“: slovo s nahrávkou aplikace → ${b}`, app ? b === app : ["robot", "aplikace"].includes(b));
    }
    // pochvaly a „zkus to znovu“ mluví stejným hlasem jako slova
    const phraseSrc = fn => ev(async fn => { let src = "nic";
      hl.audio.hooks.playBuf = () => { src = "nahrávka"; }; hl.audio.hooks.tts = t => { src = "telefon:" + t; };
      await hl.audio[fn](); hl.audio.hooks.playBuf = hl.audio.hooks.tts = null; return src; }, fn);
    for (const v of ["own", "recorded", "device", "robot"]) {
      await page.selectOption("#wordVoice", v); await page.waitForTimeout(100);
      await ev(() => hl.audio._setVoice({ name: "Google čeština (test)", lang: "cs-CZ" }));
      const p1 = await phraseSrc("praise"), p2 = await phraseSrc("oops");
      const want = v === "device" ? /^telefon:/ : /^nahrávka$/;
      check(`hlas „${v}“: pochvala → ${p1}`, want.test(p1));
      check(`hlas „${v}“: zkus to znovu → ${p2}`, want.test(p2));
    }
    await page.selectOption("#wordVoice", "device");
    await ev(() => { hl.audio._setVoice({ name: "Google čeština (test)", lang: "cs-CZ" }); document.querySelector("#wordVoice").dispatchEvent(new Event("change")); });
    const praises = new Set(); for (let k = 0; k < 12; k++) praises.add(await phraseSrc("praise"));
    check("hlas telefonu: pochvaly se střídají", praises.size >= 3, [...praises].join(" "));
    check("popis hlasu ukazuje hlas telefonu", /Google čeština/.test(await page.textContent("#voiceNote")));
    const ph = await ev(() => Object.keys(hl.audio.OWNP)[0]);
    await page.selectOption("#phoneVoice", "default"); await page.waitForTimeout(150);
    check("hlásky „výchozí“: použije se nahrávka aplikace", await ev(k => hl.audio.REC[k] === hl.audio.DEFP[k] && hl.audio.REC[k] !== hl.audio.OWNP[k], ph));
    await page.selectOption("#phoneVoice", "own"); await page.waitForTimeout(150);
    check("hlásky „moje“: použije se moje nahrávka", await ev(k => hl.audio.REC[k] === hl.audio.OWNP[k], ph));
    await page.selectOption("#phoneVoice", "default");
    await page.tap("#dlgSet .row:last-child .main");
    await ev(() => hl.audio._setVoice(null));

    /* ---------- audit oken a obrazovek na různých velikostech ---------- */
    const DIALOGS = { "#dlgParent": "pro rodiče", "#dlgSet": "nastavení", "#dlgRec": "namlouvání hlásek", "#dlgWords": "namluvit slova",
      "#dlgWordRec": "namlouvání slova", "#dlgDiag": "diagnostika", "#dlgStats": "přehled slov" };
    const allDialogs = await ev(() => [...document.querySelectorAll("dialog")].map(d => "#" + d.id));
    check("audit zná všechna okna aplikace", allDialogs.every(id => DIALOGS[id]), allDialogs.filter(id => !DIALOGS[id]).join(", "));
    for (const [w, hgt] of SIZES) {
      await page.setViewportSize({ width: w, height: hgt });
      for (const [sel, name] of Object.entries(DIALOGS)) {
        await ev(sel => ({ "#dlgParent": () => hl.openParent(), "#dlgSet": () => hl.openSet(), "#dlgRec": () => hl.openRec(),
          "#dlgWords": () => document.querySelector("#pWords").click(), "#dlgWordRec": () => hl.openWordRec("BÝK"),
          "#dlgDiag": () => document.querySelector("#pDiag").click(), "#dlgStats": () => hl.openStats("listen") })[sel](), sel);
        await page.waitForTimeout(200);
        const r = await ev(sel => {
          const d = document.querySelector(sel), dr = d.getBoundingClientRect();
          const inView = el => { const q = el.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2;
            return q.height > 0 && q.top >= Math.max(0, dr.top) - 1 && q.bottom <= Math.min(innerHeight, dr.bottom) + 1 && el.contains(document.elementFromPoint(x, y)); };
          const close = [...d.querySelectorAll(".dlg > .row:last-child button")].filter(b => !b.hidden);
          const closeOk = close.length > 0 && close.every(inView);
          const unreachable = [];
          for (const el of d.querySelectorAll("button, input, select, textarea")) {
            if (el.hidden || !el.offsetParent) continue;
            el.scrollIntoView({ block: "nearest" });
            if (!inView(el)) unreachable.push((el.textContent || el.id || el.tagName).trim().slice(0, 20));
          }
          d.querySelector(".dlg").scrollTop = 0;
          const fits = dr.top >= 0 && dr.bottom <= innerHeight && dr.right <= innerWidth && d.scrollWidth <= d.clientWidth + 1;
          const junk = (d.innerText.match(/null|undefined|NaN|\[object/g) || []).join(",");
          return { junk, closeOk, close: close.map(b => b.textContent.trim()).join("/"), unreachable, fits };
        }, sel);
        check(`${w}×${hgt} ${name}: ${r.close} vidět bez posouvání`, r.closeOk);
        check(`${w}×${hgt} ${name}: vše ovladatelné je dosažitelné`, r.unreachable.length === 0, r.unreachable.join(", "));
        check(`${w}×${hgt} ${name}: okno se vejde na obrazovku`, r.fits);
        check(`${w}×${hgt} ${name}: žádný technický text (null, [object…)`, !r.junk, r.junk);
        if (hgt === 600 || w === 320) await shot(`menu-${w}x${hgt}-${sel.slice(4)}`);
        await ev(() => { for (const d of document.querySelectorAll("dialog[open]")) d.close(); });
      }
      // obrazovky: domů, každá hra, oslava – vše vidět bez posouvání, nic nepřetéká
      const screenCheck = async (name) => {
        const m = await ev(() => {
          const scr = document.querySelector(".screen:not([hidden])");
          const cut = [...scr.querySelectorAll("button")].filter(b => { const q = b.getBoundingClientRect();
            return q.width > 0 && (q.left < -1 || q.right > innerWidth + 1 || q.bottom > innerHeight + 1 || q.top < -1); });
          return { cut: cut.map(b => (b.getAttribute("aria-label") || b.textContent).trim().slice(0, 15)), hs: document.documentElement.scrollWidth <= innerWidth,
            vs: document.documentElement.scrollHeight <= innerHeight + 1, junk: (scr.innerText.match(/null|undefined|NaN|\[object/g) || []).join(",") };
        });
        check(`${w}×${hgt} ${name}: vše vidět bez posouvání`, m.cut.length === 0 && m.hs && m.vs, m.cut.join(", ") + (m.vs ? "" : " (posouvá se)"));
        check(`${w}×${hgt} ${name}: žádný technický text (null, undefined…)`, !m.junk, m.junk);
      };
      await ev(() => hl.show("home")); await page.waitForTimeout(400); await screenCheck("domů");
      if (w === 320 || hgt === 600) await shot(`main-${w}x${hgt}-domu`);
      for (const g of GAME_IDS) {
        // nejhorší případ pro rozložení: nejdelší slovo, které hra může dát (napříč všemi úrovněmi)
        const longest = await ev(g => { const G = hl.GAMES[g]; const all = [...new Set(G.tiers.flatMap(t => G.pool(t)))];
          return all.sort((a, b) => b.length - a.length)[0]; }, g);
        await ev(([g, n]) => { hl.core.progress.played = { ...(hl.core.progress.played || {}), [g]: n }; }, [g, (w + hgt) % 2 ? 0 : 5]);  // s ručičkou i bez
        await ev(([g, W]) => hl.startGame(g, [W, W, W, W, W]), [g, longest]); await page.waitForFunction(() => hl.current === "game" && hl.R.word); await page.waitForTimeout(500);
        await screenCheck(`hra ${g} (nejdelší slovo ${longest})`);
        if (w === 320 || hgt === 600) await shot(`main-${w}x${hgt}-${g}`);
      }
      await ev(() => hl.show("done")); await page.waitForTimeout(400); await screenCheck("oslava");
      await ev(() => hl.audio.stopAll());
    }
    /* ---------- zvětšené písmo v telefonu (Nastavení → Displej → Velikost písma) ---------- */
    const cdpFont = await ctx.newCDPSession(page); await cdpFont.send("Page.enable");
    for (const scale of [1.3, 1.5]) for (const [w, hgt] of [[412, 915], [360, 780], [360, 660]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await cdpFont.send("Page.setFontSizes", { fontSizes: { standard: Math.round(16 * scale), fixed: Math.round(13 * scale) } });
      const tag = `písmo ${Math.round(scale * 100)} % ${w}×${hgt}`;
      const textCheck = async (name) => {
        await page.waitForTimeout(350); await ev(() => hl.fitScreen());
        const m = await ev(() => {
          const scope = [...document.querySelectorAll(".screen:not([hidden]), dialog[open]")];
          const cut = scope.flatMap(sc => [...sc.querySelectorAll("button, .ltr, .read-word, .bubble")]).filter(e => { const r = e.getBoundingClientRect();
            return r.width > 0 && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 || r.right > innerWidth + 1 || r.left < -1); });
          const dlg = document.querySelector("dialog[open]");
          return { cut: cut.map(e => (e.getAttribute("aria-label") || e.textContent).trim().slice(0, 14)),
            scroll: !dlg && document.documentElement.scrollHeight > innerHeight + 1,
            dlgOut: dlg ? dlg.getBoundingClientRect().bottom > innerHeight + 1 || [...dlg.querySelectorAll(".dlg > .row:last-child button")].some(b => b.getBoundingClientRect().bottom > innerHeight + 1) : false };
        });
        check(`${tag} ${name}: písmena v rámečcích, vše vidět`, !m.cut.length && !m.scroll && !m.dlgOut, m.cut.join(" | ") + (m.scroll ? " (posouvá se)" : "") + (m.dlgOut ? " (okno přesahuje)" : ""));
      };
      await ev(() => hl.show("home")); await textCheck("domů");
      for (const g of GAME_IDS) {
        const longest = await ev(g => { const G = hl.GAMES[g]; return [...new Set(G.tiers.flatMap(t => G.pool(t)))].sort((a, b) => b.length - a.length)[0]; }, g);
        await ev(([g, W]) => hl.startGame(g, [W, W, W, W, W]), [g, longest]); await page.waitForFunction(() => hl.current === "game" && hl.R.word);
        await textCheck(`hra ${g} (${longest})`);
        if (scale === 1.5 && hgt === 660) await shot(`pismo150-${g}`);
      }
      await ev(() => hl.audio.stopAll());
      for (const [sel, open] of [["#dlgParent", () => hl.openParent()], ["#dlgSet", () => hl.openSet()], ["#dlgStats", () => hl.openStats("listen")]]) {
        await ev(open); await textCheck(`okno ${sel.slice(4)}`);
        await ev(() => { for (const d of document.querySelectorAll("dialog[open]")) d.close(); });
      }
    }
    await cdpFont.send("Page.setFontSizes", { fontSizes: { standard: 16, fixed: 13 } });
    await page.setViewportSize(S23.viewport);
    await ev(() => { for (const g of ["listen", "first", "build", "read"]) hl.core.progress.tier[g] = g === "read" ? 1 : 0; hl.core.saveProgress(); hl.show("home"); });

    /* ---------- znovuotevření aplikace (jako z ikony na ploše) ---------- */
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.hl);
    await page.tap('#games .game[data-game="listen"]');
    check("znovuotevření a start hry", await page.waitForFunction(() => hl.current === "game" && hl.R.word, null, { timeout: 15000 }).then(() => true, () => false));
    const persisted = await ev(W => ({ own: Object.keys(hl.audio.OWNP).length, word: hl.audio.ownWords.has(W), set: hl.core.settings.wordVoice + "/" + hl.core.settings.phoneVoice,
      tier: hl.tierOf("read"), stars: hl.core.progress.stars }), recWord);
    check("namluvené hlásky zůstaly uložené", persisted.own >= 6, `${persisted.own}`);
    check("namluvené slovo zůstalo uložené", persisted.word);
    check("volba hlasu se pamatuje", persisted.set === "device/default", persisted.set);
    check("pokrok (úroveň, hvězdy) se pamatuje", persisted.tier === 1 && persisted.stars >= 21, JSON.stringify(persisted));
    await suspend();
    await notHung("hláskování po znovuotevření a uspání", () => hl.audio.spellOut("NOS"));
    await page.tap("#homeBtn");
    await ev(() => { hl.core.settings.wordVoice = "own"; hl.core.settings.phoneVoice = "own"; hl.core.saveSettings(); hl.audio.applyPhoneVoice(); });

    // vrátit původní znění slova
    await ev(W => hl.openWordRec(W), recWord); await page.waitForSelector("#dlgWordRec[open]");
    await page.tap("#wrecOrig"); await page.waitForTimeout(300);
    check("Vrátit původní smaže vlastní nahrávku", await ev(W => !hl.audio.ownWords.has(W), recWord));
    await page.tap("#dlgWordRec .row:last-child [data-close]");

    /* ---------- diagnostika ---------- */
    await ev(() => hl.openParent()); await page.tap("#pDiag");
    const diagTxt = await page.inputValue("#diagText");
    check("diagnostika ukazuje stav a záznam", /Zvuk: running/.test(diagTxt) && /Pokrok: /.test(diagTxt) && /--- souhrn učení ---\n.+úroveň/.test(diagTxt) && /--- záznam[^\n]*---\n\d\d:\d\d:\d\d /.test(diagTxt) && /hra /.test(diagTxt));
    await shot("7-diagnostika");
    await ev(() => { for (const d of document.querySelectorAll("dialog[open]")) d.close(); });

    check("žádné chyby v konzoli", errors.length === 0, errors.slice(0, 5).join(" | "));
    check("žádné chybějící soubory", bad.length === 0, bad.join(" | "));
    await ctx.close();
  }
  await browser.close();
  if (srv) srv.close();
  console.log(failed ? `\n${failed} kontrol selhalo` : "\nVše v pořádku");
  process.exit(failed ? 1 : 0);
})();
