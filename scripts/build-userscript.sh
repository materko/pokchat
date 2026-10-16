#!/bin/sh
# Zostaví userscript (Tampermonkey/Violentmonkey) z extension/content.js a content.css
set -e
cd "$(dirname "$0")/.."
OUT=pokec-sklo-filter.user.js
{
  cat <<'HDR'
// ==UserScript==
// @name         Pokec Sklo Filter
// @namespace    https://github.com/materko/pokchat
// @version      0.1.0
// @description  Filter správ na pokec skle podľa mesta, pohlavia, mena a textu + načítanie starších správ
// @match        https://pokec-sklo.azet.sk/miestnost/*
// @match        http://pokec-sklo.azet.sk/miestnost/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
HDR
  printf '(function(){var s=document.createElement("style");s.textContent=%s;document.head.appendChild(s);})();\n' \
    "$(node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync("extension/content.css","utf8")))')"
  cat extension/content.js
} > "$OUT"
echo "Vytvorené: $OUT"
