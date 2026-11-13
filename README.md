# Robot Hláskoun

Webová aplikace pro děti 6–7 let, které se učí číst a psát. Dítě ji používá **samo**: robot říká pokyny nahlas, hry ukazují obrázky a samy poznají správnou odpověď.

## Hry

| | Hra | Co dítě dělá |
|---|---|---|
| 👂 | **Poslouchej** | Robot vyhláskuje slovo (p-e-s), dítě ťukne na správný obrázek. |
| A | **První hláska** | Uslyší slovo (a vidí obrázek), vybere písmeno, kterým začíná. |
| 🧩 | **Skládej** | Uslyší slovo, skládá ho z písmenek; špatné písmeno se nepřijme. |
| 📖 | **Čti** | Přečte slovo a ťukne na obrázek; 🔊 slovo přečte, když si neví rady. |

Každé kolo má 5 slov. Za slovo bez chyby je zlatá hvězda, s chybou stříbrná. Po kole bez chyby se hra posune na těžší úroveň, po slabém kole na lehčí. Slova jsou v 9 úrovních (od krátkých třípísmenných po shluky souhlásek), 141 z nich má obrázek (`js/pictures.js`).

## Pro rodiče

Podržte ⚙️ vpravo nahoře 1,5 s. Tam je:
- **Namluvit hlásky** – hláskování vlastním hlasem,
- **Namluvit slova** – slovo, které nezní dobře, namluvíte sami (má přednost, jde vrátit),
- **Nastavení** – hlas pro slova (moje nahrávky / nahrávky aplikace / vždy hlas telefonu / robot) a hlásky, tempo, výslovnost, malá písmena, vibrace,
- **Pokrok** – hvězdy, kola, úroveň každé hry (jde ručně změnit),
- **Diagnostika** – záznam pro řešení problémů,
- **Přidat na plochu**.

Nejlepší hlas telefonu: v Androidu *Převod textu na řeč → Google → stáhnout češtinu*. Robot jím říká i pokyny ke hrám.

Nahrávky, nastavení a pokrok se ukládají jen v tomto telefonu (IndexedDB, `localStorage`). Žádný server není potřeba.

## Struktura

```
index.html          obrazovky (domů, hra, oslava) a okna pro rodiče
css/style.css       vzhled (světlý i tmavý režim)
js/app.js           hry, obrazovky, koutek pro rodiče (ES modul)
js/audio.js         zvuk, hlas telefonu, nahrávání (odolné vůči uspání zvuku na Androidu)
js/core.js          nastavení, pokrok, diagnostika
js/phonetics.js     hláskování podle výslovnosti
js/data.js          slova podle úrovní, seznam nahrávek
js/pictures.js      slova → obrázky (emoji)
audio/              nahrávky slov, hlásek a pochval (Ogg Opus)
sw.js, manifest     instalace na plochu a běh bez internetu
tests/s23.js        test na emulovaném Samsungu Galaxy S23
```

## Spuštění a test

```bash
python3 -m http.server 8000
```

```bash
node tests/s23.js
```

Test projde všechny 4 hry (celá kola, správné i špatné odpovědi), odolnost zvuku, nahrávání, volbu hlasu, všechna okna a obrazovky na 4 velikostech displeje S23, v Chromu i Samsung Internetu. S adresou jako parametrem otestuje nasazenou verzi.

## Nasazení

GitHub Pages z větve `main` (Settings → Pages → `main` / root): https://bifurk.github.io/Personal_Hlaskoun/
