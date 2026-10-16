# Pokec Sklo Filter

Rozšírenie prehliadača (Chrome / Edge / Firefox) a userscript pre miestnosti
[pokec-sklo.azet.sk/miestnost/](https://pokec-sklo.azet.sk/miestnost/).

## Čo vie

- **Filtrovanie správ** naživo (aj novo prichádzajúce):
  - **Mesto** – include / exclude zoznam (oddelený čiarkou alebo novým riadkom,
    bez ohľadu na diakritiku a veľkosť písmen, napr. `kosice` = `Košice`)
  - **Pohlavie** – muži / ženy / neznáme
  - **Meno** – include / exclude regulárny výraz
  - **Text** – include / exclude regulárny výraz
  - Regulárne výrazy sú case-insensitive; dá sa použiť aj zápis `/vzor/príznaky`.
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

Štruktúru HTML skla som nemal k dispozícii, preto skript správy hľadá
heuristicky (opakujúce sa prvky s odkazom na profil, triedy ako `mesto`,
`city`, ikonky/atribúty s `zena`/`muz`/`female`/`male`, tlačidlo s textom
„staršie…“).

1. V paneli otvor **Pokročilé → Diagnostika** – ukáže, koľko správ našiel,
   a ako rozparsoval posledné správy (`[pohlavie] meno | mesto | text`).
   Do konzoly (F12) vypíše HTML jednej správy.
2. Ak niečo nesedí, doplň vlastné CSS selektory (správa, meno, mesto,
   pohlavie, text, tlačidlo „staršie“, rolovací kontajner).
