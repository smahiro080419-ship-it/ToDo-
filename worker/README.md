# Todo Push Worker

Cloudflare Worker that stores synced todos + push subscriptions in KV and
sends a Web Push notification when a task's due time crosses its chosen
notify offset (1h / 2h / 3h / 1d / daily).

This machine doesn't have Node.js installed, so these steps must be run on
a machine that does (Node 18+).

## 1. Install dependencies

```
cd worker
npm install
```

## 2. Generate VAPID keys

```
npx web-push generate-vapid-keys
```

Copy the **Public Key** into `script.js` (`VAPID_PUBLIC_KEY` constant) at
the repo root. Keep the **Private Key** secret — it only goes into the
Worker secret in step 4.

## 3. Create the KV namespace

```
npx wrangler login
npx wrangler kv namespace create TODO_KV
```

Paste the returned `id` into `worker/wrangler.toml` under `[[kv_namespaces]]`.

## 4. Set secrets

```
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT        # e.g. mailto:you@example.com
npx wrangler secret put ALLOWED_ORIGIN       # e.g. https://smahiro080419-ship-it.github.io
```

## 5. Deploy

```
npx wrangler deploy
```

Copy the printed `https://todo-push-worker.<subdomain>.workers.dev` URL into
`script.js` (`WORKER_URL` constant) at the repo root, then commit and push
`index.html`, `script.js`, `sw.js`, and `manifest.json`.

## Notes

- iOS Safari only supports Web Push for sites added to the Home Screen
  (Add to Home Screen, then open the app from that icon) on iOS 16.4+.
  Android Chrome supports it directly in the browser tab.
- The cron trigger runs every minute (`* * * * *` in `wrangler.toml`).
- Each browser/device gets its own random `clientId` (stored in
  localStorage) and its own todo list + subscription in KV — there's no
  cross-device sync, each device notifies itself based on what it last
  synced.
