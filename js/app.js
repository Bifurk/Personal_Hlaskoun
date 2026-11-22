// Robot Hláskoun – hry pro dítě (6–7 let), které hraje samo, a koutek pro rodiče.
import * as core from "./core.js";
import { settings, saveSettings, progress, saveProgress, diag, DIAG, store, shuffle, pick, wait, cs } from "./core.js";
import { spell, letters, letterSound } from "./phonetics.js";
import * as audio from "./audio.js";
import { sayWord, sayPhone, sayText, spellOut, praise, oops, stopAll, ensureAudio } from "./audio.js";

const $ = id => document.getElementById(id);
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "class") e.className = v; else if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const vibrate = p => { if (settings.vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} };

/* ---------- robot (SVG) ---------- */
const ROBOT_SVG = `<svg viewBox="0 0 200 170" class="robot-svg">
  <line x1="100" y1="10" x2="100" y2="34" class="r-dark" stroke-width="6" stroke-linecap="round"/>
  <circle cx="100" cy="12" r="10" class="r-lamp"/>
  <rect x="12" y="62" width="18" height="52" rx="9" class="r-dark-f"/><rect x="170" y="62" width="18" height="52" rx="9" class="r-dark-f"/>
  <rect x="26" y="32" width="148" height="128" rx="40" class="r-dark-f"/>
  <rect x="26" y="32" width="148" height="120" rx="40" class="r-body"/>
  <rect x="44" y="52" width="112" height="80" rx="24" class="r-screen"/>
  <g class="r-eyes"><circle cx="76" cy="84" r="13" class="r-eye"/><circle cx="124" cy="84" r="13" class="r-eye"/>
    <circle cx="76" cy="86" r="6" class="r-pupil"/><circle cx="124" cy="86" r="6" class="r-pupil"/></g>
  <path class="r-smile" d="M78 108 Q100 124 122 108" fill="none" stroke-width="6" stroke-linecap="round"/>
</svg>`;
const robots = () => document.querySelectorAll(".robot");
for (const r of robots()) r.innerHTML = ROBOT_SVG;
audio.setOnTalk(on => robots().forEach(r => r.classList.toggle("talking", on)));
function mood(m) {
  for (const r of robots()) { r.classList.remove("happy", "sad"); void r.offsetWidth; if (m) r.classList.add(m); }
}

/* ---------- přizpůsobení obrazovce a velikosti písma ----------
   Po vykreslení změří, jestli se obrazovka vejde a žádné písmeno/obrázek nepřetéká svou krabičku;
   když ne, zmenšuje --fit (rozměry her jsou v em), dokud se nevejde (nejvýš na 50 %). */
const OVERFLOW_SEL = ".ltr, .key, .letter-btn, .pic, .read-word, .speaker, .round-btn, .game, .bubble";
function overflows() {
  const de = document.documentElement, scr = document.querySelector(".screen:not([hidden])");
  if (de.scrollHeight > innerHeight + 1 || de.scrollWidth > innerWidth + 1) return true;
  if (!scr) return false;
  for (const e of scr.querySelectorAll(OVERFLOW_SEL)) {
    if (!e.offsetParent) continue;
    const r = e.getBoundingClientRect();
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 || r.right > innerWidth + 1 || r.left < -1) return true;
  }
  return false;
}
export function fitScreen() {
  const de = document.documentElement; let f = 1;
  de.style.setProperty("--fit", "1");
  while (f > 0.5 && overflows()) { f = Math.round((f - 0.05) * 100) / 100; de.style.setProperty("--fit", String(f)); }
  return f;
}
let fitQueued = false;
const queueFit = () => { if (fitQueued) return; fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fitScreen(); }); };
addEventListener("resize", queueFit);
document.fonts && document.fonts.ready.then(queueFit);

/* ---------- obrazovky (View Transitions, když je prohlížeč umí) ---------- */
let current = "home";
function show(id) {
  const go = () => { for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== id; current = id; fitScreen(); };
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const t = document.startViewTransition(go);   // přeskočená animace (rychlé přepnutí) není chyba
    for (const p of [t.ready, t.finished, t.updateCallbackDone]) p && p.catch(() => {});
  } else go();
}

/* ---------- hry ---------- */
const ALL_LETTERS = ["A","E","I","O","U","M","L","S","P","T","K","R","N","V","D","B","J","H","Z","Š","Ž","Č","Ř","C","CH","F"];
const LEVEL_OF = {}; for (const [l, ws] of Object.entries(LEVELS)) for (const w of ws) LEVEL_OF[w] = +l;
const PIC_WORDS = Object.keys(PICS);
const wordsOfLevels = lvs => Object.entries(LEVELS).filter(([l]) => lvs.includes(+l)).flatMap(([, ws]) => ws);

/* Slova pro „První hláska“: první psané písmeno musí znít stejně jako první hláska (ne „včela“ → f, „děti“ → ď) */
const firstOk = W => { const L = letters(W)[0]; return ALL_LETTERS.includes(L) && spell(W, true)[0].s === letterSound(L) && spell(W, false)[0].s === letterSound(L); };

/* Slova, která šestileté dítě nezná (abstraktní, knižní). Ve hrách bez obrázku (První hláska, Skládej) jen matou
   – diagnostika 17. 11.: dítě v První hlásce chybovalo hlavně na SÁL, CIT, HON, LEM, LEN… */
export const UNKNOWN_WORDS = new Set(["LEN", "LÍN", "SÁL", "HÁJ", "CIT", "HON", "LEM", "NES", "BOK", "ŘEČ", "MÍR"]);

export const GAMES = {
  listen: { icon: "👂", label: "Poslouchej", color: "blue",
    say: "Poslouchej robota a ťukni na správný obrázek.",
    tiers: [[1], [2], [3], [4, 5, 11], [6, 7, 10], [8, 9]], pool: lv => PIC_WORDS.filter(w => lv.includes(LEVEL_OF[w])) },
  first: { icon: "A", label: "První hláska", color: "orange",
    say: "Jakým písmenem začíná slovo?",
    tiers: [[1], [2], [3], [4], [5, 11], [6], [7], [8], [9, 10]], pool: lv => wordsOfLevels(lv).filter(w => firstOk(w) && audio.canSay(w) && !UNKNOWN_WORDS.has(w)) },
  build: { icon: "🧩", label: "Skládej", color: "green",
    say: "Poslouchej a slož slovo z písmenek.",
    tiers: [[1], [2], [3], [9, 10], [4], [6], [5, 11], [7], [8]], pool: lv => wordsOfLevels(lv).filter(w => audio.canSay(w) && !UNKNOWN_WORDS.has(w)) },
  read: { icon: "📖", label: "Čti", color: "purple",
    say: "Přečti slovo a ťukni na obrázek.",
    tiers: [[1], [2], [3], [4, 5, 11], [6, 7, 10], [8, 9]], pool: lv => PIC_WORDS.filter(w => lv.includes(LEVEL_OF[w])) },
};
const ROUND = 5;
const tierOf = g => Math.min(progress.tier[g] || 0, GAMES[g].tiers.length - 1);

/* ---------- statistika slov a postup ----------
   Na vyšší úroveň se postupuje jen po kole 5/5 bez jediné chyby A když je splněné pravidlo hry:
   - Poslouchej a Čti (málo slov s obrázkem): VŠECHNA slova úrovně určená správně (poslední pokus u každého slova bez chyby),
   - První hláska a Skládej: aspoň 80 % slov úrovně už hraných.
   Po slabém kole (≤ 2 hvězdy) se hra vrátí o úroveň níž. */
export const ADVANCE_COVERAGE = 0.8;
const ALL_CORRECT = new Set(["listen", "read"]);
export const needsAllCorrect = g => ALL_CORRECT.has(g);
export const tierPool = (g, t = tierOf(g)) => [...new Set(GAMES[g].pool(GAMES[g].tiers[t]))];
export const wstat = (g, W) => (progress.words[g] || {})[W];
/* Záznam odpovědi: wrong = s čím si slovo spletlo {volba: počet}, ms = průměrný čas do první odpovědi */
function recordWord(g, W, ok, info = {}) {
  const all = progress.words[g] = progress.words[g] || {};
  const st = all[W] = all[W] || { n: 0, ok: 0, bad: 0 };
  st.n++; ok ? st.ok++ : st.bad++; st.last = ok ? 1 : 0; st.t = Date.now();
  if (info.ms) st.ms = Math.round(st.ms ? st.ms * 0.7 + info.ms * 0.3 : info.ms);
  for (const c of info.wrong || []) {
    st.wrong = st.wrong || {}; st.wrong[c] = (st.wrong[c] || 0) + 1;
    const keys = Object.keys(st.wrong); if (keys.length > 6) delete st.wrong[keys.sort((a, b) => st.wrong[a] - st.wrong[b])[0]];
    if (info.letter) { const cf = progress.conf = progress.conf || {}; const k = `${g}:${info.letter}>${c}`; cf[k] = (cf[k] || 0) + 1; }
  }
  saveProgress();                       // ukládat hned – počítá se i slovo z nedohraného kola
  const sec = info.ms ? (info.ms / 1000).toFixed(1).replace(".", ",") + " s" : "";
  diag(`${ok ? "✓" : "✗"} ${g} ${W}${info.wrong?.length ? " → " + info.wrong.join(", ") : ""}${sec ? " · " + sec : ""}${info.again ? " · 🔊" + info.again : ""}`);
}
/** Plnění pravidla pro postup: seen = hraná slova, ok = slova naposledy bez chyby, pct = splnění 0–1, ready = splněno */
export function coverage(g, t = tierOf(g)) {
  const pool = tierPool(g, t), seen = pool.filter(w => wstat(g, w)?.n).length, ok = pool.filter(w => wstat(g, w)?.last === 1).length;
  const all = needsAllCorrect(g), done = all ? ok : seen, total = pool.length;
  const pct = total ? done / total : 0;
  return { seen, ok, total, pct, ready: all ? ok === total : pct >= ADVANCE_COVERAGE,
    text: all ? `${ok}/${total} slov správně` : `${seen}/${total} slov hráno` };
}
/* Váha slova při výběru: chybná slova častěji, zvládnutá méně, nehraná tak, aby se pokryla úroveň */
export function weight(g, W, recent) {
  const st = wstat(g, W); let w;
  if (!st) w = 3;                                   // ještě nehrané
  else if (st.last === 0) w = 8;                    // naposledy špatně
  else if (st.bad > st.ok) w = 5;                   // víc chyb než úspěchů
  else if (st.bad > 0) w = 2.5;                     // občas chybuje
  else if (st.ok >= 2) w = 0.5;                     // spolehlivě zvládá
  else w = 1;
  return recent.has(W) && !(st && st.last === 0) ? w * 0.25 : w;   // nedávno hrané méně (kromě chybných)
}
function chooseWords(g) {
  const G = GAMES[g], recent = new Set(progress.last[g] || []);
  let t = tierOf(g), pool = [];
  while (pool.length < ROUND && t < G.tiers.length) { pool = [...new Set([...pool, ...G.pool(G.tiers[t])])]; t++; }
  const cand = pool.map(w => ({ w, k: weight(g, w, recent) }));
  const out = [], seenPic = new Set();
  while (out.length < ROUND && cand.length) {
    const sum = cand.reduce((a, c) => a + c.k, 0); let r = Math.random() * sum, i = 0;
    while (i < cand.length - 1 && (r -= cand[i].k) > 0) i++;
    const [{ w }] = cand.splice(i, 1);
    if (PICS[w] && out.some(o => PICS[o] && picsClash(o, w))) continue;   // v jednom kole ne dva podobné obrázky
    out.push(w);
  }
  return shuffle(out);
}

/* Stav kola */
const R = { game: null, words: [], i: 0, results: [], mistakes: 0, busy: false, word: null, onAgain: null, t0: 0, firstMs: 0, chosen: [], again: 0, letter: null };

function renderGames() {
  $("games").replaceChildren(...Object.entries(GAMES).map(([id, G]) =>
    h("button", { class: "game " + G.color, "data-game": id, "aria-label": G.label, onclick: () => startGame(id) },
      h("span", { class: "game-icon" + (G.icon.length === 1 ? " letter" : ""), "aria-hidden": "true" }, G.icon),
      h("span", { class: "game-label" }, G.label),
      h("span", { class: "game-level", "aria-hidden": "true" }, "★".repeat(Math.min(tierOf(id) + 1, 6))))));
  $("starTotal").textContent = progress.stars;
}

let unlockDone = null;
function unlock() {                // první dotyk: odemknout zvuk a načíst nahrávky (jen jednou)
  if (!unlockDone) unlockDone = (async () => {
    await ensureAudio();
    await audio.loadRecs(); await audio.loadOwnWordList(); audio.pickVoice(); setTimeout(audio.pickVoice, 1500);
  })();
  return unlockDone;
}

export async function startGame(g, words = null) {   // words: jen pro testy (konkrétní slova)
  stopAll();
  await unlock();
  logAbandon();
  Object.assign(R, { game: g, words: words || chooseWords(g), i: 0, results: [], mistakes: 0, cov0: null });
  R.cov0 = coverage(g);
  document.body.dataset.game = GAMES[g].color;
  diag("hra " + g + " úroveň " + tierOf(g) + ": " + R.words.join(" "));
  show("game");
  renderDots();
  await wait(350);
  await sayText(GAMES[g].say);
  nextWord(true);
}

function renderDots() {
  $("dots").replaceChildren(...R.words.map((_, k) => h("li", {
    class: k < R.results.length ? (R.results[k] ? "gold" : "silver") : (k === R.i ? "now" : "") })));
}

function nextWord(first = false) {
  document.body.classList.remove("long-word");
  if (R.i >= R.words.length) return finishRound();
  R.word = R.words[R.i]; R.mistakes = 0; R.busy = false; R.t0 = Date.now(); R.firstMs = 0; R.chosen = []; R.again = 0; R.letter = null;
  mood(); renderDots();
  ({ listen: gListen, first: gFirst, build: gBuild, read: gRead })[R.game](R.word, first);
  fitScreen(); queueFit();
}

async function correct(el) {
  if (R.busy) return; R.busy = true;
  if (!R.firstMs) R.firstMs = Date.now() - R.t0;
  el && el.classList.add("ok");
  stopAll(); mood("happy"); vibrate(30); burst(el);
  R.results.push(R.mistakes === 0); renderDots();
  recordWord(R.game, R.word, R.mistakes === 0, { ms: R.firstMs || Date.now() - R.t0, wrong: R.chosen, again: R.again, letter: R.letter });
  await praise();
  await wait(500);
  R.i++; nextWord();
}
/** Špatná odpověď; chosen = co dítě vybralo (slovo obrázku nebo písmeno) */
async function wrong(el, sayFn, chosen) {
  R.mistakes++;
  if (!R.firstMs) R.firstMs = Date.now() - R.t0;
  if (chosen && R.chosen.length < 4) R.chosen.push(chosen);
  if (el) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("bad", "shake"); }
  mood("sad"); vibrate([60, 40, 60]);
  stopAll();
  if (sayFn) await sayFn();
  if (R.mistakes === 1 || R.mistakes % 3 === 0) await oops();
}

/* Obrázek slova: emoji, nebo vlastní obrázek (PICS[W] = "img:SLOVO" → img/pics/SLOVO.webp) */
export const picEl = (W, cls = "") => {
  const p = PICS[W]; if (!p) return null;
  return p.startsWith("img:") ? h("img", { class: "pic-img " + cls, src: `img/pics/${encodeURIComponent(p.slice(4))}.webp`, alt: "", draggable: "false", decoding: "async" })
                              : h("span", { class: cls }, p);
};
const picCard = (W, onclick) => h("button", { class: "pic", "data-word": W, "aria-label": W.toLowerCase(), onclick }, picEl(W));
/* Nabídka obrázků: správný + n−1 dalších; všechny obrázky jasně odlišné (picsClash v js/pictures.js) */
export function pictureOptions(W, n = 3) {
  const others = shuffle(PIC_WORDS.filter(w => w !== W && !picsClash(w, W)));
  // podobně dlouhé slovo nebo stejné písmeno na začátku dělá hru zajímavější, ale obrázek musí být jiný
  const similar = others.filter(w => letters(w).length === letters(W).length || w[0] === W[0]);
  const chosen = [];
  for (const w of [...similar.slice(0, 1), ...others]) {
    if (chosen.length >= n - 1) break;
    if (!chosen.includes(w) && !chosen.some(c => picsClash(c, w))) chosen.push(w);
  }
  return shuffle([W, ...chosen]);
}
// Ručička ukáže, kam ťuknout – jen v prvních kolech každé hry, než si to dítě osvojí
const hand = () => (progress.played?.[R.game] || 0) < 2 ? h("div", { class: "hand", "aria-hidden": "true" }, "👆") : null;

/* 1) Poslouchej: robot vyhláskuje, dítě ťukne na obrázek */
function gListen(W, first) {
  const ph = spell(W, settings.assim);
  const tiles = ph.map(() => h("span", { class: "tile" }));
  $("prompt").replaceChildren(h("div", { class: "tiles" }, tiles));
  const go = () => spellOut(W, i => tiles.forEach((t, k) => { t.classList.toggle("on", k === i); if (k === i) t.classList.add("seen"); }));
  R.onAgain = () => { R.again++; go(); };
  $("answers").replaceChildren(h("div", { class: "pics" }, pictureOptions(W).map(w =>
    picCard(w, e => { if (R.busy) return;
      if (w === W) { const el = e.currentTarget; R.busy = true; el.classList.add("ok"); sayWord(W).then(() => { R.busy = false; correct(el); }); }  // celé slovo spojí hlásky se slovem
      else wrong(e.currentTarget, async () => { await sayWord(w); if (R.mistakes === 1) { await wait(350); await spellOut(W, null, 1.5); } }, w); }))),
    ...(first ? [hand()] : []).filter(Boolean));
  setTimeout(go, 300);
}

/* 2) První hláska: obrázek + slovo, dítě vybere první písmeno */
function gFirst(W, first) {
  const L = letters(W)[0];
  const opts = shuffle([L, ...shuffle(ALL_LETTERS.filter(x => letterSound(x) !== letterSound(L))).slice(0, 2)]);
  const rest = letters(W).slice(1).map(x => h("span", { class: "ltr dim" }, cs(x)));
  const firstSlot = h("span", { class: "ltr slot" }, "?");
  $("prompt").replaceChildren(
    PICS[W] ? h("button", { class: "pic hero-pic", "aria-label": "Zopakovat slovo", onclick: () => sayWord(W) }, picEl(W))
            : h("button", { class: "speaker", "aria-label": "Zopakovat slovo", onclick: () => sayWord(W) }, "🔊"),
    h("div", { class: "word-row" }, firstSlot, rest));
  R.onAgain = () => { R.again++; sayWord(W); };
  $("answers").replaceChildren(h("div", { class: "letters" }, opts.map(x =>
    h("button", { class: "letter-btn", "aria-label": "písmeno " + x, onclick: e => {
      const el = e.currentTarget; if (R.busy) return;
      if (x === L) { R.busy = true; el.classList.add("ok"); firstSlot.textContent = cs(x); firstSlot.classList.add("filled"); rest.forEach(r => r.classList.remove("dim")); sayPhone(letterSound(x)).then(() => { R.busy = false; correct(el); }); }
      else { R.letter = L; wrong(el, () => sayPhone(letterSound(x)), x); }
    } }, cs(x)))), ...(first ? [hand()] : []).filter(Boolean));
  setTimeout(() => sayWord(W), 300);
}

/* 3) Skládej: slovo zazní (a je obrázek, pokud existuje), dítě skládá písmena; špatné písmeno se nepřijme */
function gBuild(W, first) {
  const L = letters(W);
  const extra = shuffle(ALL_LETTERS.filter(x => !L.includes(x))).slice(0, L.length <= 4 ? 2 : 3);
  const bank = shuffle([...L.map((l, i) => ({ l, i })), ...extra.map((l, i) => ({ l, i: 100 + i }))]);
  const slots = L.map(() => h("span", { class: "ltr slot" }));
  document.body.classList.toggle("long-word", L.length + extra.length > 8);   // hodně písmen: menší robot a klávesy
  let pos = 0, missHere = 0;
  $("prompt").replaceChildren(
    PICS[W] ? h("button", { class: "pic hero-pic small", "aria-label": "Zopakovat slovo", onclick: () => sayWord(W) }, picEl(W))
            : h("button", { class: "speaker", "aria-label": "Zopakovat slovo", onclick: () => sayWord(W) }, "🔊"),
    h("div", { class: "word-row" + (L.length > 6 ? " long" : "") }, slots));
  R.onAgain = () => { R.again++; sayWord(W); };
  const keys = bank.map(b => h("button", { class: "key", "aria-label": "písmeno " + b.l, onclick: e => {
    if (R.busy) return;
    const k = e.currentTarget;
    sayPhone(letterSound(b.l));
    if (b.l === L[pos]) {
      slots[pos].textContent = cs(b.l); slots[pos].classList.add("filled"); k.disabled = true; k.classList.add("used");
      for (const q of keys) q.classList.remove("hint");
      pos++; missHere = 0;
      if (pos === L.length) { R.busy = true; slots.forEach(s => s.classList.add("ok")); wait(350).then(() => sayWord(W)).then(() => { R.busy = false; correct(null); }); }
    } else {
      missHere++;
      // hlasová nápověda: po 1. chybě robot zopakuje slovo, pak řekne hlásku, která má přijít
      R.letter = L[pos]; const need = L[pos];
      wrong(k, () => missHere === 1 ? sayWord(W) : wait(250).then(() => sayPhone(letterSound(need))), b.l);
      setTimeout(() => k.classList.remove("bad"), 600);
      if (missHere >= 2) keys.find(q => !q.disabled && bank[keys.indexOf(q)].l === L[pos])?.classList.add("hint");
    }
  } }, cs(b.l)));
  $("answers").replaceChildren(h("div", { class: "bank" }, keys), ...(first ? [hand()] : []).filter(Boolean));
  setTimeout(() => sayWord(W), 300);
}

/* 4) Čti: slovo napsané, dítě ťukne na obrázek; 🔊 přečte slovo (pomoc) */
function gRead(W, first) {
  $("prompt").replaceChildren(h("div", { class: "read-word" + (W.length > 6 ? " long" : "") }, cs(W)));
  R.onAgain = () => { R.mistakes++; R.again++; sayWord(W); };
  $("answers").replaceChildren(h("div", { class: "pics" }, pictureOptions(W).map(w =>
    picCard(w, e => { const el = e.currentTarget; if (R.busy) return;
      if (w === W) { R.busy = true; el.classList.add("ok"); sayWord(W).then(() => { R.busy = false; correct(el); }); }
      else wrong(el, () => sayWord(w), w); }))),
    ...(first ? [hand()] : []).filter(Boolean));
}

/* Změna úrovně po kole. Postup: 5/5 a splněné pravidlo hry. Návrat o úroveň níž až po DVOU slabých kolech
   (≤ 2 hvězdy) za sebou a nikdy v prvních 3 kolech po postupu (diagnostika 17. 11.: po postupu dítě hned
   jedním slabým kolem spadlo zpět a muselo znovu zvládnout všech 34 slov). */
export function applyTier(g, gold, cov) {
  const t = tierOf(g), max = GAMES[g].tiers.length - 1;
  progress.grace = progress.grace || {}; progress.weak = progress.weak || {};
  const grace = progress.grace[g] || 0;
  progress.weak[g] = gold <= 2 ? (progress.weak[g] || 0) + 1 : 0;
  if (gold === ROUND && cov.ready && t < max) { progress.tier[g] = t + 1; progress.grace[g] = 3; progress.weak[g] = 0; return "postup"; }
  if (grace > 0) progress.grace[g] = grace - 1;
  if (progress.weak[g] >= 2 && t > 0 && grace === 0) { progress.tier[g] = t - 1; progress.weak[g] = 0; return "2 slabá kola za sebou"; }
  if (gold <= 2 && t > 0) return grace ? "slabé kolo, ochrana po postupu" : "slabé kolo (1. za sebou)";
  return "";
}

async function finishRound() {
  const gold = R.results.filter(Boolean).length;
  progress.stars += gold; progress.rounds++; core.addToday(1);
  progress.played = { ...(progress.played || {}), [R.game]: ((progress.played || {})[R.game] || 0) + 1 };
  const g = R.game, t = tierOf(g), cov = R.cov0 || coverage(g, t);
  const cov2 = coverage(g, t);          // po kole (zahrnuje právě odehraná slova)
  const why = applyTier(g, gold, cov2);
  progress.last[g] = [...R.words, ...(progress.last[g] || [])].slice(0, 15);
  saveProgress();
  diag(`kolo ${g}: ${gold}/${ROUND}, ${cov2.text} (před kolem ${cov.text}), úroveň ${t}→${tierOf(g)}${why ? " – " + why : ""}`);
  $("earned").replaceChildren(...R.results.map((ok, k) => h("span", { class: "star " + (ok ? "gold" : "silver"), style: `--d:${k * 0.15}s` }, "★")));
  show("done"); confetti();
  vibrate([30, 60, 30, 60, 80]);
  await wait(500);
  await sayText(gold >= 4 ? "Hurá! Výborně!" : "Hotovo! Jen tak dál!");
}

/* ---------- efekty ---------- */
function burst(el) {
  if (!el) el = $("prompt");
  const r = el.getBoundingClientRect();
  for (let k = 0; k < 10; k++) {
    const p = h("span", { class: "spark", style: `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;--a:${k * 36}deg` }, "✦");
    document.body.append(p); setTimeout(() => p.remove(), 700);
  }
}
function confetti() {
  const colors = ["#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#B983FF"];
  $("confetti").replaceChildren(...Array.from({ length: 40 }, (_, k) => h("i", {
    style: `left:${Math.random() * 100}%;background:${colors[k % 5]};--d:${Math.random() * 0.8}s;--x:${(Math.random() - 0.5) * 120}px` })));
}

/* ---------- ovládání ---------- */
function logAbandon() { if (R.game && current === "game" && R.i < R.words.length) diag(`kolo ${R.game} opuštěno po ${R.i}/${R.words.length} slovech (u slova ${R.word})`); }
$("homeBtn").onclick = () => { logAbandon(); stopAll(); renderGames(); show("home"); };
$("againBtn").onclick = () => { stopAll(); R.onAgain && R.onAgain(); };
$("playAgain").onclick = () => startGame(R.game);
$("goHome").onclick = () => { renderGames(); show("home"); };
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

/* Pozdrav robota při prvním dotyku na úvodní obrazovce */
$("robotHome").addEventListener("click", async () => { await unlock(); sayText("Ahoj! Vyber si hru."); });

/* ---------- koutek pro rodiče: podržet ⚙️ 1,5 s, nebo 5× rychle ťuknout ----------
   iPhone (Safari) při delším podržení spustí vlastní gesto (lupa, výběr) a podržení přeruší (pointercancel),
   proto: touch-action none + zrušení výchozí akce dotyku, a náhradní cesta 5 ťuknutí do 3 s. */
(() => {
  const btn = $("parentBtn"); let t = null, taps = [];
  const cancel = () => { clearTimeout(t); t = null; btn.classList.remove("holding"); };
  const start = () => { if (t) return; btn.classList.add("holding"); t = setTimeout(() => { cancel(); openParent(); }, 1500); };
  const hint = () => { $("parentHint").hidden = false; setTimeout(() => $("parentHint").hidden = true, 3000); };
  btn.addEventListener("touchstart", e => { e.preventDefault(); start(); }, { passive: false });   // iOS: žádná lupa ani výběr
  btn.addEventListener("touchend", e => { e.preventDefault(); if (t) { cancel(); tap(); } }, { passive: false });
  btn.addEventListener("pointerdown", e => { if (e.pointerType === "touch") return; e.preventDefault(); start(); });
  btn.addEventListener("pointerup", e => { if (e.pointerType === "touch") return; if (t) { cancel(); tap(); } });
  btn.addEventListener("pointerleave", e => { if (e.pointerType !== "touch" && t) cancel(); });
  function tap() {
    const now = Date.now(); taps = [...taps.filter(x => now - x < 3000), now];
    if (taps.length >= 5) { taps = []; openParent(); } else hint();
  }
  btn.addEventListener("contextmenu", e => e.preventDefault());
  btn.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") openParent(); });
})();
export function openParent() {
  stopAll(); unlock();             // nahrávky se načítají na pozadí – okno se otevře hned
  renderProgress(); $("dlgParent").showModal();
}
function renderProgress() {
  $("progressList").replaceChildren(
    h("p", { class: "note" }, `Hvězdiček celkem: ${progress.stars} · odehraných kol: ${progress.rounds} · dnes: ${core.todayCount()}`),
    h("p", { class: "note" }, `Na další úroveň: kolo bez chyby (5/5) a navíc – Poslouchej a Čti: všechna slova úrovně určená správně; První hláska a Skládej: aspoň ${ADVANCE_COVERAGE * 100} % slov úrovně hraných.`),
    ...Object.entries(GAMES).flatMap(([id, G]) => { const c = coverage(id), bad = Object.values(progress.words[id] || {}).filter(s => s.last === 0).length; return [h("div", { class: "prog-row" },
      h("button", { class: "prog-name link-btn", "data-stats": id, onclick: () => openStats(id) }, G.label + " ›"),
      h("button", { class: "mini", "aria-label": G.label + " lehčí", onclick: () => { progress.tier[id] = Math.max(0, tierOf(id) - 1); saveProgress(); renderProgress(); renderGames(); } }, "−"),
      h("span", { class: "prog-tier" }, `úroveň ${tierOf(id) + 1}/${G.tiers.length}`),
      h("button", { class: "mini", "aria-label": G.label + " těžší", onclick: () => { progress.tier[id] = Math.min(G.tiers.length - 1, tierOf(id) + 1); saveProgress(); renderProgress(); renderGames(); } }, "+")),
      h("div", { class: "prog-sub" },
        h("span", { class: "bar", "aria-label": c.text }, h("i", { style: `width:${Math.round(c.pct * 100)}%`, class: c.ready ? "full" : "" })),
        h("span", {}, c.text + (bad ? ` · ❗ ${bad} k procvičení` : "")))]; }));
}

/* --- podrobný přehled slov jedné hry --- */
let statsGame = "listen";
export function openStats(g) { statsGame = g || statsGame; renderStats(); $("dlgStats").showModal(); }
function renderStats() {
  const g = statsGame, G = GAMES[g], all = progress.words[g] || {}, c = coverage(g);
  $("statsTabs").replaceChildren(...Object.entries(GAMES).map(([id, X]) =>
    h("button", { class: "lv wide", "aria-pressed": String(id === g), onclick: () => { statsGame = id; renderStats(); } }, X.label)));
  const row = (W, st) => h("div", { class: "st-row" + (st && st.last === 0 ? " bad" : ""), "data-word": W },
    h("span", { class: "st-word" }, picEl(W, "inline"), " ", cs(W),
      st && st.wrong ? h("small", { class: "st-conf" }, "plete s: " + Object.entries(st.wrong).map(([k, v]) => cs(k) + (v > 1 ? " ×" + v : "")).join(", ")) : null),
    st ? h("span", { class: "st-num" }, h("b", { class: "ok" }, "✓ " + st.ok), " ", h("b", { class: "ko" }, "✗ " + st.bad)) : h("span", { class: "st-num muted" }, "–"),
    h("span", { class: "st-tag" }, !st ? "nehráno" : st.last === 0 ? "naposledy špatně" : st.bad > st.ok ? "chybuje" : st.ok >= 2 && !st.bad ? "umí" : "dobře"));
  const played = Object.entries(all);
  const trouble = played.filter(([, s]) => s.last === 0 || s.bad > s.ok).sort((a, b) => (a[1].last - b[1].last) || (b[1].bad - a[1].bad));
  const good = played.filter(([, s]) => !(s.last === 0 || s.bad > s.ok)).sort((a, b) => b[1].bad - a[1].bad || b[1].ok - a[1].ok);
  const unseen = tierPool(g).filter(w => !all[w]);
  const tot = played.reduce((a, [, s]) => ({ ok: a.ok + s.ok, bad: a.bad + s.bad }), { ok: 0, bad: 0 });
  $("statsBody").replaceChildren(...[
    h("p", { class: "note" }, `Úroveň ${tierOf(g) + 1}/${G.tiers.length} · ` + (needsAllCorrect(g) ? `správně ${c.ok}/${c.total} slov úrovně (potřeba všechna)` : `hráno ${c.seen}/${c.total} slov úrovně (${Math.round(c.pct * 100)} %, potřeba ${ADVANCE_COVERAGE * 100} %)`) + ` · ` +
      `odpovědi celkem ✓ ${tot.ok} / ✗ ${tot.bad}`),
    h("h3", {}, `❗ Procvičit (${trouble.length})`), trouble.length ? trouble.map(([w, s]) => row(w, s)) : h("p", { class: "note" }, "Zatím žádné chyby."),
    h("h3", {}, `✓ Zvládá (${good.length})`), good.length ? good.map(([w, s]) => row(w, s)) : h("p", { class: "note" }, "Zatím nic."),
    h("h3", {}, `Ještě nehráno v této úrovni (${unseen.length})`), h("p", { class: "note st-unseen" }, unseen.map(w => cs(w)).join(", ") || "Všechna slova úrovně už hrál(a).")].flat());
}
$("pRec").onclick = openRec;
$("pWords").onclick = async () => { renderWords(); $("dlgWords").showModal(); await unlock(); renderWords(); };
$("pSet").onclick = openSet;
$("pDiag").onclick = () => { renderDiag(); $("dlgDiag").showModal(); };

/* --- namlouvání hlásek --- */
let activeRec = null;
function recMsg(t) { const m = $("recMsg"); m.hidden = !t; m.textContent = t || ""; }
function renderRec() {
  $("recGrid").replaceChildren(...audio.PHONES.map(([k, ex]) => {
    const b = h("button", { class: "rk" + (audio.OWNP[k] ? " has" : ""), "aria-label": `hláska ${k}, jako ${ex}` }, h("b", {}, cs(k)), h("span", {}, ex));
    b.addEventListener("click", async () => {
      if (activeRec) { const same = activeRec.k === k; activeRec.r.stop(); if (same) return; }
      recMsg("Připravuji mikrofon…");
      let r; try { r = await audio.record(1800); } catch (err) { recMsg(audio.micError(err)); diag("mikrofon: " + (err.name || err.message)); return; }
      activeRec = { k, r }; b.classList.add("rec"); recMsg(`Nahrávám ${cs(k)}… řekněte hlásku teď.`);
      const blob = await r.done; b.classList.remove("rec"); if (activeRec && activeRec.k === k) activeRec = null;
      try {
        const buf = await audio.savePhone(k, blob);
        if (!buf) { recMsg("Nic nebylo slyšet. Mluvte blíž k telefonu a zkuste to znovu."); return; }
        b.classList.add("has");
        recMsg(`Uloženo: ${cs(k)}. Namluveno ${audio.PHONES.filter(([q]) => audio.OWNP[q]).length} z ${audio.PHONES.length}.` +
          (settings.phoneVoice === "own" ? "" : " Pozor: v Nastavení jsou zapnuté výchozí hlásky."));
        audio.playBuf(buf);
      } catch (err) { recMsg("Nahrávku se nepodařilo zpracovat, zkuste to znovu."); diag("hláska " + k + ": " + err.message); }
    });
    b.addEventListener("contextmenu", e => e.preventDefault());
    return b;
  }));
  const n = audio.PHONES.filter(([k]) => audio.OWNP[k]).length;
  recMsg((n ? `Namluveno ${n} z ${audio.PHONES.length} hlásek.` : "") + (settings.phoneVoice === "own" ? "" : " V Nastavení jsou zapnuté výchozí hlásky – vaše se teď nepoužívají."));
}
export async function openRec() { recMsg(""); renderRec(); $("dlgRec").showModal(); await unlockDone; renderRec(); }
$("recTest").onclick = () => spellOut(R.word || "NOS");
$("dlgRec").addEventListener("close", () => { if (activeRec) activeRec.r.stop(); activeRec = null; audio.releaseMic(); });

/* --- namlouvání slov --- */
let wordsLevel = 1;
function renderWords() {
  $("lvChips").replaceChildren(...Object.keys(LEVELS).map(l => h("button", { class: "lv", "aria-pressed": String(+l === wordsLevel), onclick: () => { wordsLevel = +l; renderWords(); } }, l)));
  $("wordGrid").replaceChildren(...LEVELS[wordsLevel].map(w => h("button", {
    class: "gw" + (audio.ownWords.has(w) ? " own" : ""), "data-word": w, onclick: () => openWordRec(w) },
    picEl(w, "inline"), PICS[w] ? " " : "", cs(w))));
}
let wrec = null;
const wrecMsg = t => { $("wrecMsg").textContent = t; };
function renderWordRec() {
  const W = wrec.W, has = audio.ownWords.has(W);
  $("wrecWord").replaceChildren(...[picEl(W, "inline"), PICS[W] ? " " : "", cs(W)].filter(x => x !== null));
  $("wrecState").textContent = has ? "Teď se přehrává vaše nahrávka." : (OWNV.has("w_" + W) ? "Teď se přehrává nahrávka aplikace." : "Teď slovo čte hlas telefonu.");
  $("wrecOrig").hidden = !has;
  $("wrecRec").classList.toggle("on", !!wrec.r);
  $("wrecRec").textContent = wrec.r ? "⏹ Zastavit" : (has ? "🎙️ Nahrát znovu" : "🎙️ Nahrát");
}
export function openWordRec(W) {
  stopAll(); wrec = { W };
  wrecMsg("Ťukněte na Nahrát a řekněte celé slovo zřetelně. Nahrávání se samo zastaví po 3 s.");
  renderWordRec(); $("dlgWordRec").showModal();
}
$("wrecRec").onclick = async () => {
  if (wrec.r) { wrec.r.stop(); return; }
  wrecMsg("Připravuji mikrofon…");
  let r; try { r = await audio.record(3000); } catch (err) { wrecMsg(audio.micError(err)); diag("mikrofon: " + (err.name || err.message)); return; }
  const W = wrec.W; wrec.r = r; wrecMsg("Nahrávám… řekněte „" + W.toLowerCase() + "“."); renderWordRec();
  const blob = await r.done; wrec.r = null;
  try {
    const buf = await audio.saveWord(W, blob);
    if (!buf) { wrecMsg("Nic nebylo slyšet. Mluvte blíž k telefonu a zkuste to znovu."); renderWordRec(); return; }
    diag("namluveno slovo " + W + " (" + buf.duration.toFixed(2) + " s)");
    wrecMsg("Uloženo. Takhle teď slovo zní. Když se nelíbí, nahrajte ho znovu.");
    renderWordRec(); await audio.playBuf(buf);
  } catch (err) { wrecMsg("Nahrávku se nepodařilo zpracovat, zkuste to znovu."); diag("slovo " + W + ": " + err.message); renderWordRec(); }
};
$("wrecPlay").onclick = () => { if (wrec.r) wrec.r.stop(); stopAll(); sayWord(wrec.W); };
$("wrecOrig").onclick = async () => { await audio.deleteWord(wrec.W); diag("vráceno původní slovo " + wrec.W); wrecMsg("Vráceno původní znění."); renderWordRec(); sayWord(wrec.W); };
$("dlgWordRec").addEventListener("close", () => { if (wrec && wrec.r) wrec.r.stop(); audio.releaseMic(); if ($("dlgWords").open) renderWords(); });

/* --- nastavení --- */
function voiceNote() {
  const wv = settings.wordVoice, v = audio.csVoice;
  const dev = v ? "Hlas telefonu: " + v.name + "." : "Telefon nemá český hlas – použijí se nahrávky aplikace. Nastavení telefonu → Převod textu na řeč → Google → stáhnout češtinu.";
  $("voiceNote").textContent = wv === "robot" ? "Robotický hlas z nahrávek aplikace. Robot pak nemluví pokyny." :
    wv === "own" ? "Vaše namluvená slova, jinak nahrávky aplikace, jinak hlas telefonu. " + dev :
    wv === "recorded" ? "Vaše namluvená slova se nepoužijí. " + dev : dev;
  const own = audio.PHONES.filter(([k]) => audio.OWNP[k]).length;
  $("phoneNote").textContent = settings.phoneVoice === "own"
    ? (own ? `Používá se ${own} vašich hlásek, zbytek výchozí.` : "Zatím nemáte namluvené hlásky – používají se výchozí.")
    : "Výchozí nahrávky aplikace" + (own ? ` (vašich ${own} hlásek zůstává uloženo).` : ".");
}
export function openSet() {
  audio.pickVoice();
  $("wordVoice").value = settings.wordVoice; $("phoneVoice").value = settings.phoneVoice; $("gap").value = settings.gap;
  for (const k of ["assim", "lower", "vibrate"]) $(k).checked = settings[k];
  voiceNote(); $("dlgSet").showModal();
}
const sample = () => R.word || "PES";
$("wordVoice").onchange = e => { audio._resetTts(); settings.wordVoice = e.target.value; saveSettings(); voiceNote(); diag("hlas slov: " + settings.wordVoice); stopAll(); sayWord(sample()); };
$("phoneVoice").onchange = e => { settings.phoneVoice = e.target.value; saveSettings(); audio.applyPhoneVoice(); voiceNote(); diag("hlas hlásek: " + settings.phoneVoice); stopAll(); spellOut(sample()); };
$("gap").oninput = e => { settings.gap = +e.target.value; saveSettings(); };
for (const k of ["assim", "lower", "vibrate"]) $(k).onchange = e => { settings[k] = e.target.checked; saveSettings(); };

/* --- diagnostika --- */
/* Souhrn pro diagnostiku: kde dítě chybuje, s čím si slova a písmena plete, jak dlouho přemýšlí */
export function learningSummary() {
  const out = [], sec = ms => ms ? (ms / 1000).toFixed(1).replace(".", ",") + " s" : "–";
  for (const [g, G] of Object.entries(GAMES)) {
    const all = Object.entries(progress.words[g] || {});
    if (!all.length) { out.push(`${G.label}: zatím nehráno`); continue; }
    const c = coverage(g), tot = all.reduce((a, [, x]) => ({ ok: a.ok + x.ok, bad: a.bad + x.bad }), { ok: 0, bad: 0 });
    const ms = all.filter(([, x]) => x.ms).map(([, x]) => x.ms), avg = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0;
    out.push(`${G.label}: úroveň ${tierOf(g) + 1}/${G.tiers.length}, ${c.text}, odpovědi ✓${tot.ok} ✗${tot.bad} (${Math.round(100 * tot.ok / Math.max(1, tot.ok + tot.bad))} %), průměr ${sec(avg)}/slovo, kol ${(progress.played || {})[g] || 0}`);
    const hard = all.filter(([, x]) => x.bad).sort((a, b) => (b[1].bad / b[1].n) - (a[1].bad / a[1].n) || b[1].bad - a[1].bad).slice(0, 10);
    if (hard.length) out.push("  nejtěžší: " + hard.map(([w, x]) => `${w} ✓${x.ok}✗${x.bad}` + (x.wrong ? " (" + Object.entries(x.wrong).map(([k, v]) => k + (v > 1 ? "×" + v : "")).join(",") + ")" : "") + (x.last === 0 ? "!" : "")).join("; "));
    const slow = all.filter(([, x]) => x.ms > 6000).sort((a, b) => b[1].ms - a[1].ms).slice(0, 6);
    if (slow.length) out.push("  dlouho přemýšlí: " + slow.map(([w, x]) => `${w} ${sec(x.ms)}`).join(", "));
  }
  const conf = Object.entries(progress.conf || {}).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (conf.length) out.push("Záměny písmen (správně>vybralo): " + conf.map(([k, v]) => k.replace(/^(\w+):/, (m, g) => (g === "first" ? "1.h " : "skl ")) + "×" + v).join(", "));
  return out;
}
function renderDiag() {
  const c = audio.ctx;
  $("diagText").value = [
    "Hláskoun – diagnostika " + new Date().toLocaleString("cs-CZ"),
    "Prohlížeč: " + navigator.userAgent,
    "Režim: " + (matchMedia("(display-mode: standalone)").matches ? "aplikace na ploše" : "prohlížeč"),
    "Zvuk: " + (c ? c.state : "nespuštěn") + ", hlásek: " + Object.keys(audio.REC).length + "/" + audio.PHONES.length + " (mých " + Object.keys(audio.OWNP).length + ")",
    "Vlastní slova: " + audio.ownWords.size + (audio.ownWords.size ? " (" + [...audio.ownWords].slice(0, 30).join(", ") + ")" : ""),
    "Hlas slov: " + settings.wordVoice + ", hlásek: " + settings.phoneVoice + ", hlas telefonu: " + (audio.csVoice ? audio.csVoice.name : "žádný český"),
    "Service worker: " + (navigator.serviceWorker && navigator.serviceWorker.controller ? "aktivní" : "ne"),
    "Pokrok: " + JSON.stringify(progress.tier) + ", hvězd " + progress.stars + ", kol " + progress.rounds,
    "Obrazovka: " + current + (R.game ? ", hra " + R.game + ", slovo " + R.word : ""),
    "--- souhrn učení ---", ...learningSummary(),
    "--- záznam (✓/✗ slovo → co vybralo · čas · 🔊 opakování) ---", ...DIAG.slice(-150)].join("\n");
}
$("diagCopy").onclick = async () => {
  const t = $("diagText"); t.select();
  try { await navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand("copy"); }
  $("diagCopy").textContent = "✓ Zkopírováno"; setTimeout(() => $("diagCopy").textContent = "📋 Zkopírovat", 2000);
};
$("diagClear").onclick = () => { DIAG.length = 0; store.set("hl-diag", DIAG); renderDiag(); };

/* --- instalace na plochu (jen v koutku pro rodiče) --- */
export function installSteps(ios, inApp, ua) {
  if (inApp) return "Tento prohlížeč je uvnitř jiné aplikace a na plochu přidávat neumí. Otevřete odkaz v " + (ios ? "Safari" : "Chromu") +
    " (vpravo nahoře ⋯ nebo ⋮ → Otevřít v prohlížeči) a pak to zkuste znovu.";
  if (ios && /CriOS/.test(ua)) return "Chrome na iPhonu: ťukněte vpravo nahoře v adresním řádku na Sdílet ⬆︎ → sjeďte dolů → „Přidat na plochu“ → Přidat. (Potřebuje iOS 16.4 a novější; jinak použijte Safari.)";
  if (ios && /FxiOS|EdgiOS/.test(ua)) return "Na iPhonu otevřete stránku v Safari: Sdílet ⬆︎ → „Přidat na plochu“ → Přidat.";
  if (ios) return "Safari (iOS 26 a novější): vedle adresního řádku ťukněte na ⋯ → Sdílet ⬆︎ → sjeďte dolů → „Přidat na plochu“ → Přidat. Starší iOS: Sdílet ⬆︎ dole uprostřed → „Přidat na plochu“. Nevidíte ⋯ ani Sdílet? Stránka je otevřená v náhledu z WhatsAppu či Messengeru – ťukněte na ikonu Safari 🧭 a zkuste to tam.";
  return "V prohlížeči ťukněte na ⋮ (Samsung Internet ≡) a zvolte „Přidat na plochu“ / „Nainstalovat aplikaci“. Otevřeli jste odkaz z WhatsAppu? Nejdřív ⋮ → Otevřít v Chromu.";
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
(() => {
  if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) return;
  const ib = $("pInstall"), hint = $("installHint");
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // prohlížeč uvnitř jiné aplikace (Messenger, Facebook, Instagram, Gmail, Google…) nemá „Přidat na plochu“
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|GSA\/|Gmail|LinkedInApp|Snapchat|TikTok|MicroMessenger/i.test(ua);
  let deferred = null;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; ib.hidden = false; });
  addEventListener("appinstalled", () => { ib.hidden = true; hint.hidden = false; hint.textContent = "Hotovo, Hláskoun je na ploše."; });
  if (ios || inApp || /Android/.test(ua)) ib.hidden = false;
  ib.onclick = async () => {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r.outcome === "accepted") ib.hidden = true; return; }
    hint.hidden = false;
    hint.textContent = installSteps(ios, inApp, ua);
  };
})();

renderGames();

/* Pro testy (tests/s23.js) */
window.hl = { core, audio, R, GAMES, startGame, spell, letters, installSteps, learningSummary, applyTier, UNKNOWN_WORDS, fitScreen, picEl, needsAllCorrect, pictureOptions, openStats, coverage, tierPool, weight, chooseWords: g => chooseWords(g), ADVANCE_COVERAGE, openParent, openRec, openWordRec, openSet, renderDiag, tierOf, chooseWords, firstOk, show,
  get current() { return current; } };
