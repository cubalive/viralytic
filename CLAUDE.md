# Viralytic — Master Context

> **Read this file in full at the start of every session.**
> _Where data meets virality. Built for founders who sell._

## 🎯 Mission

**Viralytic** is a multi-tenant SaaS that turns a product link — or a trending product discovered automatically — into a viral TikTok video optimized for **immediate conversion**, in under 10 minutes, autonomously.

We are not "another AI video generator." We are an **intelligence platform**: we analyze what's working, we ensemble two frontier models with a Judge to write what converts, and we learn from every video we ship.

### Three creation modes
1. **`ai_full`** — System generates everything (script → voice → AI images/videos → assembly).
2. **`user_filmed`** — System gives the user a cinematic shot list + records voiceover, user uploads clips.
3. **`hybrid`** — User clips + AI-generated B-roll where needed.

## 🏛️ Architectural principles

1. **Stateless workers, stateful DB.** Every step writes its output to Supabase. Workers are interchangeable.
2. **Queues over orchestration.** Each pipeline step is a BullMQ queue. The orchestrator only schedules the next step on success.
3. **Idempotent everything.** Every worker checks `video_jobs.current_step` before running. Re-running a step is safe.
4. **Multi-tenant from day 1.** Every query MUST filter by `organization_id`. RLS in Supabase is the safety net.
5. **Prompts are versioned text files** (`packages/ai/src/prompts/*.md`). Never inline a prompt in TS.
6. **Costs are tracked per job.** Every external call writes to `usage_events`.
7. **Analytics-first.** The brand is `Viralytic` — every decision is data-informed. Reflect that in copy, in metrics surfaced to users, in the dashboard.

## 📦 Monorepo layout

```
apps/
  web/        Next.js 15 dashboard
  workers/    BullMQ workers

packages/
  db/           Supabase client + types        @viralytic/db
  shared/       Zod schemas, constants         @viralytic/shared
  ai/           Agents + prompts (the brain)   @viralytic/ai
  integrations/ ElevenLabs, fal, revid, TikTok @viralytic/integrations
  scrapers/     Product + trending discovery   @viralytic/scrapers
  video/        Remotion compositions          @viralytic/video
  ui/           Shared shadcn components       @viralytic/ui

infra/
  supabase/migrations/   SQL migrations
```

## 🔄 The pipeline (8 steps)

| # | Queue                   | Worker                       | Output                                |
|---|-------------------------|------------------------------|---------------------------------------|
| 0 | `trending-discovery`    | cron, every 12h              | `trending_products`                   |
| 1 | `product-analysis`      | scrape + LLM pain points     | `products.pain_points`                |
| 2 | `competitor-research`   | viral TikToks + embeddings   | `competitor_videos`                   |
| 3 | `script-generation`     | Claude+GPT+Judge ensemble    | 3 ranked `scripts`                    |
| 4 | `voice-synthesis`       | ElevenLabs SSML              | `assets` type `voice_audio`           |
| 5 | `visual-generation`     | fal Flux+Kling / shot list   | `assets` ai_image/ai_video            |
| 6 | `video-assembly`        | Remotion render              | `assets` type `final_video`           |
| 7 | `publishing`            | TikTok Content Posting API   | `publications`                        |
| 8 | `metrics-collection`    | cron, every 6h               | `metrics` rows                        |

Orchestrator (`apps/workers/src/lib/orchestrator.ts`) is thin — on worker success it schedules the next step. Workers never call other workers directly.

## 🧠 The AI brain — the Viralytic edge

For script generation we run **Claude Opus + GPT-4o in parallel** → both return 3 variants → **Judge agent (Claude)** scores all 6 on 6 weighted dimensions against historical winners + niche virals → top 3 reach the user.

This ensemble pattern consistently beats single-model output and is core IP.

| Agent             | Model                  | Purpose                                            |
|-------------------|------------------------|----------------------------------------------------|
| `product-analyzer`| Claude Opus 4.7        | Pain points & USPs from reviews                    |
| `trend-analyzer`  | Claude Opus 4.7        | Decode competitor TikToks → winning patterns       |
| `copywriter`      | Claude + GPT-4o        | Generate 3 script variants each (parallel)         |
| `judge`           | Claude Opus 4.7 (0.2)  | Rank 6 candidates → top 3                          |
| `visual-prompter` | Claude Opus 4.7        | Script → fal/revid prompts                         |
| `shot-list`       | Claude Opus 4.7        | Cinematic filming guide for user_filmed mode       |

## 🎨 Brand identity

- **Name:** Viralytic
- **Wordmark:** lowercase `viralytic`, Fraunces variable serif (italic on "lytic")
- **Colors:** electric magenta `#FF0066`, plasma cyan `#00E5FF`, neon `#39FF14`, graphite `#0B0B0F`
- **Voice:** technical, confident, data-driven, never hype-y
- **Pillars:**
  - Intelligence over noise — we analyze, then generate
  - Conversion > views — virality without sales is vanity
  - Speed without compromise — 10 min, hand-grade output

## 🎨 Code conventions

- TypeScript strict, no `any`, use `unknown` + zod
- Zod schemas in `packages/shared` = single source of truth
- No magic numbers, all in `shared/constants.ts`
- Errors extend `BaseError` with `code`, `cause`, `context`
- Logging via `logger` from `shared/logger.ts`, never `console.log` in workers
- Imports via `@viralytic/*` aliases
- Server Actions: validate with Zod, wrap in `withOrganization()`

## 🚦 Definition of Done

1. Zod schema in `packages/shared`
2. Implementation in the right package (not in `apps/web`)
3. Unit test for happy path
4. Error case handled with typed error
5. Cost recorded via `recordUsage()`
6. Dashboard surfaces the result

## 🔥 Conversion-tuned defaults — don't change without A/B data

- Hook: ≤ 3s, ≤ 12 words
- Video: 18-32s optimal (25s sweet spot)
- Captions: ALL CAPS, 7-9 chars/line, 2-line max
- Font: TikTok Sans Bold / Proxima Nova Black
- Caption: white, 6px black stroke, drop shadow
- Cuts: every 1.2-2.0s (dopamine cycle)
- CTA: last 4s + pinned comment

## 🧪 When in doubt

1. Read this file again
2. Check relevant prompt in `packages/ai/src/prompts/`
3. Check `shared/src/constants.ts` for tuned values
4. Look at existing worker pattern before writing new
5. Ask: multi-tenant safe? costs money? idempotent?
