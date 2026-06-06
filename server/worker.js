/* ============================================================
 * Reddit Slideshow — server-side scrape QUEUE (Cloudflare Worker)
 * ------------------------------------------------------------
 * Scrapes Arctic Shift for a queue of subreddits ON A SCHEDULE, with your
 * phone closed. The browser app enqueues subs and later downloads the results.
 *
 * Why a Worker + Cron: GitHub Pages is static (no server), so the app can only
 * fetch while a tab is open. This Worker runs unattended.
 *
 * Free-tier reality this is built around:
 *   - ~50 subrequests per invocation  → each cron tick scans up to 40 pages
 *     (4000 posts) of ONE job, saves a cursor, and resumes next tick.
 *   - KV value max 25MB               → results are chunked (~1500 posts/key).
 *   - 1000 KV writes/day              → ~2 writes/tick; a 5-min cron ≈ 576/day max.
 *
 * Storage (KV binding `QUEUE`):
 *   index            → { jobs:[ {sub,after,limit,status,cursor,collected,chunks,
 *                                 createdAt,updatedAt,error} ] }
 *   chunk:<sub>:<n>  → JSON array of trimmed Reddit posts (t3 `data` objects)
 *
 * HTTP API (all mutating routes require header  X-Queue-Key: <QUEUE_KEY>):
 *   GET  /                      → health
 *   GET  /status                → the index (job list + progress)
 *   GET  /result?sub=NAME       → { sub, posts:[...] }  (all chunks concatenated)
 *   POST /enqueue  {subs, time, limit}   subs = "a,b,c" or ["a","b"]
 *   POST /run                   → process one slice now (same work as a cron tick)
 *   POST /remove   {sub}        → drop a job + its chunks
 *   POST /clear                 → drop everything
 * ============================================================ */

const ARCTIC = "https://arctic-shift.photon-reddit.com/api/posts/search";
const PAGES_PER_TICK = 40;     // < 50 subrequest free-tier cap, leaves headroom
const CHUNK_POSTS = 1500;      // ~2.5MB/value, well under the 25MB KV limit
const HARD_CAP = 500000;       // matches the app's "All" ceiling

const TIME_SPANS = { day: 86400, week: 604800, month: 2592000, year: 31536000 };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Queue-Key",
  "Access-Control-Max-Age": "86400",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });

// Keep only the fields the app's expandToSlides() needs — shrinks storage ~3x.
function trimPost(p) {
  return {
    id: p.id, title: p.title, permalink: p.permalink, subreddit: p.subreddit,
    created_utc: p.created_utc, score: p.score, url: p.url, domain: p.domain,
    is_gallery: p.is_gallery, is_video: p.is_video,
    gallery_data: p.gallery_data, media_metadata: p.media_metadata,
    media: p.media, secure_media: p.secure_media, preview: p.preview,
    crosspost_parent_list: p.crosspost_parent_list,
  };
}

function normSub(s) {
  return String(s || "").trim().replace(/^\/?(r\/)?/i, "").replace(/[\s+].*$/, "").toLowerCase();
}

async function getIndex(env) {
  const raw = await env.QUEUE.get("index");
  return raw ? JSON.parse(raw) : { jobs: [] };
}
async function putIndex(env, idx) {
  await env.QUEUE.put("index", JSON.stringify(idx));
}

// Fetch one Arctic Shift page with a tiny retry (transient 422/5xx).
async function arcticPage(params) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(ARCTIC + "?" + params.toString(), { headers: { Accept: "application/json" } });
    if (r.status === 400) return { stop: true, data: [] };       // bad param → give up on this job
    if (!r.ok) { if (attempt === 3) return { retry: true, data: [] }; await sleep(400 * attempt); continue; }
    const j = await r.json().catch(() => ({}));
    if (j && j.error) return { stop: true, data: [] };
    return { data: Array.isArray(j.data) ? j.data : [] };
  }
  return { retry: true, data: [] };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Do ONE slice of work: advance the first unfinished job by up to PAGES_PER_TICK
// pages, store the posts as a new chunk, and persist progress. Returns a summary.
async function processSlice(env) {
  const idx = await getIndex(env);
  const job = idx.jobs.find((j) => j.status === "pending" || j.status === "running");
  if (!job) return { idle: true };

  job.status = "running";
  job.updatedAt = Date.now();
  let before = job.cursor || Math.floor(Date.now() / 1000) + 1;
  const cap = job.limit > 0 ? Math.min(job.limit, HARD_CAP) : HARD_CAP;
  const fresh = [];
  let pages = 0, finished = false;

  while (pages < PAGES_PER_TICK && (job.collected + fresh.length) < cap) {
    const params = new URLSearchParams({ subreddit: job.sub, limit: "100", sort: "desc", before: String(before) });
    if (job.after > 0) params.set("after", String(job.after));
    const res = await arcticPage(params);
    pages++;
    if (res.stop) { finished = true; break; }
    if (res.retry) { break; }                 // transient — keep cursor, resume next tick
    const batch = res.data;
    if (!batch.length) { finished = true; break; }
    for (const p of batch) fresh.push(trimPost(p));
    const last = batch[batch.length - 1]?.created_utc;
    if (batch.length < 100 || !last) { finished = true; break; }
    before = last;
  }

  if (fresh.length) {
    await env.QUEUE.put(`chunk:${job.sub}:${job.chunks}`, JSON.stringify(fresh));
    job.chunks += 1;
    job.collected += fresh.length;
  }
  job.cursor = before;
  if (finished || job.collected >= cap) { job.status = "done"; job.finishedAt = Date.now(); }
  job.updatedAt = Date.now();
  await putIndex(env, idx);
  return { sub: job.sub, pages, added: fresh.length, collected: job.collected, status: job.status };
}

async function readResult(env, sub) {
  const idx = await getIndex(env);
  const job = idx.jobs.find((j) => j.sub === sub);
  if (!job) return null;
  const posts = [];
  for (let n = 0; n < job.chunks; n++) {
    const raw = await env.QUEUE.get(`chunk:${sub}:${n}`);
    if (raw) { const arr = JSON.parse(raw); for (const p of arr) posts.push(p); }
  }
  return { sub, status: job.status, collected: job.collected, posts };
}

async function removeJob(env, sub) {
  const idx = await getIndex(env);
  const job = idx.jobs.find((j) => j.sub === sub);
  if (job) { for (let n = 0; n < job.chunks; n++) await env.QUEUE.delete(`chunk:${sub}:${n}`); }
  idx.jobs = idx.jobs.filter((j) => j.sub !== sub);
  await putIndex(env, idx);
  return idx;
}

async function clearAll(env) {
  const idx = await getIndex(env);
  for (const j of idx.jobs) for (let n = 0; n < j.chunks; n++) await env.QUEUE.delete(`chunk:${j.sub}:${n}`);
  await putIndex(env, { jobs: [] });
  return { jobs: [] };
}

function authed(req, env) {
  if (!env.QUEUE_KEY) return true;                       // no key configured → open
  return req.headers.get("X-Queue-Key") === env.QUEUE_KEY;
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/") return json({ ok: true, service: "reddit-slideshow queue", jobs: (await getIndex(env)).jobs.length });

    const mutating = req.method === "POST";
    if ((mutating || path === "/status" || path === "/result") && !authed(req, env)) {
      return json({ error: "unauthorized — set the queue key in the app to match the Worker's QUEUE_KEY" }, 401);
    }

    try {
      if (path === "/status" && req.method === "GET") return json(await getIndex(env));

      if (path === "/result" && req.method === "GET") {
        const sub = normSub(url.searchParams.get("sub"));
        const r = await readResult(env, sub);
        return r ? json(r) : json({ error: "no such job" }, 404);
      }

      if (path === "/enqueue" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        let subs = body.subs;
        if (typeof subs === "string") subs = subs.split(/[,\s]+/);
        subs = [...new Set((subs || []).map(normSub).filter(Boolean))];
        if (!subs.length) return json({ error: "no subreddits given" }, 400);
        const after = TIME_SPANS[body.time] ? Math.floor(Date.now() / 1000) - TIME_SPANS[body.time] : 0;
        const limit = Math.max(0, parseInt(body.limit, 10) || 0);
        const idx = await getIndex(env);
        for (const sub of subs) {
          await removeJobChunks(env, idx, sub);                       // re-enqueue = fresh scan
          const existing = idx.jobs.find((j) => j.sub === sub);
          const job = existing || {};
          Object.assign(job, { sub, after, limit, status: "pending", cursor: null, collected: 0, chunks: 0, error: null, createdAt: Date.now(), updatedAt: Date.now(), finishedAt: null });
          if (!existing) idx.jobs.push(job);
        }
        await putIndex(env, idx);
        return json(idx);
      }

      if (path === "/run" && req.method === "POST") return json(await processSlice(env));
      if (path === "/remove" && req.method === "POST") { const b = await req.json().catch(() => ({})); return json(await removeJob(env, normSub(b.sub))); }
      if (path === "/clear" && req.method === "POST") return json(await clearAll(env));

      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },

  // Cron entry point — one slice per tick so we never blow the subrequest cap.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(processSlice(env));
  },
};

// Helper used by /enqueue to wipe an old job's chunks before a fresh scan.
async function removeJobChunks(env, idx, sub) {
  const job = idx.jobs.find((j) => j.sub === sub);
  if (job) for (let n = 0; n < job.chunks; n++) await env.QUEUE.delete(`chunk:${sub}:${n}`);
}
