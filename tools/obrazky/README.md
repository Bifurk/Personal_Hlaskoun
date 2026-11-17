# Vlastní obrázky pro hry Poslouchej a Čti

Seznam slov 1. úrovně bez obrázku: `uroven1.csv` (slovo, název souboru, doporučení A/B/C, co nakreslit, prompt pro generátor).

## Požadavky na obrázky
- **Formát:** PNG s **průhledným pozadím** (aplikace má světlý i tmavý režim). Při zapracování se převedou na WebP.
- **Rozlišení:** **512 × 512 px**, čtverec. Aplikace obrázek ukazuje nejvýš asi 170 bodů, na S23 (3×) je to ~510 px.
- **Kompozice:** jeden předmět uprostřed, okraj kolem ~10 % (předmět se nesmí dotýkat hrany), žádný text ani písmena, žádné pozadí ani rámeček.
- **Styl:** jednotný pro všechny obrázky, co nejpodobnější emoji (lesklý kreslený styl, výrazné barvy, jednoduché tvary), aby obrázky ladily s ostatními.
- **Název souboru:** přesně podle slova velkými písmeny s diakritikou, např. `LOS.png`, `RÝČ.png`, `PÁS.png` (sloupec „soubor“).
- **Kontrola:** obrázek musí jednoznačně poznat šestileté dítě a nesmí se plést s jiným obrázkem ve hře (např. GÓL × MÍČ, VES × DŮM).

## Zapracování (pro Clauda)
Obrázky uložit do `img/pics/SLOVO.webp` (512 px, kvalita ~85), v `js/pictures.js` u slova uvést cestu místo emoji
(např. `LOS: "img:LOS"`), v aplikaci vykreslit `<img>` místo emoji, přidat soubory do cache service workeru,
podobné obrázky zařadit do `PIC_GROUPS` a doplnit testy v `tests/s23.js` (obrázek se načte, vejde se, neplete se).
