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
