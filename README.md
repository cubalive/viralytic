# Viralytic

> _Where data meets virality. Built for founders who sell._

Multi-tenant SaaS that turns any product link into a viral TikTok video — script, voice, visuals, assembly, and publish — in under 10 minutes.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000.svg)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E.svg)](https://supabase.com)

---

## What makes Viralytic different

Most "AI video generators" hand a model one prompt and pray. Viralytic doesn't.

**The Viralytic Edge — ensemble script generation:**

1. **Claude Opus + GPT-4o** each write 3 script variants in parallel, using complementary frameworks (PAS, AIDA, BAB)
2. A **Judge agent** scores all 6 candidates on 6 weighted dimensions against your brand's historical winners and your niche's current viral hits
3. The top 3 reach you with a transparent score breakdown

Combined with:
- 🔥 **Trending Discovery** — 5 sources aggregated every 12h (TikTok Creative Center, hashtags, Google Trends, Reddit, Amazon Movers)
- 🎙️ **ElevenLabs voice cloning** with SSML emotion peaks
- 🎬 **Remotion-rendered captions** in TikTok-native style
- 📈 **Self-reinforcing learning loop** — winners get embedded and feed the next generation

---

## Quick start

```bash
# 1. Install
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Fill in all required keys (Supabase, Redis, Anthropic, OpenAI, ElevenLabs, fal, ...)

# 3. Apply DB schema
# Open supabase.com → SQL Editor → paste & run:
cat infra/supabase/migrations/001_init.sql

# 4. Generate DB types
pnpm db:types

# 5. Run dev
pnpm web:dev      # Next.js dashboard on :3000
pnpm workers:dev  # BullMQ workers (separate terminal)
```

---

## Architecture

See [`CLAUDE.md`](./CLAUDE.md) for full architecture and conventions.

```
apps/
  web/        Next.js 15 dashboard (App Router)
  workers/    BullMQ workers, one per pipeline step

packages/
  ai/            Agents + prompts (the brain)         @viralytic/ai
  integrations/  ElevenLabs, fal, revid, TikTok       @viralytic/integrations
  scrapers/      Product scrapers + trending          @viralytic/scrapers
  video/         Remotion compositions                @viralytic/video
  db/            Supabase client + types              @viralytic/db
  shared/        Zod schemas + constants              @viralytic/shared
```

---

## The 8-stage pipeline

```
00 ◯ Trending Discovery (cron 12h)
01 → Product Analysis     (scrape + LLM pain points)
02 → Competitor Research  (top virals + embeddings)
03 → Script Generation    (Claude + GPT + Judge ensemble)
04 → Voice Synthesis      (ElevenLabs SSML)
05 → Visual Generation    (Flux Pro + Kling) OR Shot List
06 → Video Assembly       (Remotion render)
07 → Publishing           (TikTok Content Posting API)
08 ◯ Metrics Collection   (cron 6h, feeds learning loop)
```

Each stage is an independent BullMQ queue. Workers are stateless and idempotent. Scale each queue independently based on load.

---

## Three creation modes

| Mode | What you do | What Viralytic does | Time |
|---|---|---|---|
| **AI Full** | Paste a URL, approve a script | Everything else | ~10 min |
| **Yo grabo** | Film 9 shots from a cinematic shot list | Script, voice, assembly | ~20 min |
| **Híbrido** | Upload key clips | Script, voice, B-roll AI, assembly | ~15 min |

---

## Working with Claude Code

This repo is built for [Claude Code](https://claude.com/claude-code). Open the folder, and Claude will read [`CLAUDE.md`](./CLAUDE.md) for complete context.

Try prompts like:
- _"Read CLAUDE.md. Implement the missing competitor-research worker following the established pattern."_
- _"Add Whisper transcription for caption timing — look at how voice-synthesis worker integrates ElevenLabs as your template."_
- _"Wire up the Stripe webhook for subscription billing using the PLAN_QUOTAS in shared/constants."_

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, App Router, RSC, Server Actions |
| Database | Supabase (Postgres, Auth, Storage, pgvector, RLS) |
| Queues | BullMQ + Upstash Redis |
| AI Reasoning | Anthropic Claude Opus 4.7 + OpenAI GPT-4o |
| Voice | ElevenLabs Multilingual v2 |
| Visual | fal.ai (Flux Pro, Kling 1.5), revid.ai |
| Rendering | Remotion (React-based, Lambda-ready) |
| Publishing | TikTok Content Posting API |
| Billing | Stripe Subscriptions |
| Scraping | Apify, ScrapingBee |

---

## Pricing tiers (defined in `packages/shared/src/constants.ts`)

| Plan | Videos/mo | Voices | TikTok accounts | Watermark |
|---|---|---|---|---|
| Free | 3 | 1 | 1 | yes |
| Pro · $49/mo | 50 | 1 | 1 | no |
| Agency · $299/mo | 500 | 10 | 10 | no |
| Enterprise | unlimited | unlimited | unlimited | no |

---

## License

Proprietary. Built by UCM — United Care Mobility.

© 2026 Viralytic. All rights reserved.
