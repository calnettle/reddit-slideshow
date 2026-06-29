/* ============================================================
 * Reddit access TOKEN grabber  (paste into an Apple Shortcut)
 * ------------------------------------------------------------
 * New Reddit keeps its OAuth token only in JS memory (not in the page,
 * storage, cookies, or IndexedDB), so this also HOOKS the network: it
 * wraps fetch/XHR to catch the `Authorization: Bearer …` header off one
 * of Reddit's own background requests, nudging the feed to load so a
 * request fires. Capped at ~1.7s to stay inside the action's limit.
 *
 *   ➜ Run it on the FEED at  https://sh.reddit.com  (signed in).
 *     Scroll the feed a little first, then run it. On success the result
 *     IS the token (eyJ…) — copy it into the app. On failure it returns
 *     {ok:false,…} (paste it back).
 * ============================================================ */
function run() {
  var DEADLINE = Date.now() + 1700;
  var finished = false;
  function out(o) { if (finished) return; finished = true; try { completion(typeof o === "string" ? o : JSON.stringify(o)); } catch (e) {} }
  function decode(jwt) { try { var p = jwt.split("."); if (p.length !== 3) return null; var b = p[1].replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "="; return JSON.parse(atob(b)); } catch (e) { return null; } }

  var now = Math.floor(Date.now() / 1000);
  var rx = /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g;
  var seenAll = {}, cands = [], idbNames = [], sawAuthHeader = false;
  function harvest(text, label) {
    if (!text) return;
    rx.lastIndex = 0; var m;
    while ((m = rx.exec(String(text)))) {
      var t = m[0]; if (seenAll[t]) continue; seenAll[t] = 1;
      var pl = decode(t); if (!pl) continue;
      cands.push({ t: t, expired: !!(pl.exp && pl.exp < now), tokenish: !!(pl.scope || pl.scopes || pl.scp || pl.client_id || pl.cid || pl.aud), hasSub: !!pl.sub, len: t.length, label: label });
    }
  }
  function live() { return cands.filter(function (c) { return !c.expired; }).sort(function (a, b) { return (b.tokenish - a.tokenish) || (b.hasSub - a.hasSub) || (b.len - a.len); }); }

  // --- Hook the network FIRST so we catch requests fired during this run ---
  function authFrom(h) {
    if (!h) return null;
    try {
      if (typeof h.get === "function") return h.get("authorization") || h.get("Authorization");
      if (typeof h.forEach === "function" && !Array.isArray(h)) { var v = null; h.forEach(function (val, k) { if (String(k).toLowerCase() === "authorization") v = val; }); return v; }
      if (Array.isArray(h)) { for (var i = 0; i < h.length; i++) if (String(h[i][0]).toLowerCase() === "authorization") return h[i][1]; return null; }
      for (var k in h) if (k.toLowerCase() === "authorization") return h[k];
    } catch (e) {}
    return null;
  }
  function grab(val) { if (val) { sawAuthHeader = true; harvest(val, "net"); } }
  try {
    var of = window.fetch;
    window.fetch = function (input, init) {
      try { grab(authFrom(init && init.headers) || authFrom(input && input.headers)); } catch (e) {}
      return of.apply(this, arguments);
    };
  } catch (e) {}
  try {
    var os = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      try { if (String(name).toLowerCase() === "authorization") grab(value); } catch (e) {}
      return os.apply(this, arguments);
    };
  } catch (e) {}

  // --- Synchronous sources ---
  try { harvest(document.documentElement && document.documentElement.innerHTML, "page"); } catch (e) {}
  try { for (var i = 0; i < localStorage.length; i++) harvest(localStorage.getItem(localStorage.key(i)), "ls"); } catch (e) {}
  try { for (var j = 0; j < sessionStorage.length; j++) harvest(sessionStorage.getItem(sessionStorage.key(j)), "ss"); } catch (e) {}
  try { harvest(document.cookie, "cookie"); } catch (e) {}
  if (live().length) { out(live()[0].t); return; }

  function finishUp() {
    var L = live();
    if (L.length) { out(L[0].t); return; }
    var lsKeys = []; try { for (var z = 0; z < localStorage.length; z++) lsKeys.push(localStorage.key(z)); } catch (e) {}
    var host = (typeof location !== "undefined" && location && location.hostname) || "";
    out({ ok: false, error: "Couldn't capture a token. On the sh.reddit.com FEED, scroll down a bit, then run this immediately.", host: host, jwtsFound: cands.length, anyExpired: cands.some(function (c) { return c.expired; }), sawAuthHeader: sawAuthHeader, idbNames: idbNames, lsKeys: lsKeys.slice(0, 40) });
  }
  try { setTimeout(finishUp, Math.max(50, DEADLINE - Date.now())); } catch (e) {}

  function scanDb(name) {
    return new Promise(function (resolve) {
      var settled = false; function done() { if (!settled) { settled = true; resolve(); } }
      var req; try { req = indexedDB.open(name); } catch (e) { done(); return; }
      req.onerror = done; req.onblocked = done;
      req.onsuccess = function () {
        var db = req.result;
        try {
          var stores = Array.prototype.slice.call(db.objectStoreNames);
          if (!stores.length) { db.close(); done(); return; }
          var tx = db.transaction(stores, "readonly"); var pending = stores.length;
          stores.forEach(function (s) {
            var rq; try { rq = tx.objectStore(s).getAll(); } catch (e) { if (--pending <= 0) { db.close(); done(); } return; }
            rq.onsuccess = function () { try { harvest(JSON.stringify(rq.result), "idb"); } catch (e) {} if (--pending <= 0) { db.close(); done(); } };
            rq.onerror = function () { if (--pending <= 0) { db.close(); done(); } };
          });
        } catch (e) { try { db.close(); } catch (_) {} done(); }
      };
    });
  }

  (async function () {
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    // Nudge the feed to fire an authenticated request, then watch for it.
    try { window.scrollTo(0, (document.documentElement.scrollHeight || document.body.scrollHeight || 3000)); } catch (e) {}
    try { window.dispatchEvent(new Event("scroll")); } catch (e) {}
    try {
      if (typeof indexedDB !== "undefined" && indexedDB.databases) {
        var dbs = await indexedDB.databases();
        for (var d = 0; d < dbs.length && !finished && Date.now() < DEADLINE - 400; d++) {
          var nm = dbs[d] && dbs[d].name; if (!nm) continue; idbNames.push(nm);
          await scanDb(nm); if (live().length) break;
        }
      }
    } catch (e) {}
    while (!finished && !live().length && Date.now() < DEADLINE - 100) { await sleep(120); }
    finishUp();
  })();
}
run();
