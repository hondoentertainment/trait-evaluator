# Profile Read

Deal dating-profile traits like a blackjack shoe — Hi-Lo running count, true
count, **HIT / STAND / BUST** — then open a shareable value crosswalk.

**Live:** https://trait-evaluator.vercel.app  
**Demo (pin this):** https://trait-evaluator.vercel.app/demo

## Pages

| Path | Purpose |
|------|---------|
| `/` | Home + dealer (`?demo=1` auto-deal) |
| `/crosswalk` | Value grid + PNG export |
| `/compare` | Head-to-head + trait Δ |
| `/landing?sid=` | Verdict-first share landing |
| `/demo` | Cold-traffic / screenshot frames |
| `/admin` | Telemetry ops (needs `ADMIN_SECRET`) |
| `/s/:id` | Short share → landing (bots get OG) |

## Features

- Named shoes, Web Share, PWA install prompt, daily free-deal cap (12)
- Edit & re-score without full OCR; upgrade re-deal; why-count chips
- Short shares with expiry/revoke + dynamic OG
- Evaluate cache + OCR/score tiers
- A/B home copy (`profileRead.ab.v1`)

## Setup

```bash
vercel link
vercel env pull .env.local
vercel dev
npm run smoke
```

### Env

| Var | Required | Notes |
|-----|----------|-------|
| `GITHUB_TOKEN` | yes | Fine-grained PAT; rotate if exposed |
| `DATA_REPO` | yes | e.g. `hondoentertainment/profileread-data` |
| AI Gateway / `XAI_API_KEY` | yes | OIDC on Vercel, or xAI key |
| `CLERK_PUBLISHABLE_KEY` | no | Enables Sign in |
| `ADMIN_SECRET` | no | Locks `/api/admin` |

### Custom domain

`profileread.app` is available (~$9.99/yr on Vercel). Purchase + attach:

https://vercel.com/domains/search?q=profileread.app

Then Project → Settings → Domains.

### Clerk

1. Create app at https://dashboard.clerk.com (or Vercel Marketplace → Clerk)  
2. Copy publishable key → `vercel env add CLERK_PUBLISHABLE_KEY`  
3. Redeploy — Sign in appears on the home account bar.

## Deploy

```bash
git push
npx vercel deploy --prod --yes
npm run smoke
```
