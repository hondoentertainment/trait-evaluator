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
| `/compare` | Head-to-head (`?a=&b=`, `?asid=&bsid=`) + trait Δ |
| `/demo` | Cold-traffic demo + screenshot frames |
| `/s/:id` | Short share (bot OG HTML → crosswalk; humans 302) |
| `/?demo=1` | Auto-deal a sample shoe |

## Features

- **Accounts** — recovery-code sync; optional Clerk when `CLERK_PUBLISHABLE_KEY` is set
- **Short shares** — `/s/abc123`, 30-day expiry, revocable, dynamic OG (`/api/og`)
- **OCR loop** — crop + resize handles, confidence chips, re-OCR, edit before deal
- **Photo vibe** — optional second pass; OCR uses low image detail (cheaper tier)
- **Deal quality** — why-count chips, per-trait thumb memory, “deal this upgrade”
- **Compare** — Δ running / true + trait table; CTA from crosswalk
- **PWA** — installable, offline shell, image share-target
- **Cost controls** — client + server evaluate cache (text scores), rate limits
- **Telemetry** — anonymous events tune global Hi-Lo band suggestions

## Setup

```bash
vercel link
vercel env pull .env.local
vercel dev
```

Required env (see `.env.example`):

- `GITHUB_TOKEN` — fine-grained PAT with contents:write on the data repo (rotate if leaked)
- `DATA_REPO` — e.g. `hondoentertainment/profileread-data`
- AI Gateway OIDC (automatic on Vercel) or `AI_GATEWAY_API_KEY` / `XAI_API_KEY`

Optional:

- `CLERK_PUBLISHABLE_KEY` — enables Sign in on the home account bar
- Custom domain — Vercel → Project → Settings → Domains (not required for app function)

## Deploy

```bash
git push
npx vercel deploy --prod --yes
```

Live: https://trait-evaluator.vercel.app
