# Robot Hláskoun – pokyny pro Clauda

Statická webová aplikace (PWA) bez build kroku, nasazená přes GitHub Pages z větve `main`:
https://bifurk.github.io/Personal_Hlaskoun/

## Cílové zařízení: Samsung Galaxy S23

Uživatel aplikaci používá na **Samsungu Galaxy S23** (Android 14, Chrome a Samsung Internet).
Každou změnu je nutné otestovat na emulaci tohoto telefonu:

1. Před commitem: `node tests/s23.js` (spustí lokální server a otestuje pracovní kopii).
2. Po pushi do `main` a nasazení Pages (1–2 min): `node tests/s23.js https://bifurk.github.io/Personal_Hlaskoun/`.
3. Prohlédnout snímky v `tests/screenshots/` (hlavně u změn vzhledu) a výsledek uživateli shrnout.

Test musí skončit „Vše v pořádku“. Když nová funkce přidá něco ověřitelného (režim, tlačítko, dialog), doplnit kontrolu do `tests/s23.js`.
Jde o emulaci v Chromiu, ne o skutečný telefon – u věcí, které emulace neověří (mikrofon, hlas telefonu, skutečná instalace na plochu), to uživateli říct a požádat ho o vyzkoušení.

## Poznámky

- Uživatel komunikuje česky; texty v aplikaci jsou česky.
- Při změně souborů v `SHELL` v `sw.js` zvýšit verzi `CACHE`, jinak telefon může držet starou verzi.
- Nahrávky: `audio/words/SLOVO.ogg` (velkými, s diakritikou, NFC), klíče v `AUDIO_KEYS` v `js/data.js`.
