# Robot Hláskoun

Webová aplikace pro děti, které se učí číst a psát: robot hláskuje slova hlasem rodiče a dítě skládá celé slovo. Cvičí se asi 5 minut denně.

## Režimy

- **Slož slovo**: robot slovo vyhláskuje, dítě ho řekne celé.
- **Najdi hlásku**: dítě pozná první, poslední nebo vnitřní hlásku slova.
- **Napiš**: robot řekne slovo, dítě ho složí z písmen.
- **Přečti**: dítě slovo přečte nahlas.

Slova jsou rozdělená do 9 úrovní, od krátkých třípísmenných po slova se shlukem souhlásek. Hláskování umí podle výslovnosti (spodoba znělosti, *věž → v-j-e-š*), a to lze vypnout v nastavení.

## Struktura

```
index.html        stránka
css/style.css     vzhled (světlý i tmavý režim)
js/data.js        slova podle úrovní, popisy úrovní, seznam nahrávek
js/app.js         logika aplikace
audio/words/      nahrávky celých slov (Ogg Opus)
audio/phones/     výchozí nahrávky hlásek
audio/phrases/    pochvaly a hlášky („správně“, „zkus to znovu“…)
```

Hlásky namluvené rodičem se ukládají jen v prohlížeči daného telefonu (IndexedDB), postup a nastavení v `localStorage`. Žádný server není potřeba.

Celá slova bez vlastní nahrávky čte hlas telefonu (Web Speech API, čeština).

## Spuštění

Aplikace musí běžet přes HTTP(S), ne z `file://` (zvuky se stahují přes `fetch`). Lokálně:

```bash
python3 -m http.server 8000
```

a otevřít <http://localhost:8000>. Nahrávání mikrofonem funguje jen na `localhost` nebo přes HTTPS.

## Nasazení na GitHub Pages

V repozitáři *Settings → Pages → Build and deployment*: Source *Deploy from a branch*, větev `main`, složka `/ (root)`. Aplikace pak poběží na `https://<účet>.github.io/<repozitář>/`.

## Přidání slova

1. Doplnit slovo do příslušné úrovně v `LEVELS` v `js/data.js`.
2. Volitelně přidat nahrávku `audio/words/SLOVO.ogg` (velkými písmeny, s diakritikou) a klíč `w_SLOVO` do `AUDIO_KEYS`. Pokud je to vlastní nahraný hlas, přidat klíč i do `OWNV`, jinak má přednost hlas telefonu.

## Instalace na plochu telefonu

Aplikace je PWA (`manifest.webmanifest`, `sw.js`). Na úvodní obrazovce je tlačítko **Přidat na plochu**: v Chromu na Androidu rovnou nabídne instalaci, na iPhonu ukáže postup přes tlačítko Sdílet. Service worker ukládá stránku a stažené nahrávky do mezipaměti, takže po prvním použití aplikace funguje i bez internetu. Při změně souborů v `SHELL` je dobré zvýšit verzi `CACHE` v `sw.js`.
