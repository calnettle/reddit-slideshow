# OAuth proxy (Cloudflare Worker) — for full-media saved posts

**File: [`oauth-proxy.js`](oauth-proxy.js).** Reddit edge-blocks `oauth.reddit.com`
from non-Reddit websites, so the slideshow can't call the API directly. This
Worker makes that call **server-side** and returns it with CORS, so the app can
pull your saved posts **with galleries + videos**, no time limit, on the API's
high rate limits.

## Deploy (~5 min, no KV/secret needed)

```sh
cd server
wrangler deploy oauth-proxy.js --name reddit-oauth
```
…or in the Cloudflare dashboard: **Create Worker → paste `oauth-proxy.js` → Deploy.**

It prints a URL like `https://reddit-oauth.<you>.workers.dev`. In the slideshow:
**Option A → "Or paste an access token" → Worker proxy URL** → paste it → **Save**.

## Use it
1. Grab a fresh token with the **Reddit Token** shortcut on `sh.reddit.com`
   (see `../tools/README.md`).
2. In the app: paste the token → **Use this token** → **Fetch saved posts**.
3. The app pulls everything via your Worker — galleries and videos included.
   Tokens last ~1h; grab a fresh one per session.

The Worker only forwards to `oauth.reddit.com` and only with the token you send
in the `X-Reddit-Token` header — it stores nothing.

---

# Server-side scrape queue (Cloudflare Worker)

Scrapes a queue of subreddits from Arctic Shift **on a schedule, with your phone
closed**. The slideshow app enqueues subs and later downloads the results.

It's a separate Worker from your existing `reddit-proxy` — deploy it on its own
subdomain (e.g. `reddit-queue.cal-12d.workers.dev`). You can later fold the
`fetch` routes into the proxy worker if you'd rather run one Worker.

## One-time setup (~5 min)

You need the Cloudflare CLI (`npm i -g wrangler`) and to be logged in
(`wrangler login`).

```sh
cd server

# 1. Create the KV namespace, then paste its id into wrangler.toml (QUEUE binding)
wrangler kv namespace create QUEUE

# 2. Set a shared secret — any random string. You'll paste the same value
#    into the app's "Queue key" field so only you can use the queue.
wrangler secret put QUEUE_KEY

# 3. Deploy (this also registers the */5 cron trigger)
wrangler deploy
```

`wrangler deploy` prints your Worker URL, e.g.
`https://reddit-queue.cal-12d.workers.dev`. In the app's **Queue (server-side)**
panel, paste that URL + your `QUEUE_KEY`, then add subreddits.

> Dashboard alternative: create a Worker, paste `worker.js`, bind a KV namespace
> as `QUEUE`, add a Variable `QUEUE_KEY` (encrypted), and a Trigger → Cron
> `*/5 * * * *`.

## How it works

- **Cron tick (every 5 min):** advances the first unfinished job by up to 40
  Arctic Shift pages (4000 posts), saves a cursor, resumes next tick. One job at
  a time, so a 50k scan finishes unattended in ~25 ticks (~2 h).
- **Storage (KV):** `index` holds the job list + progress; results are stored in
  `chunk:<sub>:<n>` keys (~1500 trimmed posts each, under KV's 25MB/value limit).
- **The app** polls `/status`, and when a job is `done` (or partway) pulls
  `/result?sub=…` and ingests the posts through the normal media pipeline (so
  galleries, Redgifs, dead-image skipping etc. all still apply). Playback "Most
  upvotes" still ranks by score, so the Worker just collects newest-first.

## API (all POST routes + /status + /result require `X-Queue-Key: <QUEUE_KEY>`)

| Route | Method | Body | Purpose |
|-------|--------|------|---------|
| `/` | GET | – | health check |
| `/status` | GET | – | job list + progress |
| `/result?sub=NAME` | GET | – | `{sub, posts:[...]}` |
| `/enqueue` | POST | `{subs, time, limit}` | add jobs (`subs`="a,b,c" or `["a","b"]`) |
| `/run` | POST | – | process one slice now (the app's "Process now") |
| `/remove` | POST | `{sub}` | drop a job + its chunks |
| `/clear` | POST | – | drop everything |

## Free-tier limits this respects

- ≤40 subrequests/tick (cap is 50).
- ~2 KV writes/tick → a `*/5` cron is ≈576 writes/day (cap 1000).
- KV value ≤25MB → results chunked at 1500 posts.

Queue a lot of huge "All" scans at once and you can still bump the daily KV write
cap — space big jobs out, or bump the cron to `*/2` only while actively filling.
