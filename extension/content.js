/*
 * Pokec Sklo Filter
 * Filtrovanie správ v miestnostiach na https://pokec-sklo.azet.sk/miestnost/
 * podľa mesta, pohlavia, mena a textu + automatické načítanie starších správ.
 *
 * Štruktúra stránky sa môže meniť, preto skript správy hľadá heuristicky.
 * Ak heuristika nesedí, v paneli v sekcii "Pokročilé" sa dajú zadať vlastné
 * CSS selektory.
 */
(function () {
  'use strict';

  if (window.__pokecSkloFilter) return;
  window.__pokecSkloFilter = true;

  const STORAGE_KEY = 'pokecSkloFilter.settings';
  const LOG = (...a) => console.log('[PokecFilter]', ...a);

  const DEFAULTS = {
    enabled: true,
    mode: 'hide', // 'hide' | 'dim'
    cityInclude: '',
    cityExclude: '',
    showMale: true,
    showFemale: true,
    showUnknownGender: true,
    ageMin: '',
    ageMax: '',
    nameInclude: '',
    nameExclude: '',
    textInclude: '',
    textExclude: '',
    initialPages: 5,
    autoLoadOnScroll: true,
    panelOpen: true,
    sel: {
      message: '',
      name: '',
      city: '',
      gender: '',
      text: '',
      olderButton: '',
      scroller: '',
    },
  };

  let settings = structuredClone(DEFAULTS);

  /* ------------------------------------------------------------------ */
  /* Úložisko (chrome.storage v rozšírení, localStorage v userscripte)   */
  /* ------------------------------------------------------------------ */
  const hasChromeStorage =
    typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  function loadSettings() {
    return new Promise((resolve) => {
      const merge = (raw) => {
        const s = Object.assign(structuredClone(DEFAULTS), raw || {});
        s.sel = Object.assign({}, DEFAULTS.sel, (raw && raw.sel) || {});
        resolve(s);
      };
      if (hasChromeStorage) {
        chrome.storage.local.get(STORAGE_KEY, (r) => merge(r && r[STORAGE_KEY]));
      } else {
        try {
          merge(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
        } catch (e) {
          merge(null);
        }
      }
    });
  }

  let saveTimer = null;
  function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (hasChromeStorage) {
        chrome.storage.local.set({ [STORAGE_KEY]: settings });
      } else {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
          /* ignore */
        }
      }
    }, 300);
  }

  /* ------------------------------------------------------------------ */
  /* Pomocné funkcie                                                     */
  /* ------------------------------------------------------------------ */
  const norm = (s) =>
    (s || '')
      .toString()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const splitList = (s) =>
    (s || '')
      .split(/[\n,;]+/)
      .map(norm)
      .filter(Boolean);

  function compileRegex(src) {
    src = (src || '').trim();
    if (!src) return { re: null, error: null };
    // Podpora zápisu /vzor/príznaky
    const m = src.match(/^\/(.*)\/([a-z]*)$/s);
    try {
      return {
        re: m ? new RegExp(m[1], m[2].includes('i') ? m[2] : m[2] + 'i') : new RegExp(src, 'i'),
        error: null,
      };
    } catch (e) {
      return { re: null, error: e.message };
    }
  }

  const safeQuery = (root, sel) => {
    if (!sel) return null;
    try {
      return root.querySelector(sel);
    } catch (e) {
      return null;
    }
  };
  const safeQueryAll = (root, sel) => {
    if (!sel) return [];
    try {
      return Array.from(root.querySelectorAll(sel));
    } catch (e) {
      return [];
    }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isOurs(el) {
    return !!(el && el.closest && el.closest('#psf-panel, #psf-toggle'));
  }

  /* ------------------------------------------------------------------ */
  /* Detekcia správ                                                      */
  /* ------------------------------------------------------------------ */
  // Odkaz na profil používateľa (pokec.azet.sk/<nick>, /profil/, ?i9=...).
  const PROFILE_HREF =
    /(pokec\.azet\.sk\/(?!miestnost|sklo|pomoc|search|hladaj)[^\/?#]+\/?($|[?#])|\/profil\/|profil\.php|[?&]uid=|[?&]nick=)/i;

  function isProfileLink(a) {
    if (!a || a.tagName !== 'A' || isOurs(a)) return false;
    const href = a.getAttribute('href') || '';
    const txt = (a.textContent || '').trim();
    return PROFILE_HREF.test(href) && txt.length > 0 && txt.length < 40;
  }

  // Pokec (React, hashované triedy): každá správa má <div id="messageContent">
  // a v hlavičke text "Ž / 37 / BB" (pohlavie / vek / skratka okresu).
  const MSG_CONTENT_SEL = '[id="messageContent"]';
  const META_RE = /^\s*([MŽZF?-])\s*\/\s*([\d?-]+)\s*\/\s*(.+?)\s*$/i;

  // Skratky okresov (ako na ŠPZ), ktoré Pokec zobrazuje pri správach.
  const DISTRICTS = {
    BA: 'Bratislava', BL: 'Bratislava', BT: 'Bratislava', MA: 'Malacky', PK: 'Pezinok', SC: 'Senec',
    TT: 'Trnava', DS: 'Dunajská Streda', GA: 'Galanta', HC: 'Hlohovec', PN: 'Piešťany', SE: 'Senica', SI: 'Skalica',
    TN: 'Trenčín', BN: 'Bánovce nad Bebravou', IL: 'Ilava', MY: 'Myjava', NM: 'Nové Mesto nad Váhom',
    PE: 'Partizánske', PB: 'Považská Bystrica', PD: 'Prievidza', PU: 'Púchov',
    NR: 'Nitra', KN: 'Komárno', LV: 'Levice', NZ: 'Nové Zámky', SA: 'Šaľa', TO: 'Topoľčany', ZM: 'Zlaté Moravce',
    ZA: 'Žilina', BY: 'Bytča', CA: 'Čadca', DK: 'Dolný Kubín', KM: 'Kysucké Nové Mesto', LM: 'Liptovský Mikuláš',
    MT: 'Martin', NO: 'Námestovo', RK: 'Ružomberok', TR: 'Turčianske Teplice', TS: 'Tvrdošín',
    BB: 'Banská Bystrica', BS: 'Banská Štiavnica', BR: 'Brezno', DT: 'Detva', KA: 'Krupina', LC: 'Lučenec',
    PT: 'Poltár', RA: 'Revúca', RS: 'Rimavská Sobota', VK: 'Veľký Krtíš', ZV: 'Zvolen', ZC: 'Žarnovica',
    ZH: 'Žiar nad Hronom',
    PO: 'Prešov', BJ: 'Bardejov', HE: 'Humenné', KK: 'Kežmarok', LE: 'Levoča', ME: 'Medzilaborce', PP: 'Poprad',
    SB: 'Sabinov', SK: 'Svidník', SL: 'Stará Ľubovňa', SP: 'Stropkov', SV: 'Snina', VT: 'Vranov nad Topľou',
    KE: 'Košice', KS: 'Košice-okolie', GL: 'Gelnica', MI: 'Michalovce', RV: 'Rožňava', SO: 'Sobrance',
    SN: 'Spišská Nová Ves', TV: 'Trebišov',
    ZAHR: 'Zahraničie',
  };

  const sigOf = (el) =>
    el.tagName + '.' + Array.from(el.classList).filter((c) => !c.startsWith('psf-')).sort().join('.');

  let detected = { container: null, sig: null };

  // Nájde kontajner, ktorého deti sú opakujúce sa správy (s #messageContent
  // alebo s odkazom na profil).
  function detectContainer() {
    const votes = new Map();
    let anchors = Array.from(document.querySelectorAll(MSG_CONTENT_SEL)).filter((e) => !isOurs(e));
    if (!anchors.length) anchors = Array.from(document.querySelectorAll('a[href]')).filter(isProfileLink);
    for (const a of anchors) {
      let el = a;
      for (let depth = 0; el && el.parentElement && depth < 8; depth++) {
        const parent = el.parentElement;
        if (parent === document.body || parent === document.documentElement) break;
        const sig = sigOf(el);
        const same = Array.from(parent.children).filter((c) => sigOf(c) === sig).length;
        if (same >= 3) {
          const key = parent;
          const v = votes.get(key) || { count: 0, sig };
          v.count++;
          votes.set(key, v);
          break;
        }
        el = parent;
      }
    }
    let best = null;
    for (const [container, v] of votes) {
      if (!best || v.count > best.count) best = { container, sig: v.sig, count: v.count };
    }
    if (best && best.count >= 3) {
      detected = { container: best.container, sig: best.sig };
      return true;
    }
    return false;
  }

  function getMessageElements() {
    if (settings.sel.message) {
      return safeQueryAll(document, settings.sel.message).filter((e) => !isOurs(e));
    }
    if (!detected.container || !detected.container.isConnected) {
      detectContainer();
    }
    if (!detected.container) return [];
    return Array.from(detected.container.children).filter(
      (c) => sigOf(c) === detected.sig || c.querySelector(MSG_CONTENT_SEL + ', a[href]')
    );
  }

  /* ------------------------------------------------------------------ */
  /* Parsovanie jednej správy                                            */
  /* ------------------------------------------------------------------ */
  // Krátke hodnoty (M/Ž/F) akceptujeme len ako celú hodnotu atribútu,
  // aby napr. CSS trieda "m-2" nebola vyhodnotená ako muž.
  function genderFromShort(v) {
    v = norm(v);
    if (/^(z|f|w|zena|female|woman)$/.test(v)) return 'Z';
    if (/^(m|muz|male|man)$/.test(v)) return 'M';
    return '?';
  }

  function genderFromString(s) {
    if (!s) return '?';
    if (/(zena|female|woman|girl|zensk|divka|dievca)/.test(s)) return 'Z';
    if (/(^|[^e])(male|muz|boy|chlap|chalan)/.test(s)) return 'M';
    return '?';
  }

  function detectGender(el, nameEl) {
    if (settings.sel.gender) {
      const g = safeQuery(el, settings.sel.gender);
      if (!g) return '?';
      const attrs = [g.textContent, g.title, g.getAttribute('alt'), g.getAttribute('data-sex'), g.getAttribute('data-gender')];
      for (const a of attrs) {
        const r = genderFromShort(a || '');
        if (r !== '?') return r;
      }
      return genderFromString(norm(String(g.className) + ' ' + attrs.join(' ')));
    }
    const nodes = [el, nameEl, ...el.querySelectorAll('[data-sex], [data-gender], [data-pohlavie], img, i, svg, span[class], [title]')].filter(Boolean);
    const parts = [];
    for (const n of nodes) {
      for (const a of ['data-sex', 'data-gender', 'data-pohlavie']) {
        const r = genderFromShort(n.getAttribute(a) || '');
        if (r !== '?') return r;
      }
      const cls = n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className;
      parts.push(cls, n.getAttribute('title'), n.getAttribute('alt'), n.getAttribute('src'));
    }
    // splitneme camelCase / pomlčky, aby "icon-female" alebo "sexZena" fungovalo
    const s = norm(
      parts
        .filter(Boolean)
        .join(' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]/g, ' ')
    );
    return genderFromString(s);
  }

  function detectCity(el, nameEl) {
    if (settings.sel.city) {
      const c = safeQuery(el, settings.sel.city);
      return c ? c.textContent.trim() : '';
    }
    const byClass = el.querySelector(
      '[class*="mesto" i], [class*="city" i], [class*="lokal" i], [class*="location" i], [class*="town" i], [class*="region" i], [data-city], [data-mesto]'
    );
    if (byClass) {
      return (byClass.getAttribute('data-city') || byClass.getAttribute('data-mesto') || byClass.textContent || '')
        .replace(/[()]/g, '')
        .trim();
    }
    // Mesto v title/data atribúte odkazu na profil
    if (nameEl) {
      const t = nameEl.getAttribute('title') || '';
      const m = t.match(/(?:mesto|bydlisko|z)\s*:?\s*([^,|]+)/i);
      if (m) return m[1].trim();
    }
    // Vzor "nick (25, Bratislava)" alebo "nick, Bratislava"
    const full = el.textContent || '';
    const name = nameEl ? nameEl.textContent.trim() : '';
    let after = full;
    if (name) {
      const i = full.indexOf(name);
      if (i >= 0) after = full.slice(i + name.length, i + name.length + 80);
    }
    const paren = after.match(/^\s*[\[(]([^\])]+)[\])]/);
    if (paren) {
      const bits = paren[1]
        .split(/[,/|]/)
        .map((x) => x.trim())
        .filter((x) => x && !/^\d+$/.test(x) && !/^[mzžf]$/i.test(x) && !/^\d{1,2}:\d{2}/.test(x));
      if (bits.length) return bits[bits.length - 1];
    }
    return '';
  }

  const textSpans = (root) =>
    Array.from(root.querySelectorAll('span')).filter((s) => !s.children.length && s.textContent.trim());

  function parseMeta(s) {
    const m = (s || '').match(META_RE);
    if (!m) return null;
    const age = parseInt(m[2], 10);
    return { gender: genderFromShort(m[1]), age: isNaN(age) ? null : age, loc: m[3] };
  }

  function parsePokecMessage(el, content) {
    const head = textSpans(el).filter((s) => !content.contains(s));
    const metaEl = head.find((s) => META_RE.test(s.textContent));
    const nameEl = head.find((s) => s !== metaEl && !/^[•·|\-]$/.test(s.textContent.trim()));
    const meta = parseMeta(metaEl && metaEl.textContent) || { gender: '?', age: null, loc: '' };

    // Citovaná správa pri odpovedi je <div> vedľa vlastného textu (<span>) – vynecháme ju.
    const clone = content.cloneNode(true);
    const wrap = clone.firstElementChild;
    if (wrap && Array.from(wrap.children).some((c) => c.tagName !== 'DIV')) {
      Array.from(wrap.children).forEach((c) => c.tagName === 'DIV' && c.remove());
    }
    let text = clone.textContent;
    clone.querySelectorAll('img[alt]').forEach((img) => {
      const alt = img.getAttribute('alt');
      if (alt && alt.length < 20) text += ' ' + alt;
    });

    return {
      name: nameEl ? nameEl.textContent.trim() : '',
      city: meta.loc,
      gender: meta.gender,
      age: meta.age,
      text: text.replace(/\s+/g, ' ').trim(),
    };
  }

  // Zoznam "Ľudia v miestnosti" ukazuje celé mesto ("Košice - Juh"), správy len
  // skratku okresu ("KE") – mapa nick → mesto z tohto zoznamu.
  const userLocations = new Map();
  let userLocScan = 0;
  function refreshUserLocations() {
    if (Date.now() - userLocScan < 3000) return;
    userLocScan = Date.now();
    for (const s of textSpans(document)) {
      if (isOurs(s) || s.closest(MSG_CONTENT_SEL)) continue;
      const meta = parseMeta(s.textContent);
      if (!meta || DISTRICTS[meta.loc.toUpperCase()]) continue; // skratka = hlavička správy
      let prev = s.previousElementSibling;
      while (prev && /^[•·|\-]?$/.test(prev.textContent.trim())) prev = prev.previousElementSibling;
      if (prev) userLocations.set(prev.textContent.trim(), meta.loc);
    }
  }

  function parseMessage(el) {
    const content = !settings.sel.name && !settings.sel.city && el.querySelector(MSG_CONTENT_SEL);
    if (content) return parsePokecMessage(el, content);

    const nameEl = settings.sel.name
      ? safeQuery(el, settings.sel.name)
      : Array.from(el.querySelectorAll('a[href]')).find(isProfileLink) ||
        el.querySelector('[class*="nick" i], [class*="name" i], [class*="autor" i], [class*="author" i], [class*="user" i], b, strong');
    const name = nameEl ? nameEl.textContent.trim() : '';
    const city = detectCity(el, nameEl);
    const gender = detectGender(el, nameEl);

    let text = '';
    if (settings.sel.text) {
      const t = safeQuery(el, settings.sel.text);
      text = t ? t.textContent : '';
    } else {
      const t = el.querySelector(
        '[class*="text" i]:not([class*="context" i]), [class*="msg" i], [class*="sprava" i], [class*="message" i], [class*="content" i], p'
      );
      if (t && t !== el && !(nameEl && t.contains(nameEl))) {
        text = t.textContent;
      } else {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('a[href], time, [class*="time" i], [class*="cas" i], [class*="mesto" i], [class*="city" i], script, style').forEach((n) => {
          if (n.tagName !== 'A' || isProfileLink(n)) n.remove();
        });
        text = clone.textContent;
      }
    }
    text = text.replace(/\s+/g, ' ').trim();
    // Obrázky/smajlíky s alt textom zachováme v texte
    el.querySelectorAll('img[alt]').forEach((img) => {
      const alt = img.getAttribute('alt');
      if (alt && alt.length < 20 && !/^(m|z|muz|zena)$/i.test(norm(alt))) text += ' ' + alt;
    });

    return { name, city, gender, text };
  }

  /* ------------------------------------------------------------------ */
  /* Filtrovanie                                                         */
  /* ------------------------------------------------------------------ */
  let compiled = null;

  function compileFilters() {
    const nI = compileRegex(settings.nameInclude);
    const nE = compileRegex(settings.nameExclude);
    const tI = compileRegex(settings.textInclude);
    const tE = compileRegex(settings.textExclude);
    compiled = {
      cityInc: splitList(settings.cityInclude),
      cityExc: splitList(settings.cityExclude),
      ageMin: parseInt(settings.ageMin, 10) || 0,
      ageMax: parseInt(settings.ageMax, 10) || 0,
      nameInc: nI.re,
      nameExc: nE.re,
      textInc: tI.re,
      textExc: tE.re,
      errors: { nameInclude: nI.error, nameExclude: nE.error, textInclude: tI.error, textExclude: tE.error },
    };
    return compiled;
  }

  // Všetky názvy, pod ktorými sa dá mesto správy nájsť: skratka, okres, celé mesto.
  function cityCandidates(msg) {
    const out = [msg.city, DISTRICTS[(msg.city || '').toUpperCase()], userLocations.get(msg.name)];
    return out.map(norm).filter(Boolean);
  }

  // Krátke položky (skratky ako "BA") musia sedieť presne, dlhšie stačí ako podreťazec.
  const cityMatches = (cands, list) =>
    list.some((x) => cands.some((c) => c === x || (x.length > 3 && c.includes(x))));

  function passes(msg) {
    const f = compiled;
    if (msg.gender === 'M' && !settings.showMale) return false;
    if (msg.gender === 'Z' && !settings.showFemale) return false;
    if (msg.gender === '?' && !settings.showUnknownGender) return false;
    if (msg.age != null) {
      if (f.ageMin && msg.age < f.ageMin) return false;
      if (f.ageMax && msg.age > f.ageMax) return false;
    }
    if (f.cityInc.length || f.cityExc.length) {
      const cands = cityCandidates(msg);
      if (f.cityInc.length && !cityMatches(cands, f.cityInc)) return false;
      if (f.cityExc.length && cityMatches(cands, f.cityExc)) return false;
    }
    if (f.nameInc && !f.nameInc.test(msg.name)) return false;
    if (f.nameExc && f.nameExc.test(msg.name)) return false;
    if (f.textInc && !f.textInc.test(msg.text)) return false;
    if (f.textExc && f.textExc.test(msg.text)) return false;
    return true;
  }

  const parsedCache = new WeakMap();
  let stats = { total: 0, shown: 0 };

  function applyFilters() {
    if (!compiled) compileFilters();
    const msgs = getMessageElements();
    refreshUserLocations();
    let shown = 0;
    for (const el of msgs) {
      let msg = parsedCache.get(el);
      // re-parse, ak sa zmenil obsah elementu
      const sig = el.textContent.length;
      if (!msg || msg._sig !== sig) {
        msg = parseMessage(el);
        msg._sig = sig;
        parsedCache.set(el, msg);
        el.setAttribute('data-psf-gender', msg.gender);
        if (msg.city) el.setAttribute('data-psf-city', msg.city);
      }
      const ok = !settings.enabled || passes(msg);
      el.classList.toggle('psf-hidden', !ok && settings.mode === 'hide');
      el.classList.toggle('psf-dim', !ok && settings.mode === 'dim');
      if (ok) shown++;
    }
    stats = { total: msgs.length, shown };
    updateStats();
    maybeFillViewport();
  }

  // Ak po odfiltrovaní nie je čo rolovať, nedá sa ani "ísť hore" –
  // dočítame staršie správy automaticky, kým sa kontajner nezaplní.
  let fillLoads = 0;
  let fillPending = false;
  function maybeFillViewport() {
    if (!initialDone || !settings.autoLoadOnScroll || loading || noMoreOlder) return;
    const s = findScroller();
    const viewH = isWindowScroller(s) ? window.innerHeight : s.clientHeight;
    if (s.scrollHeight > viewH + 50) {
      fillLoads = 0;
      return;
    }
    if (fillLoads >= 10 || fillPending) return;
    fillLoads++;
    fillPending = true;
    setTimeout(() => {
      loadOlderOnce().then((grew) => {
        fillPending = false;
        if (grew === false) noMoreOlder = true;
      });
    }, 200);
  }

  let applyScheduled = false;
  function scheduleApply() {
    if (applyScheduled) return;
    applyScheduled = true;
    requestAnimationFrame(() => {
      applyScheduled = false;
      applyFilters();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Načítanie starších správ                                            */
  /* ------------------------------------------------------------------ */
  const OLDER_TEXT_RE =
    /(star[sš]ie|predo[sš]l|predch[aá]dzaj|na[cč][ií]ta[tť] viac|zobrazi[tť] viac|viac spr[aá]v|hist[oó]ri|older|load more|show more)/i;

  function findOlderButton() {
    if (settings.sel.olderButton) return safeQuery(document, settings.sel.olderButton);
    const cands = document.querySelectorAll('a, button, [role="button"], [onclick], span, div');
    let fallback = null;
    for (const el of cands) {
      if (isOurs(el)) continue;
      if (el.children.length > 2) continue;
      const t = (el.textContent || '').trim();
      if (t.length > 0 && t.length < 50 && OLDER_TEXT_RE.test(t) && el.offsetParent !== null) {
        const btn = el.closest('a, button, [role="button"], [onclick]');
        if (btn) return btn;
        // Pokec: <div> s cursor:pointer, prípadne jeho rodič
        let p = el;
        for (let i = 0; p && i < 3; i++, p = p.parentElement) {
          if (getComputedStyle(p).cursor === 'pointer') return p;
        }
        fallback = fallback || el;
        continue;
      }
      const title = el.getAttribute && (el.getAttribute('title') || el.getAttribute('aria-label') || '');
      if (title && OLDER_TEXT_RE.test(title) && el.offsetParent !== null) return el;
    }
    return fallback;
  }

  // Tlačidlo sa na Pokeci objaví až po vyrolovaní hore – chvíľu naň počkáme.
  async function waitForOlderButton(timeout = 1500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const b = findOlderButton();
      if (b) return b;
      await sleep(150);
    }
    return null;
  }

  function isScrollable(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    const st = getComputedStyle(el);
    // len podľa štýlu – po odfiltrovaní môže byť obsah nižší ako kontajner
    return /(auto|scroll|overlay)/.test(st.overflowY) && el.clientHeight > 50;
  }

  function findScroller() {
    if (settings.sel.scroller) {
      const s = safeQuery(document, settings.sel.scroller);
      if (s) return s;
    }
    const first = getMessageElements()[0];
    let el = first ? first.parentElement : null;
    while (el) {
      if (isScrollable(el)) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  const isWindowScroller = (s) => s === document.scrollingElement || s === document.documentElement || s === document.body;

  function waitForGrowth(prevCount, timeout = 5000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const n = getMessageElements().length;
        if (n > prevCount) {
          // počkáme ešte chvíľu, kým dobehne celá dávka
          setTimeout(() => resolve(true), 300);
        } else if (Date.now() - start > timeout) {
          resolve(false);
        } else {
          setTimeout(tick, 150);
        }
      };
      tick();
    });
  }

  let loading = false;
  let noMoreOlder = false;
  let initialDone = false;

  // Vráti true (pribudli správy), false (nič nepribudlo) alebo null (už sa načítava).
  async function loadOlderOnce() {
    if (loading) return null;
    loading = true;
    setStatus('Načítavam staršie správy…');
    try {
      const scroller = findScroller();
      const before = getMessageElements().length;
      const prevHeight = scroller.scrollHeight;
      const prevTop = scroller.scrollTop;

      let btn = findOlderButton();
      if (!btn) {
        // posun na úplný vrch spustí natívne načítanie (infinite scroll)
        // alebo zobrazí tlačidlo "Zobraziť staršie správy"
        if (isWindowScroller(scroller)) window.scrollTo(0, 0);
        else scroller.scrollTop = 0;
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
        window.dispatchEvent(new Event('scroll'));
        btn = await waitForOlderButton();
      }
      if (btn) btn.click();

      const grew = await waitForGrowth(before);
      // zachovanie pozície – aby obsah "neskočil"
      const delta = scroller.scrollHeight - prevHeight;
      if (grew && delta > 0) {
        if (isWindowScroller(scroller)) window.scrollTo(0, prevTop + delta);
        else scroller.scrollTop = prevTop + delta;
      }
      setStatus(grew ? '' : 'Ďalšie staršie správy sa nenašli.');
      return grew;
    } finally {
      loading = false;
      scheduleApply();
    }
  }

  async function initialLoad() {
    const pages = Math.max(0, Math.min(30, parseInt(settings.initialPages, 10) || 0));
    for (let i = 0; i < pages; i++) {
      setStatus(`Načítavam staršie správy… (${i + 1}/${pages})`);
      const grew = await loadOlderOnce();
      if (grew === false) {
        noMoreOlder = true;
        break;
      }
      await sleep(400);
    }
    setStatus('');
    // po úvodnom načítaní zrolujeme dole na najnovšie správy
    const scroller = findScroller();
    if (isWindowScroller(scroller)) window.scrollTo(0, scroller.scrollHeight);
    else scroller.scrollTop = scroller.scrollHeight;
    attachScrollListener();
    initialDone = true;
  }

  let scrollAttachedTo = null;
  function attachScrollListener() {
    const scroller = findScroller();
    if (scrollAttachedTo === scroller) return;
    if (scrollAttachedTo) {
      (isWindowScroller(scrollAttachedTo) ? window : scrollAttachedTo).removeEventListener('scroll', onScroll);
    }
    scrollAttachedTo = scroller;
    (isWindowScroller(scroller) ? window : scroller).addEventListener('scroll', onScroll, { passive: true });
  }

  let lastAutoLoad = 0;
  function onScroll() {
    if (!settings.autoLoadOnScroll || loading) return;
    const s = scrollAttachedTo;
    const top = isWindowScroller(s) ? window.scrollY : s.scrollTop;
    if (top < 150 && Date.now() - lastAutoLoad > 1500) {
      lastAutoLoad = Date.now();
      noMoreOlder = false;
      loadOlderOnce();
    }
  }

  /* ------------------------------------------------------------------ */
  /* UI panel                                                            */
  /* ------------------------------------------------------------------ */
  let ui = {};

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(k));
    return el;
  }

  function bindText(key, label, placeholder, rows = 2, isSel = false) {
    const get = () => (isSel ? settings.sel[key] : settings[key]);
    const ta = h(rows > 1 ? 'textarea' : 'input', {
      class: 'psf-input',
      rows: rows > 1 ? rows : null,
      placeholder,
      spellcheck: 'false',
    });
    ta.value = get() || '';
    const err = h('div', { class: 'psf-err' });
    ta.addEventListener('input', () => {
      if (isSel) {
        settings.sel[key] = ta.value.trim();
        detected = { container: null, sig: null };
      } else settings[key] = ta.value;
      saveSettings();
      const c = compileFilters();
      err.textContent = (c.errors[key] && 'Chybný regulárny výraz: ' + c.errors[key]) || '';
      scheduleApply();
    });
    ui['err_' + key] = err;
    return h('label', { class: 'psf-field' }, h('span', null, label), ta, err);
  }

  function bindCheck(key, label) {
    const cb = h('input', { type: 'checkbox' });
    cb.checked = !!settings[key];
    cb.addEventListener('change', () => {
      settings[key] = cb.checked;
      saveSettings();
      scheduleApply();
    });
    return h('label', { class: 'psf-check' }, cb, ' ', label);
  }

  function bindNum(key) {
    const inp = h('input', { type: 'number', min: '0', max: '120', class: 'psf-num' });
    inp.value = settings[key];
    inp.addEventListener('input', () => {
      settings[key] = inp.value;
      saveSettings();
      compileFilters();
      scheduleApply();
    });
    return inp;
  }

  function buildPanel() {
    const toggle = h('button', { id: 'psf-toggle', title: 'Filter správ' }, '🔍');
    const stat = h('span', { class: 'psf-stat' });
    const status = h('div', { class: 'psf-status' });
    ui.stat = stat;
    ui.status = status;

    const modeSel = h('select', { class: 'psf-select' }, h('option', { value: 'hide' }, 'skryť'), h('option', { value: 'dim' }, 'zošednúť'));
    modeSel.value = settings.mode;
    modeSel.addEventListener('change', () => {
      settings.mode = modeSel.value;
      saveSettings();
      scheduleApply();
    });

    const pagesIn = h('input', { type: 'number', min: '0', max: '30', class: 'psf-num' });
    pagesIn.value = settings.initialPages;
    pagesIn.addEventListener('change', () => {
      settings.initialPages = parseInt(pagesIn.value, 10) || 0;
      saveSettings();
    });

    const diagOut = h('pre', { class: 'psf-diag' });

    const panel = h(
      'div',
      { id: 'psf-panel' },
      h(
        'div',
        { class: 'psf-head' },
        h('b', null, 'Filter skla'),
        stat,
        h('button', { class: 'psf-x', title: 'Zavrieť', onclick: () => setPanelOpen(false) }, '×')
      ),
      h('div', { class: 'psf-row' }, bindCheck('enabled', 'Filter zapnutý'), h('span', null, 'Nevyhovujúce: ', modeSel)),
      h(
        'fieldset',
        null,
        h('legend', null, 'Pohlavie a vek'),
        bindCheck('showMale', 'muži'),
        bindCheck('showFemale', 'ženy'),
        bindCheck('showUnknownGender', 'neznáme'),
        h('div', { class: 'psf-check' }, 'Vek od ', bindNum('ageMin'), ' do ', bindNum('ageMax'))
      ),
      h(
        'fieldset',
        null,
        h('legend', null, 'Mesto'),
        bindText('cityInclude', 'Zobraziť len (include)', 'Bratislava, Košice…'),
        bindText('cityExclude', 'Skryť (exclude)', 'Praha\nBrno')
      ),
      h(
        'fieldset',
        null,
        h('legend', null, 'Meno (regulárny výraz)'),
        bindText('nameInclude', 'Include', '^(janko|marienka)$', 1),
        bindText('nameExclude', 'Exclude', 'bot|spam\\d+', 1)
      ),
      h(
        'fieldset',
        null,
        h('legend', null, 'Text správy (regulárny výraz)'),
        bindText('textInclude', 'Include', 'ahoj|kto (je|ide)', 1),
        bindText('textExclude', 'Exclude', 'https?://|reklama', 1)
      ),
      h(
        'fieldset',
        null,
        h('legend', null, 'Staršie správy'),
        h('label', { class: 'psf-check' }, 'Na začiatku načítať ', pagesIn, ' strán'),
        bindCheck('autoLoadOnScroll', 'Dočítať pri rolovaní hore'),
        h('button', { class: 'psf-btn', onclick: () => loadOlderOnce().then(scheduleApply) }, 'Načítať staršie teraz')
      ),
      h(
        'details',
        null,
        h('summary', null, 'Pokročilé (CSS selektory)'),
        h('div', { class: 'psf-hint' }, 'Nechaj prázdne pre automatickú detekciu. Selektory pre meno/mesto/pohlavie/text sú relatívne k správe.'),
        bindText('message', 'Správa', '#chat .message', 1, true),
        bindText('name', 'Meno', 'a.nick', 1, true),
        bindText('city', 'Mesto', '.city', 1, true),
        bindText('gender', 'Pohlavie', '.sex', 1, true),
        bindText('text', 'Text', '.text', 1, true),
        bindText('olderButton', 'Tlačidlo "staršie"', '.load-older', 1, true),
        bindText('scroller', 'Rolovací kontajner', '#chat-scroll', 1, true),
        h('button', { class: 'psf-btn', onclick: () => runDiagnostics(diagOut) }, 'Diagnostika'),
        diagOut
      ),
      status
    );

    toggle.addEventListener('click', () => setPanelOpen(!settings.panelOpen));
    document.body.append(toggle, panel);
    ui.panel = panel;
    setPanelOpen(settings.panelOpen);
    compileFilters();
    for (const k of ['nameInclude', 'nameExclude', 'textInclude', 'textExclude']) {
      if (compiled.errors[k] && ui['err_' + k]) ui['err_' + k].textContent = 'Chybný regulárny výraz: ' + compiled.errors[k];
    }
  }

  function setPanelOpen(open) {
    settings.panelOpen = open;
    saveSettings();
    if (ui.panel) ui.panel.style.display = open ? '' : 'none';
  }

  function updateStats() {
    if (ui.stat) ui.stat.textContent = `${stats.shown} / ${stats.total}`;
  }

  function setStatus(t) {
    if (ui.status) ui.status.textContent = t;
  }

  function runDiagnostics(out) {
    detected = { container: null, sig: null };
    const msgs = getMessageElements();
    const lines = [];
    lines.push('Správ nájdených: ' + msgs.length);
    if (detected.container) {
      const c = detected.container;
      lines.push('Kontajner: ' + c.tagName.toLowerCase() + (c.id ? '#' + c.id : '') + (c.className ? '.' + String(c.className).trim().split(/\s+/).join('.') : ''));
      lines.push('Správa: ' + detected.sig);
    }
    const btn = findOlderButton();
    lines.push('Tlačidlo staršie: ' + (btn ? btn.tagName + ' "' + btn.textContent.trim().slice(0, 30) + '"' : 'nenájdené (použije sa rolovanie)'));
    const sc = findScroller();
    lines.push('Rolovanie: ' + (isWindowScroller(sc) ? 'okno' : sc.tagName + (sc.id ? '#' + sc.id : '') + '.' + String(sc.className).trim().split(/\s+/).join('.')));
    lines.push('');
    msgs.slice(-8).forEach((el) => {
      const m = parseMessage(el);
      lines.push(`[${m.gender}${m.age != null ? ' ' + m.age : ''}] ${m.name} | ${cityCandidates(m).join(' / ') || '-'} | ${m.text.slice(0, 60)}`);
    });
    out.textContent = lines.join('\n');
    LOG('Diagnostika', { container: detected.container, messages: msgs, button: btn, scroller: sc });
    if (msgs[0]) LOG('Ukážka HTML správy:', msgs[msgs.length - 1].outerHTML);
  }

  /* ------------------------------------------------------------------ */
  /* Štart                                                               */
  /* ------------------------------------------------------------------ */
  async function waitForMessages(timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (getMessageElements().length > 0) return true;
      await sleep(500);
    }
    return false;
  }

  async function main() {
    settings = await loadSettings();
    buildPanel();

    const observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (!isOurs(m.target)) {
          scheduleApply();
          return;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setStatus('Hľadám správy…');
    const found = await waitForMessages();
    if (!found) {
      setStatus('Správy sa nenašli – skús "Pokročilé → Diagnostika" alebo nastav selektory.');
      return;
    }
    setStatus('');
    applyFilters();
    await initialLoad();
    applyFilters();
  }

  main();
})();
