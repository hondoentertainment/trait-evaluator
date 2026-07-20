# Trait Evaluator (Profile Read)

Reads a dating profile — typed or from a cropped screenshot — scores each stated
trait for signal strength, keeps a blackjack-style Hi-Lo running count, and
delivers a final **HIT / STAND / BUST** verdict. Page 2 is a shareable value
crosswalk. Powered by Grok via Vercel AI Gateway.

## Pages

- `/` — home showcase + shoe dealer (crop → OCR extract → edit → animated deal)
- `/crosswalk` — value grid (`?id=` for saved deals, `?d=` for share payloads)

## Architecture

- `public/index.html` + `public/js/app.js` — page 1
- `public/crosswalk.html` + `public/js/crosswalk-page.js` — page 2
- `public/js/store.js` — localStorage persistence + share encoding
- `public/js/hilo.js` — Hi-Lo bands, feedback tuning, verdicts
- `api/evaluate.js` — Grok proxy with rate limits (`extract` / `score` modes)

## Deploy

```bash
git push
npx vercel deploy --prod --yes
```

### Custom domain

Vercel dashboard → Project → Settings → Domains → add your domain and follow DNS.

### Auth

Production uses project OIDC for AI Gateway. Optionally set `AI_GATEWAY_API_KEY`
or `XAI_API_KEY` in project env vars.

## Local dev

```bash
vercel link
vercel env pull .env.local
vercel dev
```

## Notes

- Deals persist in the browser (`localStorage`) and can be shared via URL.
- Thumbs on a trait nudge personal Hi-Lo bands (score thresholds).
- API: ~40 req/hour/IP (best-effort) + client-side 30/hour guard.
- Screenshots are cropped in-browser, downscaled to 1400px JPEG before upload.
