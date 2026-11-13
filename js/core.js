// Úložiště, nastavení, pokrok a záznam pro diagnostiku.

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------- diagnostika (Rodiče → Diagnostika) ---------- */
export const DIAG = store.get("hl-diag", []);
export function diag(msg) {
  DIAG.push(new Date().toTimeString().slice(0, 8) + " " + msg);
  if (DIAG.length > 200) DIAG.splice(0, DIAG.length - 200);
  store.set("hl-diag", DIAG);
}
addEventListener("error", e => diag("CHYBA: " + e.message + " @" + (e.filename || "").split("/").pop() + ":" + e.lineno));
addEventListener("unhandledrejection", e => diag("CHYBA (promise): " + ((e.reason && (e.reason.message || e.reason.name)) || e.reason)));

/* ---------- nastavení ----------
   wordVoice (hlas pro celá slova):
     own      – moje nahrávka → nahrávka aplikace → hlas telefonu
     recorded – nahrávka aplikace → hlas telefonu (moje nahrávky se nepoužijí)
     device   – vždy hlas telefonu (Google/Samsung); bez českého hlasu nahrávky aplikace
     robot    – vždy nahrávky aplikace
   phoneVoice (hlásky): own – moje nahrávky, kde jsou, jinak výchozí; default – jen výchozí */
export const settings = Object.assign(
  { gap: 450, assim: true, lower: false, wordVoice: "own", phoneVoice: "own", sound: true, vibrate: true },
  store.get("hl-settings", {}));
if (settings.voice) { // starší verze: voice: "device" | "robot"
  if (settings.voice === "robot" && !store.get("hl-settings", {}).wordVoice) settings.wordVoice = "robot";
  delete settings.voice;
}
delete settings.letters;
export const saveSettings = () => store.set("hl-settings", settings);

/* ---------- pokrok ----------
   tier: obtížnost každé hry, stars: hvězdy celkem, rounds: odehraná kola, last: poslední slova (aby se neopakovala) */
export const progress = Object.assign({ tier: {}, stars: 0, rounds: 0, today: {}, last: {} }, store.get("hl-progress2", {}));
export const saveProgress = () => store.set("hl-progress2", progress);
export function todayCount() { const d = new Date().toISOString().slice(0, 10); return progress.today[d] || 0; }
export function addToday(n) {
  const d = new Date().toISOString().slice(0, 10);
  progress.today = { [d]: (progress.today[d] || 0) + n };   // drží jen dnešek
}

export const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const wait = ms => new Promise(r => setTimeout(r, ms));
export const cs = s => settings.lower ? s.toLowerCase() : s.toUpperCase();
