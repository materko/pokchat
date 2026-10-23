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
// @version      0.4.2
// @description  Filter správ na pokec skle podľa mesta, pohlavia, mena a textu + načítanie starších správ
// @match        https://pokec-sklo.azet.sk/miestnost/*
// @match        http://pokec-sklo.azet.sk/miestnost/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
HDR
  printf '(function(){var s=document.createElement("style");s.textContent=%s;document.head.appendChild(s);})();\n' \
    "$(if command -v node >/dev/null 2>&1; then
         node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync("extension/content.css","utf8")))'
       else
         python -c 'import json,sys; sys.stdout.write(json.dumps(open("extension/content.css",encoding="utf8").read(), ensure_ascii=False))'
       fi)"
  cat extension/content.js
} > "$OUT"
echo "Vytvorené: $OUT"
