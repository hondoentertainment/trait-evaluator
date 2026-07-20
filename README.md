# Trait Evaluator

Reads a dating profile — typed or from a screenshot — scores each stated trait
for signal strength, keeps a blackjack-style running ±1 count, and delivers a
final **HIT / STAND / BUST** verdict. Powered by Grok via Vercel AI Gateway.

## Architecture

- `public/index.html` — the whole frontend (no build step).
- `api/evaluate.js` — a Vercel serverless function that proxies to Grok. Auth
  stays server-side (AI Gateway OIDC / `AI_GATEWAY_API_KEY` / `XAI_API_KEY`).

## Deploy

```bash
git push
npx vercel deploy --prod --yes
```

Production on Vercel uses project OIDC for AI Gateway automatically. For a
direct xAI key instead, set `XAI_API_KEY` in the Vercel project env vars.

## Local dev

```bash
vercel link
vercel env pull .env.local   # provisions VERCEL_OIDC_TOKEN
vercel dev                   # serves frontend + /api/evaluate
```

## Notes

- Uploaded images are downscaled to 1400px and re-encoded as JPEG in the browser
  before upload, to keep request size down.
- The serverless body limit is raised to 8 MB in `api/evaluate.js` to fit base64
  images.
