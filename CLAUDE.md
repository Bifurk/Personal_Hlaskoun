# Robot Hláskoun – pokyny pro Clauda

Statická webová aplikace (PWA) bez build kroku, nasazená přes GitHub Pages z větve `main`:
https://bifurk.github.io/Personal_Hlaskoun/

## Pro koho a jak

Aplikaci používá **dítě 6–7 let samo, bez dospělého**. Proto:
- žádné texty, které by dítě muselo číst (kromě slov ve hře „Čti“) – pokyny říká robot nahlas, zbytek ukazují obrázky/ikony,
- hry se vyhodnocují samy (správně/špatně), nic nepotvrzuje dospělý,
- velké dotykové plochy, okamžitá zpětná vazba (robot, zvuk, vibrace, hvězdy),
- vše pro dospělé je v koutku **Pro rodiče** (podržet ⚙️ 1,5 s): nahrávání hlásek a slov, nastavení hlasu, pokrok, diagnostika, instalace.

Struktura: `js/core.js` (nastavení, pokrok, diagnostika), `js/phonetics.js` (hláskování), `js/audio.js` (veškerý zvuk a nahrávání),
`js/app.js` (obrazovky, 4 hry, koutek pro rodiče; `window.hl` pro testy), `js/data.js` (slova), `js/pictures.js` (slova → emoji).

## Cílové zařízení: Samsung Galaxy S23

Uživatel aplikaci používá na **Samsungu Galaxy S23** (Android 14, Chrome a Samsung Internet).
Každou změnu je nutné otestovat na emulaci tohoto telefonu:

1. Před commitem: `node tests/s23.js` (spustí lokální server a otestuje pracovní kopii).
2. Po pushi do `main` a nasazení Pages (1–2 min): `node tests/s23.js https://bifurk.github.io/Personal_Hlaskoun/`.
3. Prohlédnout snímky v `tests/screenshots/` (hlavně u změn vzhledu) a výsledek uživateli shrnout.

Test musí skončit „Vše v pořádku“. Když nová funkce přidá něco ověřitelného (režim, tlačítko, dialog), doplnit kontrolu do `tests/s23.js`.
Jde o emulaci v Chromiu, ne o skutečný telefon – u věcí, které emulace neověří (mikrofon, hlas telefonu, skutečná instalace na plochu), to uživateli říct a požádat ho o vyzkoušení.

## Známé pasti na Androidu

- Android/Samsung **uspí AudioContext** po použití mikrofonu, při odchodu na pozadí nebo hovoru. Uspaný kontext nikdy nezavolá `onended` → aplikace zamrzne. Veškeré přehrávání proto jde přes `playBuf()`/`ensureAudio()` v `js/audio.js` (probuzení, případně nový kontext, pojistný timeout). Nikdy nepřehrávat zvuk mimo ně. `tests/s23.js` to kontroluje.
- **Okna (dialogy) a tlačítka se musí vejít** i na nižší obrazovku (Chrome s lištami) a na úzkou (Samsung „Zvětšení obrazovky“). Poslední řádek tlačítek v okně (`.dlg > .row:last-child`, Hotovo/Zavřít) je přilepený dole a musí být vidět bez posouvání. `tests/s23.js` to kontroluje pro každé okno na 360×780, 360×660, 360×600 a 320×640 a stejně tak obrazovky domů, všechny 4 hry (s nejdelšími slovy) a oslavu – nic se nesmí posouvat. **Nové okno = přidat ho do `DIALOGS` v testu** (jinak test selže na „audit zná všechna okna“).
- **Velikost písma v telefonu** (Android → Velikost písma) zvětší text: rozměry dlaždic/kláves/obrázků jsou proto v `em` a `fitScreen()` v `js/app.js` po vykreslení snižuje `--fit`, dokud se obrazovka nevejde a nic nepřetéká. Nové prvky se písmem dimenzovat v `em`/`calc(… * var(--fit))`, ne v px, a přidat do `OVERFLOW_SEL`. Test zkouší písmo 130 % a 150 % na 412×915 (Galaxy S21 FE), 360×780 a 360×660. Velikosti písma v CSS v `rem`, ne v px.
- **Nepoužívat `viewport-fit=cover`**: Chrome na Androidu pak kreslí aplikaci na ploše pod stavový řádek a navigační lištu (na S21 FE useknutá horní lišta i odpovědi dole). Emulace to neodhalí – test jen hlídá, že v meta viewport není.
- **Diagnostika učení** (`learningSummary()`, `recordWord()`): každá odpověď se zapíše (`✓/✗ hra SLOVO → co vybralo · čas · 🔊počet`), u slova se ukládá `wrong` (s čím si ho plete) a `ms` (čas do odpovědi), záměny písmen v `progress.conf`, opuštěná kola. Souhrn (nejtěžší slova, záměny, pomalá slova) je v Diagnostice nahoře – z něj navrhovat úpravy pro dítě. Slova, která dítě nezná, jsou v `UNKNOWN_WORDS` (mimo hry bez obrázku).
- Když uživatel hlásí problém z telefonu: požádat ho o text z **Pro rodiče (podržet ⚙️) → Diagnostika → Zkopírovat**.
- **Postup úrovní a výběr slov** (`js/app.js`): na vyšší úroveň jen po kole 5/5 bez chyby **a** po splnění pravidla hry: **Poslouchej a Čti – všechna slova úrovně naposledy určená správně** (`needsAllCorrect`), **První hláska a Skládej – ≥ 80 % slov úrovně hraných** (`ADVANCE_COVERAGE`); o úroveň níž až po **2 slabých kolech (≤ 2 hvězdy) za sebou** a nikdy v prvních 3 kolech po postupu (`applyTier`). Každé slovo má statistiku `progress.words[hra][SLOVO]` (n, ok, bad, last); výběr je vážený – naposledy chybná slova ×8, chybující ×5/×2,5, nehraná ×3, zvládnutá ×0,5. Rodič vidí přehled v okně „Pokrok po slovech“ (klepnutí na název hry v koutku pro rodiče). Testy to ověřují.
- Nové slovo s obrázkem: doplnit do `js/pictures.js` (emoji do verze 13, bez ZWJ), v jedné otázce (i v jednom kole) nikdy dva stejné ani podobné obrázky – podobné obrázky patří do stejné skupiny v `PIC_GROUPS` (`picsClash()`); nové slovo s obrázkem podobným jinému do skupiny přidat.
- Hry Poslouchej a Čti používají jen slova s obrázkem (242 slov; dalších 96 slov bylo přidáno do `LEVELS` jen kvůli obrázkům a **nemají nahrávku aplikace** – čte je hlas telefonu; `audio.canSay()` je bez hlasu telefonu vyřadí z her První hláska a Skládej). Při generování hlasu Hanka se nahrají i ona (skript bere `LEVELS`).

- **Vlastní obrázky:** slova bez vhodného emoji mají obrázek `img/pics/SLOVO.webp` (512 px, průhledné pozadí); v `PICS` hodnota `"img:SLOVO"`, vykresluje `picEl()`. Nové obrázky od uživatele převést `python3 -I tools/obrazky/prevod.py <složka PNG>` (odstraní šachovnici z „průhledného“ pozadí a kousky sousedních obrázků, vycentruje, 512 px WebP), zkontrolovat náhled na světlém i tmavém pozadí, přidat do `PICS` a podobné do `PIC_GROUPS`. Hotovo: 36 slov 1. úrovně (skupiny A + B z `tools/obrazky/uroven1.csv`).

## Poznámky

- Uživatel komunikuje česky; texty v aplikaci jsou česky.
- Při každé změně souborů aplikace zvýšit verzi `CACHE` v `sw.js` (a nové soubory přidat do `SHELL`), jinak telefon může držet starou verzi.
- Nahrávky: `audio/words/SLOVO.ogg` (velkými, s diakritikou, NFC), klíče v `AUDIO_KEYS` v `js/data.js`.

## Rozpracováno: hlas Hanka (ElevenLabs) pro celou aplikaci

Uživatel chce místo svého hlasu používat hlas **Hanka** z ElevenLabs pro **vše**: slova, hlásky, pochvaly i pokyny robota.
- API klíč je v nastavení prostředí jako `ELEVENLABS_API_KEY` (nikdy ho nevypisovat, neukládat do repozitáře ani neposílat jinam než na api.elevenlabs.io; repozitář je veřejný). Uživatel nechce klíč na GitHubu.
- Generování: `tools/elevenlabs.py` (výstup `audio/voices/hanka/{words,phones,phrases}/*.ogg` + `manifest.json`). ID hlasu dodá uživatel.
- Postup: 1) `--models` (ověřit klíč, vybrat model s češtinou), 2) `--only sample` → poslat uživateli hlásky a pár slov k poslechu (SendUserFile), hlavně jestli souhlásky znějí jako hláska („sss“, krátké „p“), ne jako název písmene („es“, „pé“); případně upravit texty v `PHONES`, 3) po schválení `--only all`.
- Pak v aplikaci: nová volba hlasu „Hanka“ jako výchozí pro slova, hlásky, pochvaly (`phrases/ok_*`, `no_*`) i pokyny her (`g_*`, `hello`, `done_*`) místo hlasu telefonu; vlastní nahrávky uživatele zachovat jako volitelné. Doplnit `SHELL`/cache, testy v `tests/s23.js` (odkud se co přehraje), otestovat na S23 lokálně i živě.
