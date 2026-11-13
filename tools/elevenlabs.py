#!/usr/bin/env python3
"""Vygeneruje nahrávky hlasem z ElevenLabs do audio/voices/<jméno>/ (words, phones, phrases).

Klíč se čte jen z proměnné prostředí ELEVENLABS_API_KEY (nikdy ho neukládat do repozitáře).

  python3 tools/elevenlabs.py --voice-id <ID> --name hanka --only sample   # hlásky + pár slov na zkoušku
  python3 tools/elevenlabs.py --voice-id <ID> --name hanka --only all      # vše (přeskočí hotové soubory)
  python3 tools/elevenlabs.py --models                                     # vypíše dostupné modely

Výstup: Ogg Opus mono (jako ostatní nahrávky), soubor audio/voices/<jméno>/manifest.json se seznamem klíčů.
"""
import argparse, json, os, re, subprocess, sys, time, unicodedata, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.elevenlabs.io/v1"

# Texty pro samotné hlásky: jen jedno písmeno (uživatel nechce protahované „sss“). Výsledek je nutné poslechnout.
PHONES = {k: k for k in ["a", "á", "e", "é", "i", "í", "o", "ó", "u", "ú", "m", "n", "ň", "l", "r", "ř", "s", "z",
                          "š", "ž", "c", "č", "j", "v", "f", "h", "ch", "p", "b", "t", "d", "ť", "ď", "k", "g"]}
# Věty, které aplikace říká (klíč = název souboru v phrases/)
PHRASES = {
    "ok_spravne": "Správně!", "ok_vyborne": "Výborně!", "ok_super": "Super!", "ok_bravo": "Bravo!",
    "ok_skvele": "Skvělé!", "ok_to_je_ono": "To je ono!", "ok_parada": "Paráda!", "ok_sikula": "Šikula!",
    "no_znovu": "Zkus to znovu.", "no_jeste_jednou": "Ještě jednou.",
    "g_listen": "Poslouchej robota a ťukni na správný obrázek.",
    "g_first": "Jakým písmenem začíná slovo?",
    "g_build": "Poslouchej a slož slovo z písmenek.",
    "g_read": "Přečti slovo a ťukni na obrázek.",
    "hello": "Ahoj! Vyber si hru.",
    "done_great": "Hurá! Výborně!", "done_ok": "Hotovo! Jen tak dál!",
}
SAMPLE_WORDS = ["PES", "BÝK", "ŽÁBA", "KŮŇ", "ČEPICE", "VČELA"]


def words():
    src = open(os.path.join(ROOT, "js/data.js"), encoding="utf-8").read()
    levels = json.loads(re.search(r"const LEVELS = (\{.*?\});", src).group(1))
    return [w for ws in levels.values() for w in ws]


def req(path, body=None, accept="application/json"):
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit("Chybí proměnná ELEVENLABS_API_KEY (nastavení prostředí, nová relace).")
    r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None,
                               headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": accept})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(r, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 4:
                time.sleep(2 * (attempt + 1)); continue
            sys.exit(f"ElevenLabs {e.code}: {e.read()[:300]!r}")


def tts(text, voice, model, stability, similarity, speed):
    return req(f"/text-to-speech/{voice}?output_format=mp3_44100_128", {
        "text": text, "model_id": model, "language_code": "cs",
        "voice_settings": {"stability": stability, "similarity_boost": similarity, "speed": speed},
    }, accept="audio/mpeg")


def to_ogg(mp3, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    # ořez ticha na začátku a konci, mono, Opus 32 kb/s (stejně jako ostatní nahrávky)
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "pipe:0", "-af",
                        "silenceremove=start_periods=1:start_threshold=-55dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse",
                        "-ac", "1", "-c:a", "libopus", "-b:a", "32k", out], input=mp3)
    if p.returncode: sys.exit("ffmpeg selhal: " + out)


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--voice-id"); a.add_argument("--name", default="hanka")
    a.add_argument("--out", help="jiná výstupní složka (např. pro zkušební varianty mimo repozitář)")
    a.add_argument("--only", choices=["sample", "phones", "phrases", "words", "all"], default="sample")
    a.add_argument("--model", default="eleven_multilingual_v2")
    a.add_argument("--stability", type=float, default=0.5); a.add_argument("--similarity", type=float, default=0.75)
    a.add_argument("--speed", type=float, default=0.9)
    a.add_argument("--force", action="store_true", help="přegenerovat i hotové soubory")
    a.add_argument("--models", action="store_true")
    o = a.parse_args()
    if o.models:
        for m in json.loads(req("/models")):
            print(m["model_id"], "-", m.get("name"), "| cs" if any(l.get("language_id") == "cs" for l in m.get("languages", [])) else "")
        return
    if not o.voice_id: sys.exit("Chybí --voice-id")
    base = o.out or os.path.join(ROOT, "audio/voices", o.name)
    jobs = []
    if o.only in ("sample", "phones", "all"): jobs += [("phones", k, t) for k, t in PHONES.items()]
    if o.only in ("sample",): jobs += [("words", w, w.lower()) for w in SAMPLE_WORDS] + [("phrases", "ok_spravne", PHRASES["ok_spravne"])]
    if o.only in ("phrases", "all"): jobs += [("phrases", k, t) for k, t in PHRASES.items()]
    if o.only in ("words", "all"): jobs += [("words", w, w.lower()) for w in words()]
    chars = 0
    for i, (kind, key, text) in enumerate(jobs, 1):
        out = os.path.join(base, kind, unicodedata.normalize("NFC", key) + ".ogg")
        if os.path.exists(out) and not o.force: continue
        to_ogg(tts(text, o.voice_id, o.model, o.stability, o.similarity, o.speed), out)
        chars += len(text)
        print(f"[{i}/{len(jobs)}] {kind}/{key}", flush=True)
    # manifest: co v hlasu existuje
    man = {k: sorted(f[:-4] for f in os.listdir(os.path.join(base, k))) if os.path.isdir(os.path.join(base, k)) else []
           for k in ("words", "phones", "phrases")}
    man.update(name=o.name, voice_id=o.voice_id, model=o.model)
    json.dump(man, open(os.path.join(base, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Hotovo. Spotřebováno asi {chars} znaků. Manifest: {sum(len(man[k]) for k in ('words','phones','phrases'))} nahrávek.")


if __name__ == "__main__":
    main()
