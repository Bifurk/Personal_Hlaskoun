// Zvuk: nahrávky aplikace, moje nahrávky (hlásky, slova), hlas telefonu (TTS) a mikrofon.
import { settings, diag, wait } from "./core.js";
import { spell } from "./phonetics.js";

/* Android (Samsung) uspí AudioContext po použití mikrofonu, při odchodu na pozadí nebo hovoru.
   Uspaný kontext nikdy nezavolá onended → aplikace by zamrzla. Proto jde VEŠKERÉ přehrávání
   přes playBuf(): ten kontext probudí (případně vytvoří nový) a vždy skončí nejpozději po délce
   nahrávky. AudioBuffer jde přehrát v libovolném kontextu. Kontroluje to tests/s23.js. */
const AC = window.AudioContext || window.webkitAudioContext;
export let ctx = null;
/** Háčky pro testy: hooks.playBuf(b) a hooks.tts(text) se volají při každém přehrání */
export const hooks = { playBuf: null, tts: null };
const withTimeout = (pr, ms) => Promise.race([pr, new Promise(r => setTimeout(r, ms))]);

export async function ensureAudio() {
  if (!ctx || ctx.state === "closed") { ctx = new AC(); diag("audio: nový AudioContext"); }
  if (ctx.state !== "running") {
    const was = ctx.state;
    try { await withTimeout(ctx.resume(), 800); } catch (e) {}
    if (ctx.state !== "running") {
      diag("audio: kontext zůstal " + ctx.state + " (byl " + was + "), vytvářím nový");
      try { ctx.close(); } catch (e) {}
      ctx = new AC();
      try { await withTimeout(ctx.resume(), 800); } catch (e) {}
    } else diag("audio: probuzen z " + was);
  }
  return ctx.state === "running";
}
/** Testy: uspat / zavřít kontext jako Android */
export const _suspend = () => ctx && ctx.suspend();
export const _close = () => ctx && ctx.close();

let talkers = 0;
export let onTalk = () => {};
export const setOnTalk = f => { onTalk = f; };
function talk(on) { talkers = Math.max(0, talkers + (on ? 1 : -1)); onTalk(talkers > 0); }

export function playBuf(b) {
  if (hooks.playBuf) hooks.playBuf(b);
  return new Promise(async res => {
    let done = false; const fin = () => { if (done) return; done = true; talk(false); res(); };
    talk(true);
    try {
      await ensureAudio();
      const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination);
      s.onended = fin; s.start();
    } catch (e) { diag("audio: přehrání selhalo – " + e.message); }
    setTimeout(fin, b.duration * 1000 + 400);   // pojistka: nikdy nečekat déle než nahrávka
  });
}

/* ---------- nahrávky aplikace (audio/…) ---------- */
const AUDIO_DIRS = { w: "words", p: "phones", x: "phrases" };
const audioUrl = key => `audio/${AUDIO_DIRS[key[0]]}/${encodeURIComponent(key.slice(2))}.ogg`;
export const buf = {};
export async function fetchAudio(key) {
  const r = await fetch(audioUrl(key));
  if (!r.ok) throw new Error("audio " + key + " " + r.status);
  await ensureAudio();
  return ctx.decodeAudioData(await r.arrayBuffer());
}
const loading = {};   // běžící stahování – stejná nahrávka se nestahuje dvakrát
export async function load(key) {
  if (buf[key]) return buf[key];
  if (!AUDIO_KEYS.has(key)) return null;
  if (!loading[key]) loading[key] = fetchAudio(key).then(b => (buf[key] = b), () => null).finally(() => delete loading[key]);
  return loading[key];
}

/* ---------- hlas telefonu ---------- */
export let csVoice = null;
export function pickVoice() {
  const v = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  csVoice = v.find(x => /^cs/i.test(x.lang) && /google/i.test(x.name)) || v.find(x => /^cs/i.test(x.lang)) || null;
}
export const _setVoice = v => { csVoice = v; };   // testy
if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
export function ttsSay(text, rate = 0.85) {
  if (hooks.tts) { hooks.tts(text); return Promise.resolve(); }
  return new Promise(res => {
    let done = false; const fin = () => { if (done) return; done = true; talk(false); res(); };
    try {
      const u = new SpeechSynthesisUtterance(text); u.lang = "cs-CZ"; try { u.voice = csVoice; } catch (e) {} u.rate = rate;
      u.onend = fin; u.onerror = fin;
      speechSynthesis.cancel(); talk(true); speechSynthesis.speak(u);
    } catch (e) { fin(); }
    setTimeout(fin, 1500 + text.length * 120);
  });
}
const canTts = () => settings.wordVoice !== "robot" && csVoice;

/* ---------- moje nahrávky (IndexedDB „hlaskoun“ / „rec“: hlásky pod klíčem „a“, „ch“…, slova pod „w:SLOVO“) ---------- */
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open("hlaskoun", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("rec"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
export async function dbOp(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction("rec", mode); const r = fn(tx.objectStore("rec")); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); });
}
function trim(b, rel = 0.08, padS = 0.03) {
  const d = b.getChannelData(0); let peak = 0; for (const x of d) peak = Math.max(peak, Math.abs(x));
  if (peak < 0.01) return null;
  const th = peak * rel; let s = 0, e = d.length - 1; while (s < e && Math.abs(d[s]) < th) s++; while (e > s && Math.abs(d[e]) < th) e--;
  const pad = Math.floor(b.sampleRate * padS); s = Math.max(0, s - pad); e = Math.min(d.length, e + pad);
  const out = ctx.createBuffer(1, e - s, b.sampleRate), o = out.getChannelData(0), g = 0.9 / peak;
  for (let i = 0; i < e - s; i++) o[i] = d[s + i] * g;
  const f = Math.min(200, o.length); for (let i = 0; i < f; i++) { o[i] *= i / f; o[o.length - 1 - i] *= i / f; }
  return out;
}
export async function decodeRec(blob, word = false) {
  await ensureAudio();
  const b = await ctx.decodeAudioData(await blob.arrayBuffer());
  return word ? trim(b, 0.03, 0.08) : trim(b);
}

export const PHONES = [["a","máma"],["á","káva"],["e","pes"],["é","mléko"],["i","ryba"],["í","síla"],["o","oko"],["ó","gól"],["u","ucho"],["ú","úl"],
  ["m","máma"],["n","nos"],["ň","kůň"],["l","les"],["r","ruka"],["ř","řeka"],["s","sova"],["z","zima"],["š","šála"],["ž","žába"],
  ["c","cukr"],["č","čáp"],["j","jahoda"],["v","voda"],["f","fén"],["h","had"],["ch","chata"],
  ["p","pes"],["b","bota"],["t","táta"],["d","dům"],["ť","ťuk"],["ď","ďábel"],["k","kos"],["g","gól"]];
/** REC = hlásky, které se právě používají; OWNP = moje; DEFP = výchozí nahrávky aplikace */
export const REC = {}, OWNP = {}, DEFP = {};
export function applyPhoneVoice() {
  for (const k of Object.keys(REC)) delete REC[k];
  Object.assign(REC, DEFP, settings.phoneVoice === "own" ? OWNP : {});
}
export async function loadRecs() {
  try { for (const [k] of PHONES) { const blob = await dbOp("readonly", s => s.get(k)); if (blob) { const b = await decodeRec(blob); if (b) OWNP[k] = b; } } }
  catch (e) { diag("načtení mých hlásek: " + e.message); }
  await Promise.all(PHONES.filter(([k]) => AUDIO_KEYS.has("p_" + k))
    .map(async ([k]) => { try { DEFP[k] = await fetchAudio("p_" + k); } catch (e) {} }));
  applyPhoneVoice();
}
export async function savePhone(k, blob) {
  const b = await decodeRec(blob); if (!b) return null;
  await dbOp("readwrite", st => st.put(blob, k)); OWNP[k] = b; applyPhoneVoice(); return b;
}

export const ownWords = new Set(), WREC = {};
export async function loadOwnWordList() {
  try {
    const keys = await dbOp("readonly", s => s.getAllKeys()); ownWords.clear();
    for (const k of keys || []) if (typeof k === "string" && k.startsWith("w:")) ownWords.add(k.slice(2));
  } catch (e) { diag("seznam vlastních slov: " + e.message); }
}
async function loadOwnWord(W) {
  if (WREC[W]) return WREC[W];
  try { const blob = await dbOp("readonly", s => s.get("w:" + W)); if (!blob) return null; WREC[W] = await decodeRec(blob, true); return WREC[W]; }
  catch (e) { diag("vlastní slovo " + W + ": " + e.message); return null; }
}
export async function saveWord(W, blob) {
  const b = await decodeRec(blob, true); if (!b) return null;
  await dbOp("readwrite", st => st.put(blob, "w:" + W)); ownWords.add(W); WREC[W] = b; return b;
}
export async function deleteWord(W) {
  try { await dbOp("readwrite", st => st.delete("w:" + W)); } catch (e) { diag("mazání slova " + W + ": " + e.message); }
  ownWords.delete(W); delete WREC[W];
}

/* ---------- přehrávání ---------- */
let token = 0;                         // zvýšení zruší běžící hláskování
export const stopAll = () => { token++; try { speechSynthesis.cancel(); } catch (e) {} };

/** Celé slovo podle nastavení hlasu */
export async function sayWord(W) {
  try {
    const wv = settings.wordVoice, key = "w_" + W;
    if (wv === "own" && ownWords.has(W)) { const b = await loadOwnWord(W); if (b) return playBuf(b); }
    if ((wv === "own" || wv === "recorded") && OWNV.has(key)) { const b = await load(key); if (b) return playBuf(b); }
    if (canTts()) return ttsSay(W.toLowerCase());
    const b = await load(key); if (b) return playBuf(b);
  } catch (e) { diag("slovo " + W + ": " + e.message); }
}
/** Jedna hláska (klíč nahrávky: „a“, „ch“…) */
export async function sayPhone(k) { const b = REC[k]; if (b) return playBuf(b); }
/** Pokyn nebo pochvala hlasem telefonu (bez českého hlasu se nic neřekne – hry mají i obrazovou nápovědu) */
export async function sayText(t) { if (csVoice && settings.wordVoice !== "robot") return ttsSay(t, 0.95); }

export async function spellOut(W, onStep) {
  const my = ++token, ph = spell(W, settings.assim);
  for (let i = 0; i < ph.length; i++) {
    if (my !== token) return false;
    onStep && onStep(i);
    if (REC[ph[i].s]) { await sayPhone(ph[i].s); await wait(settings.gap); }
    else await wait(settings.gap + 500);
  }
  onStep && onStep(-1);
  return my === token;
}

/* Pochvaly a „zkus to znovu“ mluví stejným hlasem jako celá slova:
   „Vždy hlas telefonu“ → hlas telefonu (víc různých vět), jinak nahrávky aplikace (bez nich hlas telefonu). */
const PRAISE_TTS = ["Správně!", "Výborně!", "Super!", "Bravo!", "Skvělé!", "To je ono!", "Paráda!", "Šikula!"];
const OOPS_TTS = ["Zkus to znovu.", "Ještě jednou.", "Zkus to ještě jednou."];
const PHR = { ok1: "Správně!", ok2: "Výborně!", ok3: "Super!", no: "Zkus to znovu." };
let lastPraise = "";
async function phrase(k, ttsChoices) {
  if (!settings.sound) return;
  if (settings.wordVoice === "device" && csVoice) {
    let t; do { t = ttsChoices[Math.floor(Math.random() * ttsChoices.length)]; } while (t === lastPraise && ttsChoices.length > 1);
    lastPraise = t; return ttsSay(t, 0.95);
  }
  const b = await load("x_" + k); if (b) return playBuf(b);
  if (canTts()) return ttsSay(PHR[k], 0.95);
}
export const praise = () => phrase("ok" + (1 + Math.floor(Math.random() * 3)), PRAISE_TTS);
export const oops = () => phrase("no", OOPS_TTS);

/* ---------- mikrofon ---------- */
let stream = null;
export async function getMic() {
  if (stream) return stream;
  if (!navigator.mediaDevices || !window.MediaRecorder) throw Object.assign(new Error("Tento prohlížeč neumí nahrávat."), { name: "NotSupported" });
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  return stream;
}
export function releaseMic() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } return ensureAudio(); }
/** Nahraje klip; vrátí {stop(), done: Promise<Blob>} */
export async function record(maxMs) {
  await ensureAudio();
  const s = await getMic(), chunks = [], mr = new MediaRecorder(s);
  mr.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  const done = new Promise(res => { mr.onstop = () => res(new Blob(chunks, { type: mr.mimeType || "audio/webm" })); });
  mr.start();
  const stop = () => { clearTimeout(t); if (mr.state === "recording") setTimeout(() => mr.stop(), 150); };
  const t = setTimeout(stop, maxMs);
  return { stop, done };
}
export const micError = err => err && (err.name === "NotAllowedError" || err.name === "SecurityError")
  ? "Mikrofon je zablokovaný. V Chromu ťukněte na ikonu vlevo od adresy → Oprávnění → Mikrofon → Povolit."
  : (err && err.name === "NotSupported") ? err.message : "Mikrofon se nepodařilo spustit (" + ((err && (err.name || err.message)) || "chyba") + ").";

/* probudit zvuk po návratu do aplikace a při dotyku (Android vyžaduje gesto) */
/* Odchod z aplikace (jiná aplikace, zamčení): okamžitě ztišit – robot nesmí mluvit na pozadí */
export function silence() {
  stopAll();
  if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});   // utne i právě hrající nahrávku; po návratu ensureAudio() probudí
}
document.addEventListener("visibilitychange", () => { if (document.hidden) silence(); else if (ctx) ensureAudio(); });
addEventListener("pagehide", silence);
addEventListener("pageshow", () => { if (ctx) ensureAudio(); });
document.addEventListener("pointerdown", () => { if (ctx && ctx.state !== "running") ensureAudio(); }, { capture: true });
