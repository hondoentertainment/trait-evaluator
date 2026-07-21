# Profile Read

Deal dating-profile traits like a blackjack shoe — Hi-Lo running count, true
count, **HIT / STAND / BUST** — then open a shareable value crosswalk.

Powered by Grok via Vercel AI Gateway. Deals sync through a private GitHub data
repo (`DATA_REPO` + `GITHUB_TOKEN`).

## Pages

| Path | Purpose |
|------|---------|
| `/` | Home showcase + shoe dealer (crop → OCR → edit → animated deal) |
| `/crosswalk` | Value grid (`?id=`, `?d=`, `?sid=`) |
| `/compare` | Head-to-head two shoes |
| `/s/:id` | Short server share link |

## Features

- **Accounts** — recovery code syncs shoes across devices; optional Clerk when `CLERK_PUBLISHABLE_KEY` is set
- **Short shares** — `/s/abc123` via GitHub-backed store
- **OCR loop** — crop, confidence chips, re-OCR, edit before deal
- **Photo vibe** — optional second pass on lifestyle/face cues
- **Compare** — Δ running / true count between two saved shoes
- **PWA** — installable, offline shell, share-target entry
- **Telemetry** — anonymous events tune global Hi-Lo band suggestions

## Setup

```bash
vercel link
vercel env pull .env.local
vercel dev
```

Required env (already wired for this project):

- `GITHUB_TOKEN` — write access to the data repo
- `DATA_REPO` — e.g. `hondoentertainment/profileread-data`
- AI Gateway OIDC (automatic on Vercel) or `AI_GATEWAY_API_KEY` / `XAI_API_KEY`

Optional:

- `CLERK_PUBLISHABLE_KEY` — enables Sign in on the home account bar
- Custom domain — Vercel → Project → Settings → Domains

## Deploy

```bash
git push
npx vercel deploy --prod --yes
```
