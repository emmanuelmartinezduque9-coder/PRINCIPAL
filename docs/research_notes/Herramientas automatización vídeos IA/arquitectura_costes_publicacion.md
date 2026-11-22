# Architecture, LLM cost engineering and publishing for an AI-video web app (state: 22 Nov 2026)

> Research-method note for the report writer. Official pages that could be read in full this session: Anthropic pricing docs, Anthropic help-center article 15036540, Anthropic "Building effective agents". The following hosts were NOT reachable from the research sandbox (network allowlist), so their facts come from search-result summaries of those pages, not full reads: `docs.railway.com`, `ai.google.dev`, `developers.facebook.com`, `developers.tiktok.com`, `www.upload-post.com`. Those items are marked "(search summary)". Vendor comparison blogs are marked as such. Any number marked "verify" should be re-checked on the vendor page before money is committed.

## 1. Cost engineering for LLM pipelines (caching, batch, tiering, token prices, workflows vs agents, subscription vs API)

### Takeaway
The $500/month is the cost of using a coding agent as the runtime: every order re-reads big rule files, writes throwaway scripts and loops. Moving to a deterministic workflow with 3-4 single, cached, structured LLM calls per video (breakdown, prompt writing, QC) puts LLM cost at roughly cents per video on the Claude API (see Inferences), and a multi-user backend must be billed through API keys (Claude Console or a cloud provider), not a Claude subscription.

### Cited Findings

**Claude API prices (USD per million tokens, official, read in full)**
- Claude Opus 5.5: $4 input / $20 output; cache write 5 min $5, 1 h $8; cache read $0.20. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Claude Sonnet 5.5: $2 input / $10 output; cache write 5 min $2.50, 1 h $4; cache read $0.10. Claude Sonnet 5: $2 / $10, cache read $0.20 (the planned rise to $3/$15 on 1 Sep 2026 was cancelled). — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Claude Haiku 5.5: $0.10 input / $0.50 output for prompts up to 100,000 tokens; $0.50 / $2.50 for prompts over 100,000 tokens (prompt length counts cache reads and writes); cache read $0.01. Claude Haiku 4.5: $1 / $5. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Top tier: Claude Fable 5.2 $8 / $40, cache read $0.20. Older Opus 4.5-5: $5 / $25. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Prompt caching multipliers: 5-minute write 1.25x base input, 1-hour write 2x, cache hit 0.1x on most models (0.05x on Opus 5.5 / Sonnet 5.5, 0.025x on Fable 5.1/5.2). Break-even after one read (5 min) or two reads (1 h). Automatic caching is enabled with one top-level `cache_control` field. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Batch API: 50% off input and output (e.g. Sonnet 5.5 $1 / $5, Opus 5.5 $2 / $10, Haiku 5.5 $0.05 / $0.25); batch and caching discounts stack. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Claude 4.7+ models use a newer tokenizer producing about 30% more tokens for the same text; the 1M context window is at standard price on 4.6+ models except Haiku 5.5. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Tool overhead: about 286 system-prompt tokens when any tool is declared on the 5.5 models; web search $10 per 1,000 searches; web fetch no surcharge. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Claude Managed Agents: standard token rates plus $0.08 per session-hour while running; no batch discount. Official worked example: 1-hour Opus 5.5 session with 50k input / 15k output = $0.58, or $0.428 with 40k cached. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Anthropic's own cost guidance: Haiku for simple tasks, Sonnet for most production workloads, Opus for the most complex reasoning; implement caching; batch non-time-sensitive work. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)

**Gemini and OpenAI (search summaries only; conflicting snippets, verify)**
- Gemini 3.5 Flash on Vertex (global): $1.50 per M input (text/image/video/audio), cached input $0.15. Gemini 3.6/3.7 Flash: promotional $0.75 per M input through 31 Dec 2026, then $1.5 / $7.5 input/output from 1 Jan 2027. — [Vertex AI pricing (search summary)](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- Video input is tokenized at 258 tokens per second at 1 frame/second (figure from a Gemini 2.0-era page; not confirmed for current Flash models). — [Vertex AI pricing (search summary)](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- OpenAI: GPT-5 (2025) launched at $1.25 input / $10 output, cached input $0.125. — [TechCrunch](https://techcrunch.com/2025/08/08/openai-priced-gpt-5-so-low-it-may-spark-a-price-war)
- OpenAI snapshots for newer models conflict: GPT-5.5 shown as $2.50 / $15 (cached $0.25) on one official-pricing snapshot and $5 / $30 in a third-party guide; GPT-5.6 Sol shown as $4 input / $20 output, cached $0.40, with promotional pricing stated "at least through November 21, 2026" (already past). Batch is 50% off. — [OpenAI pricing (search summary)](https://developers.openai.com/api/docs/pricing); contradicted by [G2 guide](https://www.g2.com/articles/openai-api-pricing)

**Workflows vs agents**
- Anthropic defines workflows as "systems where LLMs and tools are orchestrated through predefined code paths" and agents as systems where "LLMs dynamically direct their own processes and tool usage". — [Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Advice: "we recommend finding the simplest solution possible, and only increasing complexity when needed. This might mean not building agentic systems at all"; "workflows offer predictability and consistency for well-defined tasks"; "optimizing single LLM calls with retrieval and in-context examples is usually enough". — [Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Named patterns that map onto this pipeline: prompt chaining (with programmatic checks between steps), routing, parallelization, orchestrator-workers, evaluator-optimizer (generate + critique loop, fits QC). — [Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

**Subscription vs API billing**
- Official policy: "Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication through Claude Console or a supported cloud provider. Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users." — [Claude Code legal and compliance (search summary)](https://code.claude.com/docs/en/legal-and-compliance)
- Help-center status: on 15 Jun 2026 the announced change to Agent SDK usage was paused, so Agent SDK / `claude -p` signed in with a plan still draw from subscription limits; on 7 Oct 2026 Max, Ultra and Team plans gained monthly API credits that cover Agent SDK and `claude -p` when run with an API key from the linked Console organization. The page does not state the credit amounts. — [Anthropic help center 15036540](https://support.claude.com/en/articles/15036540)
- Background: in May 2026 Anthropic announced a separate programmatic credit pool ($20 Pro, $100 Max 5x, $200 Max 20x, at full API rates) starting 15 Jun, later paused. — [The Decoder](https://the-decoder.com/claude-subscriptions-get-separate-budgets-for-programmatic-use-billed-at-full-api-prices/); [The Register](https://www.theregister.com/ai-ml/2026/05/14/anthropic-tosses-agents-into-the-api-billing-pool/5240748)

### Inferences
- Per-call cost estimate (my arithmetic on the official prices; assumptions: 10k tokens of rules/schema as a cached prefix, 10k tokens of fresh input such as transcript plus sampled frames, 2k tokens of structured output):
  - Haiku 5.5: about $0.003 per call.
  - Sonnet 5.5: 10k x $2/M + 10k x $0.10/M + 2k x $10/M = about $0.041 per call (about $0.02 via Batch).
  - Opus 5.5: 10k x $4/M + 10k x $0.20/M + 2k x $20/M = about $0.082 per call.
  - A video needing breakdown + prompt writing + QC (3-5 calls) therefore lands around $0.01-0.05 on Haiku, $0.12-0.25 on Sonnet, $0.25-0.45 on Opus. Even 1,000 videos/month on Sonnet is about $120-250, and tiering (Haiku for QC/classification, Sonnet for breakdown and prompt writing) cuts that further. Image-token cost per frame was not verified this session, so the frame share is an assumption.
- A 30-second reference video sent natively to a Gemini Flash model would be about 7,700 tokens at 258 tok/s, i.e. under one cent of input at $0.75-1.50/M; Gemini is the cheap option for the raw "watch the video" step if native video understanding is needed, with Claude handling prompt writing and QC from the structured breakdown. This rests on unverified search snippets.
- Where the current $500 goes: an agent loop re-sends the rule files and the growing transcript on every turn and spends output tokens writing one-off scripts. In the web app, the scripts become fixed code, the rules become a cached system prefix, and structured outputs (JSON schema) remove parsing retries. The Agent SDK or Managed Agents is only justified for open-ended tasks (e.g. diagnosing a failed order), not for the per-order path.
- Batch API fits non-urgent steps (overnight breakdowns of a backlog, bulk QC, analytics summaries); interactive contractor steps need the synchronous API with caching. Use the 1-hour cache when contractors work in bursts longer than 5 minutes apart.
- For this owner: a Claude subscription can legitimately power his own personal Claude Code use, but a Railway backend serving several contractors is a product routing others' requests and must use Console API keys. The Max/Ultra/Team monthly API credits (via the linked Console org) may offset part of the bill.

### Gaps
- Exact Gemini API and OpenAI price tables for November 2026 could not be read (host blocked / conflicting snippets). Verify at ai.google.dev/gemini-api/docs/pricing and developers.openai.com/api/docs/pricing.
- Whether current Claude models accept video input directly was not checked; assume frames + transcript unless verified.
- Size of the monthly API credit on Max/Ultra/Team is not stated on the help page.
- No independent 2026 benchmark found quantifying agent-loop vs workflow cost for media pipelines; the saving is reasoned from pricing mechanics.
- Claude structured-output feature specifics (strict JSON schema guarantees) were not read this session.

## 2. Durable job orchestration, idempotency and no double-spend

### Takeaway
For a small team on Railway with Postgres already present, a Postgres-backed queue (pg-boss / Graphile Worker) or a Postgres-backed durable engine (Hatchet, or self-hosted Trigger.dev) is the proportionate choice; Temporal is the most robust but heaviest. Whatever the engine, double-spend is prevented by the data model: a unique idempotency key per logical generation, persisted intent before the external call, and reconciliation against the provider.

### Cited Findings
- Trigger.dev: Apache 2.0, self-hostable via Docker Compose or Kubernetes, described as the most mature self-hosted path among Hatchet/Trigger.dev/Inngest; cloud has a free Hobby tier and Pro from $20/month plus run and machine fees. — [Automation Atlas (third-party)](https://automationatlas.io/guides/trigger-dev-vs-inngest-2026-comparison/); [pkgpulse (third-party)](https://www.pkgpulse.com/guides/hatchet-vs-trigger-dev-v3-vs-inngest-durable-workflows-2026)
- Inngest: only the dev server is open source; self-hosting is on enterprise plans; free tier 50,000 step runs/month, Basic $20/month for 200K step runs. Third-party sources disagree on the Pro price ($75 vs $50-500/month). — [Activepieces (third-party)](https://www.activepieces.com/blog/inngest-pricing-2026-plans-limits-and-overage-costs); [Automation Atlas](https://automationatlas.io/tools/inngest/)
- Temporal: Temporal Cloud is self-service from $0/month billed per action at $50 per million; a realistic small production self-host is put at $2,500-4,500/month infrastructure plus operations labour. — [Automation Atlas (third-party)](https://automationatlas.io/guides/inngest-vs-temporal-2026-comparison/)
- Hatchet: "Temporal-like capabilities on Postgres", aimed at AI/ML workflows with self-hosting as a priority; newest of the three. — [pkgpulse (third-party)](https://www.pkgpulse.com/guides/hatchet-vs-trigger-dev-v3-vs-inngest-durable-workflows-2026)
- Idempotency key must be generated once before the first attempt, tied to the logical operation (not the HTTP request), and reused on every retry; the goal is exactly-once effects, not exactly-once delivery. — [InfoWorld](https://www.infoworld.com/article/4191741/why-an-idempotency-key-isnt-an-idempotency-guarantee.html)
- Insert the key under a unique constraint before processing (check-then-insert has a race); store a fingerprint of the request body with the key and reject mismatches; key TTL must exceed the longest retry path. — [DEV: idempotency keys](https://dev.to/highflyer910/idempotency-keys-what-most-tutorials-dont-tell-you-1ncc); [Dodo Payments](https://dodopayments.com/blogs/idempotency-keys-payment-api/)
- Transactional outbox: write the intent to call the provider in the same DB transaction as the state change, and let a separate processor make the call; the outbox alone does not prevent double charges, so it still needs provider idempotency keys or, when the provider lacks them, a lookup by reference ID. — [CodeOpinion](https://codeopinion.com/your-idempotent-code-is-lying-to-you/)
- Periodic reconciliation is needed because your DB and the provider's ledger are separate systems of record. — [DEV: idempotency at scale](https://dev.to/gabrielanhaia/idempotency-at-scale-the-pattern-that-prevents-double-charging-42j8)

### Inferences
- Recommended pattern for paid generation APIs (Higgsfield, Kling, fal, etc.): (1) `generation` row with a deterministic key = hash(order, shot, prompt version, model, params) under a UNIQUE constraint; (2) state machine `planned -> submitting -> submitted(provider_job_id) -> succeeded/failed`, with the transition to `submitting` committed before the HTTP call; (3) pass the key as the provider's idempotency/client-reference field if it has one; (4) if a worker dies in `submitting`, do not blindly resubmit: first list the provider's recent jobs and match by reference, and if the provider offers neither, require a human "resubmit" click; (5) poll/webhook for results as a separate idempotent step; (6) nightly reconciliation of provider usage vs local ledger; (7) per-user and per-order credit budgets checked in the same transaction.
- Fit ranking for this project: pg-boss or Graphile Worker (zero new infrastructure, runs in the same Railway Postgres, free) plus an explicit state table is enough for tens to low hundreds of jobs per day. Step up to Hatchet or self-hosted Trigger.dev if multi-step retries, fan-out and a run dashboard for contractors are wanted. Inngest cloud is convenient with Next.js but adds a SaaS dependency and step-based billing. BullMQ needs Redis (extra Railway service). Temporal is disproportionate here.
- Long jobs should never run inside the Next.js request; use a separate Railway worker service consuming the queue, and treat generation as submit + poll so no worker is held for minutes.

### Gaps
- No pg-boss, Graphile Worker or BullMQ specifics were returned by search; statements about them are from general knowledge and should be checked against their docs.
- Vendor pricing here is from third-party comparison blogs that disagree with each other; verify on vendor sites.
- Whether each generation provider the owner uses supports an idempotency key or client reference was not researched.

## 3. Railway specifics: pricing, storage, FFmpeg workers, egress, GPU alternatives

### Takeaway
Railway is adequate for the web app, Postgres and CPU FFmpeg workers; media should live in object storage (Railway buckets or R2), not volumes, which makes 100-200 GB cost a few dollars a month with free egress. Railway is not the place for GPU work; send that to Modal, RunPod or fal.

### Cited Findings
- Railway usage rates: about $10 per GB RAM per month and $20 per vCPU per month, billed per second; volume storage $0.15 per GB-month; service egress $0.05 per GB; private networking between services is not billed as egress. — [Railway pricing reference (search summary)](https://docs.railway.com/reference/pricing); [railway.com/pricing](https://railway.com/pricing)
- Railway object storage buckets: $0.015 per GB-month, free egress, no minimum retention or retrieval fees; uploads from a service to a bucket are billed at the standard service egress rate; Pro has unlimited bucket capacity. — [Railway buckets billing (search summary)](https://docs.railway.com/storage-buckets/billing.md)
- Pro plan is $20/month, counted as usage credit. Per-service limits are reported inconsistently: Railway's pricing page shows up to 42 replicas at 24 vCPU / 24 GB RAM each and up to 1 TB storage; a third-party page says 1,000 vCPU / 1 TB RAM. Seats: "unlimited" per one source, $20/seat per a third-party calculator (May 2026). — [railway.com/pricing](https://railway.com/pricing); contradicted by [usagepricing.com](https://www.usagepricing.com/blueprint/railway) and [makerkit calculator](https://makerkit.dev/pricing-calculator/railway)
- A Railway docs page also lists $50 per GB RAM and $50 per vCPU with a note that VMs are in beta, apparently a separate VM rate. — [Railway plans (search summary)](https://docs.railway.com/reference/pricing/plans)
- Cloudflare R2: about $0.015 per GB-month, $0 egress, Class A operations $4.50 per million, free tier 10 GB + 1M writes + 10M reads per month. Backblaze B2: about $0.006 per GB-month, egress about $0.01 per GB or free through Cloudflare / Bandwidth Alliance, 10 GB free. — [tech-insider comparison (third-party)](https://tech-insider.org/cloudflare-r2-vs-s3-vs-backblaze-b2-2026); [devopsboys (third-party)](https://devopsboys.com/blog/cloudflare-r2-vs-aws-s3-vs-backblaze-b2-2026)
- GPU alternatives, per-second billing: Modal H100 about $0.001097/s (about $3.95/h; another source about $4.50/h), GPU rate excludes CPU/memory; RunPod serverless H100 about $2.50/h, A100 about $0.00076/s, no egress fees; fal bills per second or per output, H100 about $1.89/h described as a negotiated rate. — [tech-insider GPU comparison (third-party)](https://tech-insider.org/gpu-cloud-providers-serverless-gpu-pricing-modal-runpod-nebius-2026/); [RunPod vs Modal (vendor blog)](https://www.runpod.io/articles/comparison/runpod-vs-modal)

### Inferences
- Storage arithmetic for 200 GB: Railway bucket or R2 about $3/month; B2 about $1.20/month; a Railway volume would be about $30/month and is tied to one service. Egress of 150 GB/month: $0 from buckets/R2, about $7.50 if streamed through a Railway service, about $1.50 from B2 direct. Therefore: store in a bucket and hand browsers presigned URLs so media never transits the app service.
- Have generation providers' output URLs fetched by the worker and written straight to the bucket; note that service-to-bucket uploads on Railway count as service egress ($0.05/GB), so 200 GB of ingest costs about $10 once.
- FFmpeg CPU worker: a 4 vCPU / 8 GB worker running continuously would cost roughly 4 x $20 + 8 x $10 = $160/month, but per-second billing means a worker that scales to zero or sleeps between jobs costs only for render minutes; concatenation, captions and re-encodes of short vertical clips are light CPU jobs.
- No evidence was found of GPU instances on Railway; plan GPU steps (upscaling, local diffusion, heavy interpolation) as calls to Modal/RunPod/fal from the queue. For this pipeline most "GPU" work is already bought as API calls to generation vendors, so a rented GPU is likely unnecessary initially.

### Gaps
- Railway docs could not be read directly; plan limits, seat pricing and GPU availability are unverified and partly contradictory. Check railway.com/pricing.
- No source on FFmpeg-specific limits on Railway (ephemeral disk size, max job duration).
- R2 and B2 numbers come from third-party blogs, not the vendors' pricing pages.

## 4. Hybrid local-worker pattern (user's Mac as optional worker)

### Takeaway
The standard, safe way is a pull model: a small daemon on the Mac makes outbound connections only, polls a dedicated queue for "mac-only" tasks and reports results; no inbound ports or tunnels are needed. Temporal documents this exactly; for a Postgres queue it is a few dozen lines against an authenticated HTTPS endpoint.

### Cited Findings
- Temporal workers behind firewalls poll the service's task queue continuously over outbound connections; a Temporal blog describes an egress-only proxy keeping a single outbound connection as the control channel, reaching firewalled sites with no inbound ports. — [Temporal blog](https://temporal.io/blog/i-spent-two-months-screen-sharing-to-ship-one-integration-so-i-rebuilt-it-on-temporal.md); [Temporal community thread](https://community.temporal.io/t/polling-worker-server/7515)
- Trigger.dev self-hosted workers are configured with `TRIGGER_API_URL` pointing at the webapp plus a worker token; customer-hosted workers connecting to Trigger.dev Cloud appear only as a feature request. — [Trigger.dev supervisor env docs](https://trigger.dev/docs/self-hosting/env/supervisor); [Trigger.dev feedback: self-hosted workers](https://feedback.trigger.dev/p/self-hosted-workers)

### Inferences
- Design: tasks carry a `runs_on` capability tag (`cloud`, `mac:<user>`); the Mac agent authenticates with a per-device revocable token, long-polls `GET /api/worker/claim?capabilities=...` (claim implemented with `SELECT ... FOR UPDATE SKIP LOCKED` and a lease/heartbeat), downloads inputs via presigned URLs, uploads outputs to the bucket, and posts completion with the task's idempotency key. If the Mac is offline the task waits or falls back to a cloud path; lease expiry returns the task to the queue.
- Never give the Mac agent database credentials or provider keys it does not need; it should only see the specific task payload. Run it as a launchd service so it survives reboots.
- If a durable engine is chosen, Hatchet/Temporal-style workers give this for free because workers always dial out; with pg-boss the worker would need direct Postgres access, so an HTTPS claim endpoint is the safer variant for a contractor's laptop.

### Gaps
- Hatchet's worker connection model was not confirmed by search.
- No off-the-shelf "Mac as worker for a web app" product was identified; which steps are truly Mac-only in the owner's pipeline is unknown to this researcher.

## 5. Multi-tenant auth and per-user encrypted third-party credentials

### Takeaway
Use envelope encryption: a master key outside the database (KMS or, minimally, a Railway secret) wraps per-tenant data keys; Postgres stores only ciphertext and the application decrypts just-in-time. Secrets you only verify are hashed; secrets you must present upstream (OAuth refresh tokens, provider API keys) are encrypted reversibly.

### Cited Findings
- Envelope pattern for Postgres: a KMS-held key-encryption key per organization wraps a data key; encryption and decryption happen in the API process and Postgres stores only ciphertext; track encryption status per row. — [Xata: multi-tenant BYOK in PostgreSQL](https://xata.io/blog/multi-tenant-byok-encryption-in-postgresql-with-pgcrypto)
- Hand-managed per-tenant keys scale poorly (a hundred tenants means a hundred keys to rotate, audit and revoke); derive tenant keys from a root key or use key context instead. — [WorkOS: cryptographic key isolation](https://workos.com/blog/cryptographic-key-isolation-multi-tenant-saas)
- Rotating the KEK does not require immediately re-encrypting every object. — [WorkOS: envelope encryption explained](https://workos.com/blog/envelope-encryption-explained)
- Caching unwrapped data keys cuts KMS cost and load: AWS reports a 77% KMS cost reduction; Ariso reports an LRU cache with 1-hour TTL cut Vault calls by 96%. — [AWS Security Blog](https://aws.amazon.com/blogs/security/caching-kms-data-keys-in-multi-thread-environments-per-tenant-encryption-for-event-driven-systems-at-scale/); [HashiCorp/Ariso](https://www.hashicorp.com/en/blog/adopting-hashicorp-vaults-transit-engine-high-performance-envelope-encryption-ariso-ai)
- Real-world migration: Polar found OAuth access/refresh tokens, client secrets and Slack secrets stored in plaintext and fixed it by adding an encrypted column, dual-writing, then backfilling. — [Polar engineering handbook](https://handbook.polar.sh/engineering/design-documents/secrets-encryption)
- Managed option: WorkOS Vault. — [WorkOS Vault docs](https://docs-astro.workos.com/vault)

### Inferences
- Minimal fit for this app: a `credentials` table (tenant_id, user_id, provider, ciphertext, nonce, key_version, scopes, expires_at, last_used_at) with AES-256-GCM, tenant/user ID bound as associated data, master key in a Railway environment secret or a cloud KMS, key_version to allow rotation. Decrypt only inside the worker at call time; never return secrets to the browser; redact in logs; audit every use; allow per-user revoke.
- Social tokens are the most sensitive asset (they can post to accounts). Prefer the platform OAuth flow per account over storing passwords; store refresh tokens encrypted and refresh server-side. If a posting aggregator (section 6) is used, it holds the social tokens and the app stores only one aggregator key, shrinking the vault's scope.
- For app login, a hosted or library auth with organizations and roles (owner, contractor) and row-level tenant scoping is enough; contractors should be able to use shared provider credentials through the backend without ever seeing them.

### Gaps
- No OWASP source was retrieved; cite OWASP Secrets Management / Cryptographic Storage cheat sheets only after checking them.
- No comparison of auth providers (Clerk, Auth.js, Better Auth, WorkOS) was researched.

## 6. Publishing/scheduling to many Instagram and TikTok accounts; analytics loop

### Takeaway
Official APIs can publish Reels (100 API posts per account per 24 h) and TikTok videos, but TikTok requires an app audit before posts can be public, and unaudited apps are capped at 5 posting users per 24 h with private-only posts; for a small team the practical route is an aggregator that already holds audited apps (Postiz, Ayrshare, Blotato, upload-post, Metricool) rather than own app review. No reliable evidence of a reach penalty for official-API posting was found, but mass multi-account / phone-farm operation carries real linked-ban risk and the tooling vendors' "safe" claims are unverified.

### Cited Findings

**Instagram (official; search summaries of Meta docs)**
- Accounts are limited to 100 API-published posts within a 24-hour moving period (older doc version said 50), enforced on `media_publish` and checkable via the `content_publishing_limit` endpoint; Reels have no separate quota. — [Meta: Content Publishing (search summary)](https://developers.facebook.com/documentation/instagram-platform/content-publishing)
- An Instagram Audio API now exists (with Facebook Login): a search with no query returns trending audio, and a track is attached by passing `audio_id` in `audio_configuration` when publishing the Reel; previewing a Reel with attached audio is not supported. — [Meta: Instagram Audio API (search summary)](https://developers.facebook.com/documentation/instagram-platform/content-publishing/audio-api)
- Insights: a Total Views metric is available on the Media endpoint for video and on the Insights endpoint for feed posts, Reels and Stories (April 2026 update); `crossposted_views` gives combined Instagram + Facebook Reel views (December 2025 update). — [Meta developer blog, 22 Apr 2026 (search summary)](https://developers.facebook.com/blog/post/2026/04/22/instagram-api-updates-for-partnerships-metrics-collaboration-and-engagement/); [Meta developer blog, 3 Dec 2025](https://developers.facebook.com/blog/post/2025/12/03/instragram-api-updates/)

**TikTok (official; search summaries of TikTok docs)**
- "All content posted by unaudited clients will be restricted to private viewing mode" (SELF_ONLY); a public post attempt from an unaudited client is blocked at `/publish/video/init/`. — [TikTok developer FAQ (search summary)](https://developers.tiktok.com/docs/en/getting-started-faq); [TikTok Direct Post reference](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post)
- "Unaudited API Clients can allow up to 5 users to post in a 24 hour window", and those accounts must be set to private at posting time. — [TikTok Content Sharing Guidelines (search summary)](https://developers.tiktok.com/docs/en/content-sharing-guidelines)
- Third-party claims, not confirmed against TikTok docs: init endpoint limited to 6 requests per minute per access token; about 15 posts per creator per day shared across apps; 5 pending drafts per creator per 24 h; the audit is separate from App Review and posts made before audit stay private. — [Socialync guide (third-party)](https://www.socialync.io/blog/tiktok-content-posting-api-guide-2026); [upload-post TikTok guide (third-party, search summary)](https://www.upload-post.com/tiktok-api/); [bundle.social (third-party)](https://bundle.social/blog/tiktok-api-approval)
- Trending sounds can only be selected in the TikTok app, not via the posting API (vendor source). — [TokPortal (vendor)](https://www.tokportal.com/learn/tiktok-reach-dropped-after-scheduler)
- Analytics: the Display API `/v2/video/list/` (scope `video.list`) returns a user's recent public videos, and the Video Object reference defines a `view_count` field; search did not confirm the list endpoint returns it in practice. The Research API has view counts but is restricted to approved researchers and its FAQ warns counts can be inaccurate. — [TikTok Display API overview](https://developers.tiktok.com/docs/en/display-api-overview); [TikTok video object](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object); [Research API FAQ](https://developers.tiktok.com/docs/en/research-api-faq)

**Reach penalty for API/scheduled posts**
- No official platform statement of a penalty was found. Hootsuite's small experiment and Agorapulse's lab found no harm from third-party scheduling on Instagram; all such evidence comes from scheduling vendors. — [Hootsuite experiment (vendor)](https://blog.hootsuite.com/experiment-third-party-scheduling-instagram/); [Agorapulse lab (vendor)](https://agorapulse.com/social-media-lab/instagram-3rd-party-tools)
- Separate real factors cited: Reels carrying other apps' watermarks are downranked (attributed secondhand to Mosseri); a brand-new TikTok account that immediately connects a third-party tool and starts publishing may look like a bot. — [Blotato (vendor)](https://www.blotato.com/blog/does-api-posting-hurt-reach); [TokPortal (vendor)](https://www.tokportal.com/learn/tiktok-reach-dropped-after-scheduler)

**Tools (vendor-published prices; verify)**
- Postiz (open source, self-hostable; cloud): $29/month for 5 channels, $39 for 10, $49 for 30, $99 for 100; about 20% off annually. — [Postiz comparison page (vendor)](https://postiz.com/compare/ayrshare/upload-post)
- Ayrshare: bills per customer profile (one profile = one customer's set of networks); Premium $149/month includes one profile; Launch $299, Business $599, Enterprise custom; 300 requests per 5 minutes per profile. — [Ayrshare comparison (vendor)](https://www.ayrshare.com/compare/postiz-api-alternative.md); [Postiz comparison (vendor)](https://postiz.com/compare/ayrshare/blotato)
- Blotato: Starter $29/month (vendor claims 20 accounts), Creator $97, Agency $499; API not included in the free trial. — [Blotato pricing research, checked 7 Oct 2026 (vendor)](https://www.blotato.com/research/social-media-agent-pricing)
- upload-post: Basic plan $24 (cited in Blotato's table; no account limits found). — [Blotato pricing research (vendor)](https://www.blotato.com/research/social-media-agent-pricing)
- Postiz TikTok provider documentation exists (self-hosting requires your own TikTok app, hence your own audit). — [Postiz TikTok docs](https://www.mintlify.com/gitroomhq/postiz-app/platforms/tiktok)

**Phone farms / multi-account**
- No official TikTok statement on phone farms was found; TikTok says it bans accounts that repeatedly or severely violate rules, and creating accounts to evade bans or run spam operations is prohibited and can take down all linked accounts. — [Shortimize](https://www.shortimize.com/blog/how-to-manage-multiple-tiktok-accounts-2); [TokPortal](https://www.tokportal.com/learn/tiktok-multi-account-ban)
- Vendor guides report clustering of accounts by shared device, app install, login history, network, location and behaviour, with emulators sharing hardware identifiers leading to group bans; "two or three accounts on one phone is common, ten run aggressively from one device and IP looks like a spam farm". These come from sellers of anti-detect tools. — [Multilogin (vendor)](https://multilogin.com/academy/prevent-tiktok-shadow-ban-with-multilogin-cloud-phone/); [Shortimize](https://www.shortimize.com/blog/how-to-manage-multiple-tiktok-accounts-2)

### Inferences
- ToS/ban risk, stated plainly: (a) official API via an audited aggregator = lowest risk, constrained by caps and, on TikTok, no trending sounds; (b) humans posting natively on real phones, a few accounts per device = low risk, labour-heavy, and the only way to use TikTok trending sounds; (c) automated phone farms, emulators, cloud phones, anti-detect browsers and unofficial/private-API uploaders violate platform terms on automation and inauthentic behaviour and risk correlated bans across the whole account cluster. Evasion tactics sold by vendors are unverified; do not build the business on them.
- Practical hybrid for trending audio: publish through the API where native sound is not essential (Instagram now supports trending audio via the Audio API, to be verified with a test), and for TikTok videos that need a trending sound, push the finished video to a contractor's phone as a draft/inbox upload and let them add the sound and publish in-app. Whether a given aggregator exposes TikTok "upload to inbox/draft" mode needs checking per tool.
- Own-app route is poor for this owner: TikTok audit plus Meta App Review for an internal tool is slow and uncertain, and the unaudited 5-users/private-only cap blocks real use. An aggregator priced per channel (Postiz cloud $49 for 30 channels, $99 for 100) or flat (Blotato) is cheaper than Ayrshare's per-profile model when all accounts belong to one operator.
- Closing the analytics loop: store `platform_post_id` per published video linked to concept/prompt/model metadata; nightly job pulls views at 24 h, 72 h, 7 d (Instagram Insights views; TikTok `video.list` or the aggregator's analytics endpoint); then rank concepts by views per account-normalized baseline. This is a deterministic job; an LLM (Batch API, Haiku/Sonnet) is only needed to summarize what winning concepts share.
- Remove generator watermarks and avoid cross-platform watermarks before posting, since that is the one downranking factor with a stated platform basis.

### Gaps
- Meta and TikTok developer docs could not be read directly; the Audio API's requirements (account type, regions, licensed music for business accounts), the TikTok per-creator daily cap, and whether TikTok `video.list` returns `view_count` are unverified.
- No information retrieved on Metricool, Publer or Later API capabilities and pricing, nor on per-tool analytics depth for TikTok/Instagram.
- No independent controlled 2026 test of API vs native posting reach exists in the results; all evidence is vendor-produced.
- TikTok AI-generated-content labelling requirements and commercial-content disclosure rules for API posts were not retrieved.
- No hard data on ban rates for phone farms; only vendor anecdotes.
