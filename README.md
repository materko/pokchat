# Pokec Sklo Filter

Rozšírenie prehliadača (Chrome / Edge / Firefox) a userscript pre miestnosti
[pokec-sklo.azet.sk/miestnost/](https://pokec-sklo.azet.sk/miestnost/).

## Čo vie

- **Filtrovanie správ** naživo (aj novo prichádzajúce):
  - **Mesto** – include / exclude zoznam (oddelený čiarkou alebo novým riadkom,
    bez ohľadu na diakritiku a veľkosť písmen, napr. `kosice` = `Košice`).
    Pri správach Pokec ukazuje len skratku okresu (`BB`, `KE`, `Zahr`) – filter
    ju porovnáva so skratkou, s názvom okresu aj s celým mestom zo zoznamu
    „Ľudia v miestnosti“. Krátke položky (`BA`) musia sedieť presne, dlhšie
    (`Košice`) stačia ako časť názvu (`Košice - Juh`).
  - **Pohlavie** – muži / ženy / neznáme, **vek** od – do
  - **Meno** – include / exclude regulárne výrazy
  - **Text** – include / exclude regulárne výrazy
  - Každý riadok je samostatný výraz. **Include**: správa sa zobrazí, ak sedí
    aspoň jeden riadok. **Exclude**: správa sa skryje, ak sedí ktorýkoľvek riadok.
  - Diakritika a veľké/malé písmená sa ignorujú (`zena` nájde aj „Žena“).
    Dá sa použiť aj zápis `/vzor/príznaky`.
  - Nevyhovujúce správy sa dajú **skryť** alebo len **zošednúť**.
- **Staršie správy** – hneď po otvorení miestnosti načíta 5 starších strán
  (nastaviteľné), pri rolovaní hore dočítava ďalšie. Keď filter skryje väčšinu
  správ a nie je čo rolovať, dočíta staršie automaticky.
- Nastavenia sa ukladajú.

Panel sa otvára modrým tlačidlom 🔍 vpravo dole.

## Inštalácia

### Chrome / Edge
1. `chrome://extensions` → zapni **Režim pre vývojárov**
2. **Načítať rozbalené** → vyber priečinok `extension/`

### Firefox
`about:debugging#/runtime/this-firefox` → **Načítať dočasný doplnok** → `extension/manifest.json`

### Userscript (Tampermonkey / Violentmonkey)
Nainštaluj `pokec-sklo-filter.user.js` (vytvára sa príkazom `scripts/build-userscript.sh`).

## Ak niečo nefunguje

Pokec používa hashované CSS triedy, ktoré sa môžu pri novej verzii zmeniť.
Skript sa preto opiera o stabilnejšie znaky: `<div id="messageContent">`
v každej správe, text hlavičky `Ž / 37 / BB` (pohlavie / vek / okres)
a tlačidlo „Zobraziť staršie správy“. Pre iné rozloženie má aj všeobecnú
heuristiku (odkazy na profil, triedy ako `mesto`, `city`…).

1. V paneli otvor **Pokročilé → Diagnostika** – ukáže, koľko správ našiel,
   a ako rozparsoval posledné správy (`[pohlavie vek] meno | mesto | text`).
   Do konzoly (F12) vypíše HTML jednej správy.
2. Ak niečo nesedí, doplň vlastné CSS selektory (správa, meno, mesto,
   pohlavie, text, tlačidlo „staršie“, rolovací kontajner).
