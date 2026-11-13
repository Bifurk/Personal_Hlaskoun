// Hláskování podle výslovnosti (spodoba znělosti, ďťň před i/í/ě, bě/pě/vě/fě → bje…, mě → mňe).

const HARD = new Set(["KAPITÁN", "NIKL"]);
const SOFTEN = { d: "ď", t: "ť", n: "ň" };
const VOICED = { b: "p", d: "t", "ď": "ť", g: "k", v: "f", z: "s", "ž": "š", h: "ch" };
const VOICELESS = { p: "b", t: "d", "ť": "ď", k: "g", s: "z", "š": "ž", ch: "h" };   // f→v záměrně ne
export const SOUND = { y: "i", "ý": "í", "ů": "ú", "ě": "e" };

/** Vrátí hlásky slova: [{d: zobrazená hláska, s: klíč nahrávky}] */
export function spell(W, assim = true) {
  const w = W.toLowerCase(), out = [];
  for (let i = 0; i < w.length; i++) {
    const c = w[i], n = w[i + 1];
    if (c === "c" && n === "h") { out.push("ch"); i++; continue; }
    if (SOFTEN[c] && !HARD.has(W) && (n === "ě" || n === "i" || n === "í")) { out.push(SOFTEN[c]); if (n === "ě") { out.push("e"); i++; } continue; }
    if ("bpvf".includes(c) && n === "ě") { out.push(c, "j", "e"); i++; continue; }
    if (c === "m" && n === "ě") { out.push("m", "ň", "e"); i++; continue; }
    out.push(c);
  }
  if (assim) {
    let next = "voiceless"; // konec slova se chová jako neznělá
    for (let i = out.length - 1; i >= 0; i--) {
      let t = out[i];
      if ((t in VOICED) && next === "voiceless") t = out[i] = VOICED[t];
      else if ((t in VOICELESS) && next === "voiced") t = out[i] = VOICELESS[t];
      if (t in VOICED) next = (t === "v") ? "son" : "voiced";
      else if (t in VOICELESS || t === "f" || t === "c" || t === "č") next = "voiceless";
      else next = "son";
    }
  }
  return out.map(d => ({ d, s: SOUND[d] || d }));
}

/** Psaná písmena slova, CH jako jedno písmeno */
export function letters(W) {
  const r = [];
  for (let i = 0; i < W.length; i++) { if (W[i] === "C" && W[i + 1] === "H") { r.push("CH"); i++; } else r.push(W[i]); }
  return r;
}

/** Klíč nahrávky hlásky pro psané písmeno (Y → i, Ů → ú, Ě → e) */
export const letterSound = L => { const l = L.toLowerCase(); return SOUND[l] || l; };
