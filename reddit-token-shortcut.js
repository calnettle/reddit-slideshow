/* ============================================================
 * Reddit access TOKEN grabber  (paste into an Apple Shortcut)
 * ------------------------------------------------------------
 * Reads your logged-in Reddit web session's OAuth bearer token and
 * returns it, so you can paste it into the slideshow (Option A) and
 * pull your saved posts (galleries + videos) via your Worker proxy.
 *
 * New Reddit (shreddit) keeps its session — including the token — in
 * IndexedDB, so this scans the page, storage, cookies AND IndexedDB.
 * Async, but capped at ~1.7s to stay inside the action's time limit.
 *
 *   ➜ Run it on the FEED at  https://sh.reddit.com  (signed in).
 *     On success the result IS the token (eyJ…) — copy it into the app.
 *     On failure it returns {ok:false,…} with what it saw (jwtsFound,
 *     idbNames, lsKeys) — paste that back.
 * ============================================================ */
function run() {
  var DEADLINE = Date.now() + 1700;
  var finished = false;
  function out(o) { if (finished) return; finished = true; try { completion(typeof o === "string" ? o : JSON.stringify(o)); } catch (e) {} }
  function decode(jwt) { try { var p = jwt.split("."); if (p.length !== 3) return null; var b = p[1].replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "="; return JSON.parse(atob(b)); } catch (e) { return null; } }

  var now = Math.floor(Date.now() / 1000);
  var rx = /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g;
  var seenAll = {}, cands = [], idbNames = [];
  function harvest(text, label) {
    if (!text) return;
    rx.lastIndex = 0; var m;
    while ((m = rx.exec(text))) {
      var t = m[0]; if (seenAll[t]) continue; seenAll[t] = 1;
      var pl = decode(t); if (!pl) continue;
      var expired = !!(pl.exp && pl.exp < now);
      var tokenish = !!(pl.scope || pl.scopes || pl.scp || pl.client_id || pl.cid || pl.aud);
      cands.push({ t: t, expired: expired, tokenish: tokenish, hasSub: !!pl.sub, len: t.length });
    }
  }
  function live() {
    return cands.filter(function (c) { return !c.expired; })
      .sort(function (a, b) { return (b.tokenish - a.tokenish) || (b.hasSub - a.hasSub) || (b.len - a.len); });
  }

  // --- synchronous sources ---
  try { harvest(document.documentElement && document.documentElement.innerHTML, "page"); } catch (e) {}
  try { for (var i = 0; i < localStorage.length; i++) harvest(localStorage.getItem(localStorage.key(i)), "ls"); } catch (e) {}
  try { for (var j = 0; j < sessionStorage.length; j++) harvest(sessionStorage.getItem(sessionStorage.key(j)), "ss"); } catch (e) {}
  try { var gs = [window.___r, window.__r, window.__reddit, window.__SHREDDIT_SESSION__, window.__reddit_session]; for (var x = 0; x < gs.length; x++) if (gs[x]) harvest(JSON.stringify(gs[x]), "global"); } catch (e) {}
  try { harvest(document.cookie, "cookie"); } catch (e) {}

  if (live().length) { out(live()[0].t); return; }   // found without touching IndexedDB

  function finishUp() {
    var L = live();
    if (L.length) { out(L[0].t); return; }
    var lsKeys = []; try { for (var z = 0; z < localStorage.length; z++) lsKeys.push(localStorage.key(z)); } catch (e) {}
    var host = (typeof location !== "undefined" && location && location.hostname) || "";
    var msg = host === "old.reddit.com"
      ? "You're on OLD Reddit (no token). Open the feed at https://sh.reddit.com, signed in."
      : cands.length ? "Found only EXPIRED tokens — pull-to-refresh sh.reddit.com and run it again."
        : "No token found. Run it on the FEED at https://sh.reddit.com, signed in (scroll the feed once first).";
    out({ ok: false, error: msg, host: host, jwtsFound: cands.length, anyExpired: cands.some(function (c) { return c.expired; }), idbNames: idbNames, lsKeys: lsKeys.slice(0, 40) });
  }

  // --- IndexedDB (where shreddit keeps the session) ---
  try { setTimeout(finishUp, Math.max(50, DEADLINE - Date.now())); } catch (e) {}  // backstop within the time limit

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
          var tx = db.transaction(stores, "readonly");
          var pending = stores.length;
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
    try {
      if (typeof indexedDB !== "undefined" && indexedDB.databases) {
        var dbs = await indexedDB.databases();
        for (var d = 0; d < dbs.length && !finished; d++) {
          if (Date.now() > DEADLINE - 150) break;
          var nm = dbs[d] && dbs[d].name; if (!nm) continue;
          idbNames.push(nm);
          await scanDb(nm);
          if (live().length) break;
        }
      }
    } catch (e) {}
    finishUp();
  })();
}
run();
