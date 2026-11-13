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

/* ---------- obrazovky (View Transitions, když je prohlížeč umí) ---------- */
let current = "home";
function show(id) {
  const go = () => { for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== id; current = id; };
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(go);
  else go();
}

/* ---------- hry ---------- */
const ALL_LETTERS = ["A","E","I","O","U","M","L","S","P","T","K","R","N","V","D","B","J","H","Z","Š","Ž","Č","Ř","C","CH","F"];
const LEVEL_OF = {}; for (const [l, ws] of Object.entries(LEVELS)) for (const w of ws) LEVEL_OF[w] = +l;
const PIC_WORDS = Object.keys(PICS);
const wordsOfLevels = lvs => Object.entries(LEVELS).filter(([l]) => lvs.includes(+l)).flatMap(([, ws]) => ws);

/* Slova pro „První hláska“: první psané písmeno musí znít stejně jako první hláska (ne „včela“ → f, „děti“ → ď) */
const firstOk = W => { const L = letters(W)[0]; return ALL_LETTERS.includes(L) && spell(W, true)[0].s === letterSound(L) && spell(W, false)[0].s === letterSound(L); };

export const GAMES = {
  listen: { icon: "👂", label: "Poslouchej", color: "blue",
    say: "Poslouchej robota a ťukni na správný obrázek.",
    tiers: [[1], [2], [3], [4, 5], [6, 7], [8, 9]], pool: lv => PIC_WORDS.filter(w => lv.includes(LEVEL_OF[w])) },
  first: { icon: "A", label: "První hláska", color: "orange",
    say: "Jakým písmenem začíná slovo?",
    tiers: [[1], [2], [3], [4], [5], [6], [7], [8], [9]], pool: lv => wordsOfLevels(lv).filter(firstOk) },
  build: { icon: "🧩", label: "Skládej", color: "green",
    say: "Poslouchej a slož slovo z písmenek.",
    tiers: [[1], [2], [3], [9], [4], [6], [5], [7], [8]], pool: lv => wordsOfLevels(lv) },
  read: { icon: "📖", label: "Čti", color: "purple",
    say: "Přečti slovo a ťukni na obrázek.",
    tiers: [[1], [2], [3], [4, 5], [6, 7], [8, 9]], pool: lv => PIC_WORDS.filter(w => lv.includes(LEVEL_OF[w])) },
};
const ROUND = 5;
const tierOf = g => Math.min(progress.tier[g] || 0, GAMES[g].tiers.length - 1);

function chooseWords(g) {
  const G = GAMES[g], recent = new Set(progress.last[g] || []);
  let t = tierOf(g), pool = [];
  while (pool.length < ROUND && t < G.tiers.length) { pool = [...new Set([...pool, ...G.pool(G.tiers[t])])]; t++; }
  const fresh = shuffle(pool.filter(w => !recent.has(w))), old = shuffle(pool.filter(w => recent.has(w)));
  const out = []; const seenPic = new Set();
  for (const w of [...fresh, ...old]) {
    if (out.length >= ROUND) break;
    if (PICS[w] && seenPic.has(PICS[w])) continue;
    out.push(w); if (PICS[w]) seenPic.add(PICS[w]);
  }
  return out;
}

/* Stav kola */
const R = { game: null, words: [], i: 0, results: [], mistakes: 0, busy: false, word: null, onAgain: null };

function renderGames() {
  $("games").replaceChildren(...Object.entries(GAMES).map(([id, G]) =>
    h("button", { class: "game " + G.color, "data-game": id, "aria-label": G.label, onclick: () => startGame(id) },
      h("span", { class: "game-icon" + (G.icon.length === 1 ? " letter" : ""), "aria-hidden": "true" }, G.icon),
      h("span", { class: "game-label" }, G.label),
      h("span", { class: "game-level", "aria-hidden": "true" }, "★".repeat(Math.min(tierOf(id) + 1, 6))))));
  $("starTotal").textContent = progress.stars;
}

let started = false;
async function unlock() {           // první dotyk: odemknout zvuk a načíst nahrávky
  if (started) return; started = true;
  await ensureAudio();
  await audio.loadRecs(); await audio.loadOwnWordList(); audio.pickVoice(); setTimeout(audio.pickVoice, 1500);
}

export async function startGame(g) {
  stopAll();
  await unlock();
  Object.assign(R, { game: g, words: chooseWords(g), i: 0, results: [], mistakes: 0 });
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
  if (R.i >= R.words.length) return finishRound();
  R.word = R.words[R.i]; R.mistakes = 0; R.busy = false;
  mood(); renderDots();
  ({ listen: gListen, first: gFirst, build: gBuild, read: gRead })[R.game](R.word, first);
}

async function correct(el) {
  if (R.busy) return; R.busy = true;
  el && el.classList.add("ok");
  stopAll(); mood("happy"); vibrate(30); burst(el);
  R.results.push(R.mistakes === 0); renderDots();
  await praise();
  await wait(500);
  R.i++; nextWord();
}
async function wrong(el, sayFn) {
  R.mistakes++;
  if (el) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("bad", "shake"); }
  mood("sad"); vibrate([60, 40, 60]);
  stopAll();
  if (sayFn) await sayFn();
  if (R.mistakes === 1 || R.mistakes % 3 === 0) await oops();
}

const picCard = (W, onclick) => h("button", { class: "pic", "data-word": W, "aria-label": W.toLowerCase(), onclick }, h("span", {}, PICS[W]));
function pictureOptions(W, n = 3) {
  const others = shuffle(PIC_WORDS.filter(w => w !== W && PICS[w] !== PICS[W]));
  // podobná slova (stejná délka nebo začátek) dělají hru zajímavější, ale ne příliš těžkou
  const similar = others.filter(w => letters(w).length === letters(W).length || w[0] === W[0]);
  const chosen = [...new Set([...similar.slice(0, 1), ...others])].filter((w, i, a) => a.findIndex(x => PICS[x] === PICS[w]) === i).slice(0, n - 1);
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
  R.onAgain = go;
  $("answers").replaceChildren(h("div", { class: "pics" }, pictureOptions(W).map(w =>
    picCard(w, e => { if (R.busy) return; w === W ? correct(e.currentTarget) : wrong(e.currentTarget, () => sayWord(w)); }))),
    first ? hand() : null);
  setTimeout(go, 300);
}

/* 2) První hláska: obrázek + slovo, dítě vybere první písmeno */
function gFirst(W, first) {
  const L = letters(W)[0];
  const opts = shuffle([L, ...shuffle(ALL_LETTERS.filter(x => letterSound(x) !== letterSound(L))).slice(0, 2)]);
  const rest = letters(W).slice(1).map(x => h("span", { class: "ltr dim" }, cs(x)));
  const firstSlot = h("span", { class: "ltr slot" }, "?");
  $("prompt").replaceChildren(
    PICS[W] ? h("button", { class: "pic hero-pic", "aria-label": "Zopakovat slovo", onclick: () => sayWord(W) }, h("span", {}, PICS[W]))
            : h("button", { class: "speaker", "aria-label": "Zopakovat slovo", onclick: () => sayWord(W) }, "🔊"),
    h("div", { class: "word-row" }, firstSlot, rest));
  R.onAgain = () => sayWord(W);
  $("answers").replaceChildren(h("div", { class: "letters" }, opts.map(x =>
    h("button", { class: "letter-btn", "aria-label": "písmeno " + x, onclick: e => {
      const el = e.currentTarget; if (R.busy) return;
      if (x === L) { R.busy = true; el.classList.add("ok"); firstSlot.textContent = cs(x); firstSlot.classList.add("filled"); rest.forEach(r => r.classList.remove("dim")); sayPhone(letterSound(x)).then(() => { R.busy = false; correct(el); }); }
      else wrong(el, () => sayPhone(letterSound(x)));
    } }, cs(x)))), first ? hand() : null);
  setTimeout(() => sayWord(W), 300);
}

/* 3) Skládej: slovo zazní (a je obrázek, pokud existuje), dítě skládá písmena; špatné písmeno se nepřijme */
function gBuild(W, first) {
  const L = letters(W);
  const extra = shuffle(ALL_LETTERS.filter(x => !L.includes(x))).slice(0, L.length <= 4 ? 2 : 3);
  const bank = shuffle([...L.map((l, i) => ({ l, i })), ...extra.map((l, i) => ({ l, i: 100 + i }))]);
  const slots = L.map(() => h("span", { class: "ltr slot" }));
  let pos = 0, missHere = 0;
  $("prompt").replaceChildren(
    PICS[W] ? h("button", { class: "pic hero-pic small", "aria-label": "Zopakovat slovo", onclick: () => sayWord(W) }, h("span", {}, PICS[W]))
            : h("button", { class: "speaker", "aria-label": "Zopakovat slovo", onclick: () => sayWord(W) }, "🔊"),
    h("div", { class: "word-row" + (L.length > 6 ? " long" : "") }, slots));
  R.onAgain = () => sayWord(W);
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
      wrong(k, null);
      setTimeout(() => k.classList.remove("bad"), 600);
      if (missHere >= 2) keys.find(q => !q.disabled && bank[keys.indexOf(q)].l === L[pos])?.classList.add("hint");
    }
  } }, cs(b.l)));
  $("answers").replaceChildren(h("div", { class: "bank" }, keys), first ? hand() : null);
  setTimeout(() => sayWord(W), 300);
}

/* 4) Čti: slovo napsané, dítě ťukne na obrázek; 🔊 přečte slovo (pomoc) */
function gRead(W, first) {
  $("prompt").replaceChildren(h("div", { class: "read-word" + (W.length > 6 ? " long" : "") }, cs(W)));
  R.onAgain = () => { R.mistakes++; sayWord(W); };
  $("answers").replaceChildren(h("div", { class: "pics" }, pictureOptions(W).map(w =>
    picCard(w, e => { const el = e.currentTarget; if (R.busy) return;
      if (w === W) { R.busy = true; el.classList.add("ok"); sayWord(W).then(() => { R.busy = false; correct(el); }); }
      else wrong(el, () => sayWord(w)); }))),
    first ? hand() : null);
}

async function finishRound() {
  const gold = R.results.filter(Boolean).length;
  progress.stars += gold; progress.rounds++; core.addToday(1);
  progress.played = { ...(progress.played || {}), [R.game]: ((progress.played || {})[R.game] || 0) + 1 };
  const g = R.game, t = tierOf(g);
  if (gold >= ROUND && t < GAMES[g].tiers.length - 1) progress.tier[g] = t + 1;
  else if (gold <= 2 && t > 0) progress.tier[g] = t - 1;
  progress.last[g] = [...R.words, ...(progress.last[g] || [])].slice(0, 15);
  saveProgress();
  diag(`kolo ${g}: ${gold}/${ROUND}, úroveň ${t}→${tierOf(g)}`);
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
$("homeBtn").onclick = () => { stopAll(); renderGames(); show("home"); };
$("againBtn").onclick = () => { stopAll(); R.onAgain && R.onAgain(); };
$("playAgain").onclick = () => startGame(R.game);
$("goHome").onclick = () => { renderGames(); show("home"); };
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

/* Pozdrav robota při prvním dotyku na úvodní obrazovce */
$("robotHome").addEventListener("click", async () => { await unlock(); sayText("Ahoj! Vyber si hru."); });

/* ---------- koutek pro rodiče: podržet ⚙️ 1,5 s ---------- */
(() => {
  const btn = $("parentBtn"); let t = null;
  const cancel = () => { clearTimeout(t); t = null; btn.classList.remove("holding"); };
  btn.addEventListener("pointerdown", e => { e.preventDefault(); btn.classList.add("holding"); t = setTimeout(() => { cancel(); openParent(); }, 1500); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => btn.addEventListener(ev, () => {
    if (t) { cancel(); $("parentHint").hidden = false; setTimeout(() => $("parentHint").hidden = true, 2500); }
  }));
  btn.addEventListener("contextmenu", e => e.preventDefault());
  btn.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") openParent(); });
})();
export async function openParent() {
  stopAll(); await unlock();
  renderProgress(); $("dlgParent").showModal();
}
function renderProgress() {
  $("progressList").replaceChildren(
    h("p", { class: "note" }, `Hvězdiček celkem: ${progress.stars} · odehraných kol: ${progress.rounds} · dnes: ${core.todayCount()}`),
    ...Object.entries(GAMES).map(([id, G]) => h("div", { class: "prog-row" },
      h("span", { class: "prog-name" }, G.label),
      h("button", { class: "mini", "aria-label": G.label + " lehčí", onclick: () => { progress.tier[id] = Math.max(0, tierOf(id) - 1); saveProgress(); renderProgress(); renderGames(); } }, "−"),
      h("span", { class: "prog-tier" }, `úroveň ${tierOf(id) + 1}/${G.tiers.length}`),
      h("button", { class: "mini", "aria-label": G.label + " těžší", onclick: () => { progress.tier[id] = Math.min(G.tiers.length - 1, tierOf(id) + 1); saveProgress(); renderProgress(); renderGames(); } }, "+"))));
}
$("pRec").onclick = openRec;
$("pWords").onclick = () => { renderWords(); $("dlgWords").showModal(); };
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
export function openRec() { recMsg(""); renderRec(); $("dlgRec").showModal(); }
$("recTest").onclick = () => spellOut(R.word || "NOS");
$("dlgRec").addEventListener("close", () => { if (activeRec) activeRec.r.stop(); activeRec = null; audio.releaseMic(); });

/* --- namlouvání slov --- */
let wordsLevel = 1;
function renderWords() {
  $("lvChips").replaceChildren(...Object.keys(LEVELS).map(l => h("button", { class: "lv", "aria-pressed": String(+l === wordsLevel), onclick: () => { wordsLevel = +l; renderWords(); } }, l)));
  $("wordGrid").replaceChildren(...LEVELS[wordsLevel].map(w => h("button", {
    class: "gw" + (audio.ownWords.has(w) ? " own" : ""), "data-word": w, onclick: () => openWordRec(w) },
    PICS[w] ? PICS[w] + " " : "", cs(w))));
}
let wrec = null;
const wrecMsg = t => { $("wrecMsg").textContent = t; };
function renderWordRec() {
  const W = wrec.W, has = audio.ownWords.has(W);
  $("wrecWord").textContent = (PICS[W] ? PICS[W] + " " : "") + cs(W);
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
$("wordVoice").onchange = e => { settings.wordVoice = e.target.value; saveSettings(); voiceNote(); diag("hlas slov: " + settings.wordVoice); stopAll(); sayWord(sample()); };
$("phoneVoice").onchange = e => { settings.phoneVoice = e.target.value; saveSettings(); audio.applyPhoneVoice(); voiceNote(); diag("hlas hlásek: " + settings.phoneVoice); stopAll(); spellOut(sample()); };
$("gap").oninput = e => { settings.gap = +e.target.value; saveSettings(); };
for (const k of ["assim", "lower", "vibrate"]) $(k).onchange = e => { settings[k] = e.target.checked; saveSettings(); };

/* --- diagnostika --- */
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
    "--- záznam ---", ...DIAG.slice(-60)].join("\n");
}
$("diagCopy").onclick = async () => {
  const t = $("diagText"); t.select();
  try { await navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand("copy"); }
  $("diagCopy").textContent = "✓ Zkopírováno"; setTimeout(() => $("diagCopy").textContent = "📋 Zkopírovat", 2000);
};
$("diagClear").onclick = () => { DIAG.length = 0; store.set("hl-diag", DIAG); renderDiag(); };

/* --- instalace na plochu (jen v koutku pro rodiče) --- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
(() => {
  if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) return;
  const ib = $("pInstall"), hint = $("installHint");
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  let deferred = null;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; ib.hidden = false; });
  addEventListener("appinstalled", () => { ib.hidden = true; hint.hidden = false; hint.textContent = "Hotovo, Hláskoun je na ploše."; });
  if (ios || /Android/.test(navigator.userAgent)) ib.hidden = false;
  ib.onclick = async () => {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r.outcome === "accepted") ib.hidden = true; return; }
    hint.hidden = false;
    hint.textContent = ios ? "Ťukněte na Sdílet ⬆︎ a zvolte „Přidat na plochu“." : "V prohlížeči ťukněte na ⋮ (Samsung Internet ≡) a zvolte „Přidat na plochu“ / „Nainstalovat aplikaci“.";
  };
})();

renderGames();

/* Pro testy (tests/s23.js) */
window.hl = { core, audio, R, GAMES, startGame, openParent, openRec, openWordRec, openSet, renderDiag, tierOf, chooseWords, firstOk, show,
  get current() { return current; } };
