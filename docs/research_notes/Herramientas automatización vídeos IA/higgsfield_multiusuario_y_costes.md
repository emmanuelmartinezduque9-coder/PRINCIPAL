# Higgsfield multi-user (each contractor on their own subscription) and cost alternatives — state as of 22 Nov 2026

Method note (read first):
- `higgsfield.ai` and `docs.higgsfield.ai` were NOT reachable with the fetch tool from this session (host outside the allowed network domains). Official Higgsfield pages are therefore cited from **search-engine result summaries of those pages**, not from a full read. Anything marked "(search summary)" should be re-verified on the live page before it becomes a contractual assumption.
- Credit costs marked **"MCP quote"** are first-hand: they were obtained on 2026-11-22 by calling the official Higgsfield MCP server's cost-estimation tools (`estimate_image_cost`, `estimate_video_cost`, `models_explore`, `show_plans_and_credits`, `balance`) from the owner's connected account. No generation was submitted and no credits were spent. Source URL for these is the MCP endpoint itself: https://mcp.higgsfield.ai/mcp. The connected account's plan type is reported by the server as `"secret"` (a non-public/legacy plan name), so credit prices could in theory differ on other plans — unverified.
- Prices from fal/Kie/Kling/Google come from search summaries of their pages or of third-party blogs; flagged individually.

## 1. Does Higgsfield have an official MCP server / CLI / API in 2026, can subscription credits be used through them, and can a third-party backend hold a user's OAuth token?

### Takeaway
Yes to all three surfaces, and they bill differently: the **official remote MCP server (`https://mcp.higgsfield.ai/mcp`, OAuth) and the official CLI (`@higgsfield/cli`) spend the user's normal subscription-plan credits**, whereas the **REST API (cloud.higgsfield.ai + `higgsfield-client` SDKs) is a separate product with its own prepaid USD balance** to which plan credits cannot be transferred. MCP-over-OAuth is therefore the only official route that satisfies "each contractor uses their own subscription credits" from a hosted web app; "Unlimited" modes do NOT apply through MCP/CLI.

### Cited Findings
**MCP server**
- Official remote MCP endpoint is `https://mcp.higgsfield.ai/mcp`; in Claude it is added as a custom connector and authorised with the user's Higgsfield account, "no API key or code" (search summary). — [Higgsfield help: connect to Claude](https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-claude)
- "MCP connects through OAuth authorization, no API key is needed" (search summary). — [Higgsfield help: What is Higgsfield MCP](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp)
- The Claude setup guide says an **active paid Higgsfield subscription** is required (search summary). — [Higgsfield help: connect to Claude](https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-claude)
- "Any MCP-compatible agent can use the same URL"; ChatGPT uses an official Higgsfield plugin; Claude Code is pointed at the CLI instead (search summary). — [Higgsfield help: connect to AI agent](https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-ai-agent)
- Everything generated through MCP, CLI, Canvas, Supercomputer or other automated tools deducts credits at standard rates regardless of plan; Unlimited access and free generations apply only on higgsfield.ai and are "intended for manual use, not for automated or programmatic generation" (search summary). — [Higgsfield help: What is Higgsfield MCP](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp); [Higgsfield help: How credits work](https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work)
- MCP outputs land in the user's Assets on higgsfield.ai, tagged with the MCP source (search summary). — [Higgsfield help: What is Higgsfield MCP](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp)
- Client registration: Higgsfield's blog post "Higgsfield MCP moves to CIMD" says both Dynamic Client Registration (DCR) and Client ID Metadata Documents (CIMD) currently work, only the way a client identifies itself changes, the rest of the OAuth flow is unchanged, and a cut-over date of **31 December 2026** is given. The search summary's wording of which method ends on that date is ambiguous ("DCR supported now, CIMD supported until Dec 31 2026"); the post's title implies DCR is the one being retired. — [Higgsfield blog: MCP moves to CIMD](https://higgsfield.ai/blog/higgsfield-mcp-moves-to-cimd)
- Third-party integration platforms already operate server-side OAuth clients against the Higgsfield MCP on behalf of end users: Composio lists the Higgsfield MCP toolkit with auth type `DCR_OAUTH`; Scalekit lists it as OAuth 2.1 with DCR. — [Composio Higgsfield MCP toolkit](https://docs.composio.dev/toolkits/higgsfield_mcp.md); [Scalekit Higgsfield MCP connector](https://www.scalekit.com/connectors/higgsfieldmcp)
- First-hand (MCP tool call, 2026-11-22): a remotely hosted MCP client (this cloud session, not a desktop app) authenticated via OAuth can read the plan-credit balance (`balance` returned a credits figure and `subscription_plan_type`), list models, quote costs, and exposes `generate_image`, `generate_video`, `generate_*_batch`, `media_upload`/`media_import_url`, `jobs_wait`, `upscale_video`, `motion_control`, `transactions`, `list_workspaces`/`select_workspace`. — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)
- First-hand: Genjutsu is exposed in the MCP catalogue as normal video models — `hf_mult_motion_control` (motion transfer: 1–49 reference images + exactly 1 reference video; 480p/720p/1080p), `hf_mult_replace_object` (object swap: 1–30 reference images + 1 source video of 4–30 s), plus "Genjutsu Lite" variants `hf_mult_motion_control_flash` and `hf_mult_replace_object_flash`. Also present: `nano_banana_pro` (1k/2k/4k), `seedance_2_0` (4–15 s, 480p–4k), `seedance_2_5` (4–30 s, 480p–4k, modes t2v/omni_reference/video_edit/video_extension), `kling3_0` (3–15 s; std/pro/4k), `kling3_0_turbo`, `kling4_0`, `kling3_0_motion_control`, `wan2_6`, `wan2_7`, `wan3_0`, `wan3_0_prime`, `dubbing` (18 target languages incl. `spa`), `topaz_video` (1080p/2160p), `topaz_image`. — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)
- First-hand: the MCP exposes workspaces and a team concept (`workspace_kind`: individual / team_owner / team_member; only the team owner can buy credits). — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)

**CLI**
- Official CLI: GitHub `higgsfield-ai/cli`, npm `@higgsfield/cli` (binary `hf`/`higgsfield`; also curl script and Homebrew). Login is `higgsfield auth login`, which opens a browser; the consent page lists email, basic profile, organisation membership and "remember the login"; the browser shows "Device authorized" (device-style flow). No documented headless/token login was found. Agent skills are installed with `npx skills add higgsfield-ai/skills` (generate, soul, product-photoshoot). — [github.com/higgsfield-ai/cli](https://github.com/higgsfield-ai/cli); [Higgsfield help: access via CLI](https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-access-higgsfield-via-cli); [Higgsfield blog: CLI](https://higgsfield.ai/blog/higgsfield-cli)
- CLI "signs in with your Higgsfield account; billing is the same plan credits" (search summary). — [Higgsfield help: How credits work](https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work)
- A GitHub issue reports npm install failing on Windows when Git for Windows is installed. — [higgsfield-ai/cli issue #5](https://github.com/higgsfield-ai/cli/issues/5)

**REST API + SDKs**
- The API is registered separately at cloud.higgsfield.ai, with an API key and docs at docs.higgsfield.ai; "your plan, credits, and Unlimited access exist only on the website; the API runs on its own account balance in US dollars"; plan credits cannot be transferred to the API (search summary). — [Higgsfield help: What is the Higgsfield API](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api)
- Official SDKs: Python `higgsfield-client` (GitHub + PyPI, sync and async) and Node `@higgsfield/client`. — [github.com/higgsfield-ai/higgsfield-client](https://github.com/higgsfield-ai/higgsfield-client); [PyPI higgsfield-client](https://pypi.org/project/higgsfield-client/); [Higgsfield docs: SDK](https://docs.higgsfield.ai/docs/how-to/sdk)
- API rate limits "depend on the account, subscription, and selected model"; assigned values are shown in the Higgsfield Cloud dashboard; successful responses carry no rate-limit headers. — [Higgsfield docs: rate limits](https://docs.higgsfield.ai/docs/concepts/rate-limits)
- Higgsfield's own blog argues the API vs subscription trade-off; a news write-up of it says 300 clips need about 9,600 subscription credits, beyond Ultra's monthly allotment. — [Higgsfield blog: API pricing vs subscriptions](https://higgsfield.ai/blog/ai-video-api-pricing-vs-subscriptions); [RuntimeWire](https://runtimewire.com/article/higgsfield-video-api-subscription-pricing-at-scale)

### Inferences
- A Railway-hosted backend can act as a standard remote MCP client: register a client (CIMD going forward — host a client-metadata JSON at an HTTPS URL on the app's domain; DCR while still accepted), run OAuth authorization-code + PKCE per contractor with a redirect URI on the app, store each contractor's refresh/access token encrypted, and call `generate_image` / `generate_video` / `jobs_wait` with that contractor's token so their own plan credits are debited. This is architecturally identical to what Composio/Scalekit do, and to what this very session does. No password ever touches the app.
- Because CIMD requires a stable public HTTPS URL for the client metadata, the app needs a fixed domain (Railway custom domain) before 31 Dec 2026.
- The CLI is a poor fit for a multi-tenant server: browser/device login per user and a per-machine credential store mean one container per contractor or credential-directory juggling. It would work for a contractor running it locally, not for a shared web backend.
- The REST API fails the stated requirement (own subscription credits); it would only work as "each contractor creates a cloud.higgsfield.ai account, prepays USD, and pastes an API key into the tool" (a BYOK model, but on a separate prepaid wallet).
- MCP tools are designed for LLM agents (widgets, verbose guidance strings, tool names that can change without notice). A backend that calls them deterministically must tolerate schema drift; a tool-list check at startup and a thin adapter layer are prudent.

### Gaps
- OAuth access-token and refresh-token lifetimes, scopes, and revocation behaviour for the MCP: no source found. Must be measured empirically (decode the token / watch for 401s).
- Whether Higgsfield restricts which redirect URIs / client types may register (e.g. allow-listing only known AI clients) after the CIMD migration: not found; the blog post could not be read in full.
- MCP-specific rate and concurrency limits per plan: no official numbers found (see section 2).
- Whether Genjutsu, dubbing and Topaz are available in the REST API catalogue: not verified (docs host unreachable).
- Exact wording of which registration method (DCR vs CIMD) is retired on 31 Dec 2026 needs a direct read of the blog post.

## 2. Higgsfield plan tiers, prices, credits per plan, credit cost per model, "unlimited" modes and limits

### Takeaway
Public sources disagree on plan prices (regional pricing and frequent promos), but the order of magnitude is Starter ≈ $15–19 / 200–270 credits, Plus ≈ $49–59 / 1,000–1,200 credits, Ultra ≈ $129 / 3,000 credits per month, i.e. roughly $0.043–0.075 per credit; top-up credits cost about €0.055–0.059 each and expire after 90 days. First-hand MCP quotes: Nano Banana Pro 2K = 2 credits, Seedance 2.0 = 3 / 4.5 / 12 credits per second at 480p / 720p / 1080p, Kling 3.0 = 2–2.5 credits per second. Unlimited modes are web-only and cannot be used by a programmatic tool.

### Cited Findings
**Plans**
- Higgsfield's own blog (reported as Oct 2026): Starter $15/month for 200 credits, Plus $49/month for 1,000 credits, Ultra $129/month for 3,000 credits; Plus and Ultra open every model and differ mainly in credits and number of concurrent generations (search summary). — [Higgsfield blog: pricing explained](https://higgsfield.ai/blog/higgsfield-pricing-explained)
- Conflicting third-party table: Starter $19 monthly with 270 credits, Plus $59 monthly / $47 on annual with 1,200 credits, Ultra $129 monthly / $99 on annual with 3,000 credits; prices exclude VAT; the pricing page adjusts to the visitor's country. — [Krea: Higgsfield pricing explained 2026](https://www.krea.ai/blog/higgsfield-pricing-explained-2026-unlimited-credits-and-real-monthly-costs); entry prices $19/$47/$99 also in [Creatify: Higgsfield pricing 2026](https://creatify.ai/blog/higgsfield-pricing-(2026)-plans-and-what-you-ll-actually-pay)
- Subscription credits reset and do not roll over (monthly plans at each renewal; annual plans every 30 days); credits cannot be used without an active subscription (search summary). — [Higgsfield help: How credits work](https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work)
- Team and business plans pool credits across seats (search summary). — [Higgsfield help: Team and Business](https://higgsfield.ai/creator-hub/help-center/business/team-and-business-higgsfield)
- First-hand top-up prices shown to the owner's account on 2026-11-22 (EUR, during a "pre-Black-Friday" sale flagged as up to 63% off plans): 500 credits €30 (list €42.50), 1,000 credits €59 (list €85), 2,000 credits €115 (list €170), 4,000 credits €230 (list €340); top-up credits expire after 90 days. Auto-refill options: €20→363 credits, €40→727, €90→1,636, €150→2,727, €300→5,454 (≈18 credits per currency unit, 90-day expiry, triggers below 300 credits). — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)
- First-hand: a 3-day $0 Plus trial with "MCP-only credits" exists for eligible accounts (card required, auto-charges after trial). — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)

**Credit cost per generation — MCP quotes, 2026-11-22, 9:16, defaults otherwise (audio on)** — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)

| Model (MCP id) | Setting | Credits | Credits/s |
|---|---|---|---|
| Nano Banana Pro (`nano_banana_pro`) | 2K, 1 image | 2 | — |
| Nano Banana Pro | 4K, 1 image | 4 | — |
| Nano Banana 2.1 (`nano_banana_2_1`) | 2K, 1 image | 2 | — |
| Seedance 2.0 (`seedance_2_0`) | 480p, 10 s | 30 | 3 |
| Seedance 2.0 | 720p, 10 s | 45 | 4.5 |
| Seedance 2.0 | 1080p, 10 s | 120 | 12 |
| Seedance 2.5 (`seedance_2_5`) | 480p, 10 s | 30 | 3 |
| Seedance 2.5 | 720p, 10 s | 70 | 7 |
| Seedance 2.5 | 720p, 5 s | 35 | 7 |
| Seedance 2.5 | 1080p, 10 s | 160 | 16 |
| Kling 3.0 (`kling3_0`) | std, 10 s | 20 | 2 |
| Kling 3.0 | pro, 10 s | 25 | 2.5 |
| Kling 3.0 Motion Control (`kling3_0_motion_control`) | std, 10 s | 17 | 1.7 |
| Wan 3.0 (`wan3_0`) | 720p, 10 s | 15 | 1.5 |
| Wan 2.7 (`wan2_7`) | 720p, 10 s | 15 | 1.5 |
| Dubbing (`dubbing`) | 10 s of video | 30 | 3 |

- Genjutsu (`hf_mult_motion_control`, `hf_mult_replace_object`) and Genjutsu Lite could not be quoted without uploading real reference media (the estimator returned "required media missing"); `topaz_video` is not supported by the estimator ("does not support cost estimation"). — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)

**Unlimited**
- Unlimited is on Plus and Ultra: a 365-day set of specific image models, with Ultra adding an unlimited video model; plus time-boxed 7-day unlimited windows for video models such as Kling 3.0 that vary by plan and billing period (search summary; details differ by source). — [Higgsfield blog: credits vs unlimited](https://higgsfield.ai/blog/credits-vs-unlimited-ai-video-generation); [Krea](https://www.krea.ai/blog/higgsfield-pricing-explained-2026-unlimited-credits-and-real-monthly-costs)
- Unlimited access applies only on higgsfield.ai, not via MCP/CLI, Canvas or Supercomputer (search summary). — [Higgsfield help: What is Higgsfield MCP](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp)
- First-hand: the MCP catalogue flags `supports_unlim` on some models (Nano Banana Pro, Nano Banana 2/2.1, Seedance 2.0, Seedance 2.5, Soul 2.0, GPT Image 2.x, Seedream 5.0 Pro), but the tool descriptions define this as "free-trial unlimited generations" and the owner's account returned `unlim.available: false`; a promo record `unlim_trial_in_mcp` existed only for 29–31 July 2026. — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)

**Limits**
- The Terms let Higgsfield cap API/MCP/CLI/programmatic access (number of requests, request frequency and concurrency), change the caps without notice, and enforce them by rate limiting, throttling, queuing or temporary suspension (search summary). — [Higgsfield Terms of Use](https://higgsfield.ai/terms-of-use-agreement)
- A third-party guide reports 20 concurrent requests per API key (REST API), with per-plan values "not documented". — [Activepieces: Higgsfield automation 2026](https://www.activepieces.com/blog/higgsfield-automation-in-2026-setup-steps-limits-fixes)

### Inferences
- Implied value of one credit: ≈ $0.043 (Ultra, $129/3,000) to $0.049 (Plus, $49/1,000) to $0.075 (Starter, $15/200) inside a plan; ≈ €0.055–0.059 for top-ups/auto-refill at current sale prices (list €0.085).
- Implied USD cost via Higgsfield credits at $0.043–0.059/credit: Nano Banana Pro 2K ≈ $0.09–0.12/image; Seedance 2.0 720p ≈ $0.19–0.27/s; Seedance 2.0 480p ≈ $0.13–0.18/s; Seedance 2.0 1080p ≈ $0.52–0.71/s; Seedance 2.5 720p ≈ $0.30–0.41/s; Kling 3.0 std ≈ $0.09–0.12/s; Wan 3.0 720p ≈ $0.06–0.09/s; dubbing ≈ $0.13–0.18/s.
- Seedance 2.5 at 720p costs 56% more credits than Seedance 2.0 at 720p; 1080p is 2.7× the 720p price on Seedance 2.0. For product videos destined for social feeds, 720p + a separate upscale may be cheaper than native 1080p — depends on Topaz cost, which is unquoted.
- A monthly plan's credits cover few videos: Ultra's 3,000 credits ≈ 66 ten-second Seedance 2.0 720p clips (45 credits each), i.e. 3–11 working days at 6–20 videos/day. Heavy contractors will live on top-ups/auto-refill, at the higher per-credit price.

### Gaps
- Authoritative current plan table (the live pricing page is geo-adjusted and could not be fetched); annual vs monthly figures conflict across sources.
- Concurrency (parallel generations) per plan: no reliable number found.
- Credit cost of Genjutsu / Genjutsu Lite and Topaz video upscale: needs a quote with real uploaded media or a look at the web UI.
- Whether credit prices per model differ by plan (owner's plan is the non-public "secret" type).
- Exact list of models and durations in each plan's unlimited allowance in November 2026.

## 3. Terms of Service on automation, account sharing, reselling, third-party tools; ban risk

### Takeaway
Programmatic use through Higgsfield's own channels (API, MCP, CLI) is explicitly contemplated by the current Terms and is licensed to the account holder, who is responsible for whatever an agent does on their behalf; the licence is non-transferable and non-sublicensable, so one account per contractor (not one shared account) is the conforming design. Ban reports exist but are anecdotal and tied to heavy "unlimited" web use and billing disputes, not to official MCP use.

### Cited Findings
- The licence is "limited, non-exclusive, non-transferable, non-sublicensable, revocable" and covers the Service plus APIs, MCP integrations and CLI tools (search summary). — [Higgsfield Terms of Use](https://higgsfield.ai/terms-of-use-agreement); [Spanish version](https://higgsfield.ai/es/terms-of-use-agreement)
- The Terms name "the API, MCP, CLI, Supercomputer Agent, or any other programmatic access to the Service" and reserve usage limits on them (search summary). — [Higgsfield Terms of Use](https://higgsfield.ai/terms)
- A third-party analysis quotes a section (cited as 11.12) under which activity through Developer Access counts as the account holder's own activity even when initiated by an automated agent on their behalf; not confirmed against the primary text. — [MindStudio: Higgsfield ToS backlash](https://mindstudio.ai/blog/higgsfield-terms-of-service-backlash)
- A separate section restricts using the Supercomputer Agent to provide standalone access to the underlying Service to third parties without independent value added (search summary). — [Higgsfield Terms of Use](https://higgsfield.ai/terms-of-use-agreement)
- Help-centre wording: unlimited access and free generations are "intended for manual use, not for automated or programmatic generation" (search summary). — [Higgsfield help: What is Higgsfield MCP](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp)
- Terms versions: a 23 July 2026 version was superseded; a revised version took effect for existing users on or before 27 Aug 2026; one copy shows "Last updated: October 23, 2026". The August rewrite followed a public backlash over content-licence wording. — [Higgsfield blog: Terms and Privacy update](https://higgsfield.ai/blog/terms-of-use-privacy-policy-update); [archived 23-07-2026 version](https://higgsfield.ai/terms-of-use-agreement-23-07-2026)
- Ban/suspension reports: Trustpilot reviewers describe permanent suspension without explanation and loss of credits; a secondary write-up says X/Reddit commenters describe "automation" flags triggered by heavy use of unlimited plans. Anecdotal, unverified. — [Trustpilot Higgsfield reviews](https://uk.trustpilot.com/review/higgsfield.ai?page=8); [Quasa write-up](https://quasa.io/media/higgsfield-ai-and-the-christmas-grinch-unraveling-the-holiday-subscription-scandal)
- Reseller/sharing prohibitions found explicitly only in the Earn (affiliate) supplementary terms: sharing, reselling or multi-account use of promo codes is a breach. — [Higgsfield Earn terms](https://creators.higgsfield.ai/terms)

### Inferences
- The proposed model (each contractor has their own paid account and authorises the tool via Higgsfield's own OAuth) keeps every generation attributable to its account holder and uses a channel Higgsfield built for this, so it is the lowest-risk design. It is not "reselling" Higgsfield access: the owner's tool adds workflow value and never pools or re-bills credits.
- The risky designs are: (a) several contractors sharing one login (conflicts with a non-transferable licence; also requires sharing a password — flagged, do not do this), (b) driving the web UI with a headless browser/session cookies to reach Unlimited (explicitly contrary to "manual use" wording; most plausible trigger for automation flags), (c) the owner buying one big account and exposing it to contractors through the tool.
- If the owner prefers to pay for everything, the conforming alternative is a Higgsfield Team/Business workspace with seats and pooled credits, with each contractor still authorising via their own seat login — but that contradicts "each contractor pays their own credits".
- Since Higgsfield can change limits "without notice" and suspend on "unusual activity", the tool should throttle per user (low concurrency, queue) and surface Higgsfield errors to the contractor rather than auto-retrying aggressively.

### Gaps
- The exact "prohibited conduct" clause text (bots/scrapers, credential sharing, acting for third parties) was not retrievable; the live Terms page could not be fetched. A human should read sections on Acceptable Use and Developer Access in the current (Oct 2026) version.
- No report found — positive or negative — of an account being banned specifically for use via the official MCP or CLI.
- Whether Higgsfield requires approval or a partner agreement for a third-party product that registers its own OAuth client against the MCP: not found.

## 4. Unofficial / reverse-engineered Higgsfield clients

### Takeaway
They exist but are unnecessary now that an official MCP, CLI and SDK exist; the ones that reach the consumer web backend do so by impersonating a browser session, which is exactly the pattern the Terms and help centre exclude. None should be used for this project.

### Cited Findings
- `jfikrat/higgsfield-mcp`: unofficial TypeScript MCP server that routes requests through a daemon running `fetch()` inside a real Chrome tab on higgsfield.ai so the anti-bot service sees a real browser (MIT). — [github.com/jfikrat/higgsfield-mcp](https://github.com/jfikrat/higgsfield-mcp); [LobeHub listing](https://lobehub.com/mcp/jfikrat-higgsfield-mcp)
- `creativecgl/higgsfield-unlimited-mcp`: Python MCP server, listed as unvalidated; the name indicates targeting Unlimited generations. — [LobeHub listing](https://lobehub.com/mcp/creativecgl-cgl-higgsfield)
- `Hikhakk/higgsfield-mcp-unified`: community MCP server that targets the official API backend (platform.higgsfield.ai), i.e. a wrapper over the paid API rather than a reverse-engineered client. — [LobeHub listing](https://lobehub.com/mcp/hikhakk-higgsfield-mcp-unified)
- `geopopos/higgsfield_ai_mcp`: community MCP wrapper. — [github.com/geopopos/higgsfield_ai_mcp](https://github.com/geopopos/higgsfield_ai_mcp)
- Third-party CLIs with names close to the official one: `clawdybotty/higgsfield-cli`, `donghaozhang/higgsfield-cli`, and PyPI `higgsfield-cli` (uses `higgsfield login --with-token` / `hf login`, which is not the official flow). — [clawdybotty/higgsfield-cli](https://github.com/clawdybotty/higgsfield-cli); [donghaozhang/higgsfield-cli](https://github.com/donghaozhang/higgsfield-cli); [PyPI higgsfield-cli](https://pypi.org/project/higgsfield-cli)
- A third-party guide names package `@higgsfield-ai/higgsfield-cli` with API-key login, which does not match the official `@higgsfield/cli` docs — a naming-confusion / typosquat hazard. — [MindStudio: Higgsfield CLI guide](https://www.mindstudio.ai/blog/higgsfield-cli-claude-code-content-automation)
- Official artefacts for comparison: `higgsfield-ai/cli`, `@higgsfield/cli`, `higgsfield-ai/higgsfield-client`, `@higgsfield/client`. — [github.com/higgsfield-ai/cli](https://github.com/higgsfield-ai/cli); [github.com/higgsfield-ai/higgsfield-client](https://github.com/higgsfield-ai/higgsfield-client)

### Inferences
- Browser-session clients require each contractor's session cookie or password to sit on the server. That is credential sharing in everything but name: a leak gives full account access including billing. Flagged as a risk; not recommended.
- Look-alike package names (`higgsfield-cli` on PyPI, `@higgsfield-ai/...` on npm) are a supply-chain risk; pin to the `higgsfield-ai` GitHub org and the `@higgsfield` npm scope only.

### Gaps
- Maintenance status (last commit, open issues, stars) of each unofficial repo was not checked; source code was not audited to confirm how each handles cookies/tokens.
- No verified report linking a specific unofficial client to account bans.

## 5. Alternatives: same models via pay-per-use APIs, BYOK, and Genjutsu equivalents

### Takeaway
Per unit, Higgsfield plan credits are competitive or cheaper than fal.ai for Seedance 2.0 and Nano Banana Pro and roughly equal to Kling's official API for Kling 3.0; low-cost resellers (Kie.ai, Atlas Cloud) undercut both on paper but the figures found are second-hand. All pay-per-use providers support a bring-your-own-key design trivially (each contractor pastes their own API key), but none of them gives access to Higgsfield-proprietary Genjutsu; the nearest substitutes are Kling 3.0 Motion Control, Wan 2.2 Animate (move/replace) and Runway Act-Two / Aleph.

### Cited Findings
**Images — Nano Banana Pro**
- Google Gemini API: about $0.134 per 1K/2K image and $0.24 per 4K image; Batch/Flex half price ($0.067 / $0.12) (third-party summaries of Google's price list). — [aifreeapi: Nano Banana Pro cost per image](https://www.aifreeapi.com/en/posts/nano-banana-pro-cost-per-image); [usagebox](https://usagebox.com/articles/nano-banana-pro-api-pricing-cost-per-image-2026)
- fal.ai: $0.15 per image (generate or edit), 4K at $0.30, web search +$0.015. — [fal.ai Nano Banana Pro](https://fal.ai/models/fal-ai/nano-banana-pro)
- Kie.ai: reported $0.09 (2K) to $0.12 (4K) per image (third-party). — [Pixazo: Nano Banana Pro API pricing](https://www.pixazo.ai/blog/nano-banana-pro-api-cheapest-pricing)
- Higgsfield via MCP: 2 credits at 2K, 4 credits at 4K (MCP quote). — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)

**Video — Seedance**
- fal.ai Seedance 2.0: $0.3034/s at 720p with audio; fast variant $0.2419/s at 720p; a 1080p figure of $0.682/s appears on the model page, while a fal guide says 1080p/4K is not offered on fal for Seedance 2.0 (conflict). — [fal.ai Seedance 2.0 text-to-video](https://fal.ai/models/bytedance/seedance-2.0/text-to-video); [fal.ai Seedance 2.0 fast](https://fal.ai/models/bytedance/seedance-2.0/fast/text-to-video); contradicted on 1080p by [fal: Seedance 2.5 vs 2.0](https://fal.ai/learn/devs/seedance-2-5-vs-seedance-2-0)
- fal.ai Seedance 2.5: about $0.473/s at 720p. — [fal.ai Seedance 2.5](https://fal.ai/models/bytedance/seedance-2.5/text-to-video)
- Kie.ai Seedance 2.0 720p: $0.125/s, billed in credits/points (figure reported by a competitor's blog, not Kie's own page). — [Atlas Cloud: cheapest API provider guide](https://www.atlascloud.ai/blog/guides/cheapest-api-provider-seedance-kling-wan)
- Higgsfield via MCP: Seedance 2.0 at 3 / 4.5 / 12 credits per second (480p/720p/1080p); Seedance 2.5 at 3 / 7 / 16 (MCP quote). — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)

**Video — Kling 3.0**
- Kling official developer API: Kling 3.0 with native audio $0.126/s at 720p and $0.168/s at 1080p; without audio $0.084/s and $0.112/s; Kling 3.0 Turbo $0.112/s (720p) and $0.14/s (1080p). — [Kling API pricing (video)](https://kling.ai/document-api/pricing/base/video.md)
- fal.ai Kling 3.0 Pro: $0.224/s audio off, $0.336/s audio on (third-party summary); another fal page cites $0.168/s for Kling 3.0 Pro with audio and $0.168/s for motion control (conflict between fal sources). — [aireiter Wan 2.2 Animate guide](https://aireiter.com/blog/wan2-2-animate-guide); [fal: Seedance 2.0 vs Kling 3.0](https://fal.ai/learn/tools/seedance-2-0-vs-kling-3-0)
- Atlas Cloud: Kling 3.0 Std $0.071/s, Pro $0.095/s (vendor's own blog). — [Atlas Cloud: cheapest API provider guide](https://www.atlascloud.ai/blog/guides/cheapest-api-provider-seedance-kling-wan)
- Higgsfield via MCP: Kling 3.0 std 2 credits/s, pro 2.5 credits/s (audio on) (MCP quote). — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)

**Motion transfer / object swap equivalents**
- Kling 3.0 Motion Control (1 reference image + 1 motion video): on Higgsfield 17 credits for 10 s std (MCP quote); on WaveSpeed from $0.63 per run. — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp); [WaveSpeed Kling 3 motion control](https://tropical.wavespeed.ai/kling-3-motion-control-api)
- Wan 2.2 Animate Move on fal.ai: $0.08 per video second at 720p, $0.06 at 580p, $0.04 at 480p. — [fal.ai Wan 2.2 Animate Move](https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/move)
- Wan 2.2 Animate on WaveSpeed: from $0.20 per run, clips up to 120 s at 720p. — [WaveSpeed Wan 2.2 Animate](https://www.wavespeed.ai/models/wavespeed-ai/wan-2.2/animate)
- Runway API `gen4_aleph` (video-to-video edit, incl. object changes) and `act_two` (performance transfer): a third-party table lists 15 and 5 credits respectively with dollar ranges $0.25–0.75 and $0.50–1.50; units (per second vs per clip) are unclear. — [dev.to AI video models research](https://dev.to/buildandcodewithraman/ai-video-creation-models-research-15n3)
- Also inside Higgsfield's own catalogue: Kling 3.0 Omni Edit (`kling_video_edit`), Seedance 2.5 `video_edit` mode and Kling 4.0 `video-edit` mode are generic video-edit paths that can swap objects without Genjutsu. — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)

**Cost comparison (10-second 9:16 clip, audio on; USD; Higgsfield credit valued at $0.043 Ultra plan – $0.059 top-up)**

| Item | Higgsfield (credits → USD) | fal.ai | Official vendor API | Cheap reseller (2nd-hand) |
|---|---|---|---|---|
| Nano Banana Pro 2K image | 2 → $0.09–0.12 | $0.15 | $0.134 (Google) | $0.09 (Kie) |
| Seedance 2.0, 720p, 10 s | 45 → $1.94–2.66 | $3.03 | n/f (BytePlus) | $1.25 (Kie) |
| Seedance 2.0, 480p, 10 s | 30 → $1.29–1.77 | n/f | n/f | n/f |
| Seedance 2.5, 720p, 10 s | 70 → $3.01–4.13 | $4.73 | n/f | n/f |
| Kling 3.0 std/720p, 10 s | 20 → $0.86–1.18 | $1.68–3.36 (Pro; sources conflict) | $1.26 (Kling) | $0.71 (Atlas) |
| Wan (3.0 on HF / 2.2 Animate on fal), 720p, 10 s | 15 → $0.65–0.89 | $0.80 (Animate Move) | n/f | n/f |

(n/f = not found in this research. The USD columns for Higgsfield are derived, see Inferences.)

### Inferences
- The table's Higgsfield USD figures are computed from MCP credit quotes × assumed credit value; they are estimates, and currency (EUR top-ups vs USD plans) is treated as roughly at par.
- BYOK feasibility: fal.ai, Replicate, Kie.ai, WaveSpeed, PiAPI, Google Gemini API, Kling's developer API, BytePlus/Volcengine and Runway all authenticate with a per-account API key and bill a prepaid/metered balance, so "each contractor pastes their own key, stored encrypted server-side" is technically straightforward on all of them. No source was collected on each provider's key-sharing terms; that is standard practice but unverified here.
- A multi-provider design costs the contractor several accounts/keys (e.g. Google for images + Kling for video + fal for Wan Animate) versus one Higgsfield login covering Nano Banana Pro, Seedance, Kling, Wan, Genjutsu, dubbing and Topaz. Operational simplicity favours Higgsfield; raw unit price for Kling/Seedance may favour a reseller.
- Genjutsu's distinctive capability (many reference images → multi-subject motion transfer; multi-object replacement in a 4–30 s clip) has no confirmed 1:1 equivalent elsewhere: Kling Motion Control and Wan Animate take a single subject image; Runway Aleph is prompt-driven editing. If Genjutsu is essential to the workflow, Higgsfield is required for that step regardless of where the rest runs.
- Low-cost resellers (Kie.ai, Atlas Cloud, PiAPI) have weaker provenance and SLA guarantees than fal/Google/Kling-official; "cheapest" and "reliable" pull in different directions there.

### Gaps
- Kie.ai's, PiAPI's, WaveSpeed's and Replicate's own current price pages for Seedance 2.x, Kling 3.0 and Nano Banana Pro were not read directly; Replicate and PiAPI prices were not found at all.
- BytePlus/Volcengine official Seedance 2.0/2.5 per-token or per-second pricing: not found.
- Runway Aleph / Act-Two official per-second API price: not confirmed.
- fal.ai price for Kling 3.0 standard tier and for Kling Motion Control: conflicting or missing.
- Dubbing (ElevenLabs API) and Topaz API direct prices were not researched; only Higgsfield's 3 credits/s dubbing quote is known.
- Whether the Higgsfield REST API's USD price list is cheaper or dearer than plan credits per model: docs host unreachable.

## 6. Concrete recommendation: cheapest reliable way for 5–10 contractors at ~6–20 short videos/day each

### Takeaway
Build the Railway app as a remote MCP client of `https://mcp.higgsfield.ai/mcp` with per-contractor OAuth (no passwords, no shared accounts), so each contractor's own Higgsfield plan credits are debited; expect volume to exceed any plan's monthly credits, so contractors will need Ultra plus auto-refill, and keep a pluggable BYOK fallback (Kling official API / fal.ai / Gemini API) for cost control and resilience. Everything in this section is inference built on the findings above.

### Cited Findings
- MCP/CLI generations always consume credits; Unlimited is web-only and for manual use (search summary). — [Higgsfield help: What is Higgsfield MCP](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp)
- REST API uses a separate USD balance; plan credits are not transferable to it (search summary). — [Higgsfield help: What is the Higgsfield API](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api)
- Credit quotes used below: Nano Banana Pro 2K = 2; Seedance 2.0 10 s = 30 (480p) / 45 (720p) / 120 (1080p); Kling 3.0 std 10 s = 20; Wan 3.0 720p 10 s = 15 (MCP quotes, 2026-11-22). — [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)
- Ultra reported at $129/month for 3,000 credits; top-ups at €59 per 1,000 / €230 per 4,000, 90-day expiry. — [Higgsfield blog: pricing explained](https://higgsfield.ai/blog/higgsfield-pricing-explained); [Higgsfield MCP endpoint](https://mcp.higgsfield.ai/mcp)
- Higgsfield itself notes that 300 clips need about 9,600 subscription credits, more than Ultra's monthly allotment. — [RuntimeWire](https://runtimewire.com/article/higgsfield-video-api-subscription-pricing-at-scale)
- MCP client registration is moving to CIMD with a 31 Dec 2026 date. — [Higgsfield blog: MCP moves to CIMD](https://higgsfield.ai/blog/higgsfield-mcp-moves-to-cimd)

### Inferences
**Volume model (assumptions: 22 working days/month; one "video" = one 10 s clip + 2 Nano Banana Pro 2K images; no retries, no Genjutsu/dubbing/upscale — real usage will be higher, plausibly 1.5–2× with rejects)**

| Recipe per video | Credits/video | 6/day (132/mo) | 20/day (440/mo) |
|---|---|---|---|
| Seedance 2.0 720p | 49 | ~6,500 credits | ~21,600 credits |
| Seedance 2.0 480p | 34 | ~4,500 | ~15,000 |
| Kling 3.0 std | 24 | ~3,200 | ~10,600 |
| Wan 3.0 720p | 19 | ~2,500 | ~8,400 |

- At roughly $0.043–0.059 per credit, a contractor on Seedance 2.0 720p spends about $280–385/month at 6 videos/day and $930–1,275/month at 20/day; on Kling 3.0 std about $140–190 and $455–625. Ultra's 3,000 credits cover only the Kling/Wan recipe at the low end; every other case needs top-ups or auto-refill.
- Same workload on pay-per-use, Seedance 2.0 720p: fal.ai ≈ $3.33/video → ≈ $440 (6/day) to ≈ $1,465 (20/day) per contractor-month; Kie.ai (second-hand price) ≈ $1.43/video → ≈ $190 to ≈ $630. Kling 3.0 via the official Kling API + Gemini images ≈ $1.53/video → ≈ $200 to ≈ $675.
- So: Higgsfield credits beat fal.ai by roughly 20–40% for Seedance 2.0 and Nano Banana Pro; Kling's own API is about par with Higgsfield for Kling 3.0; only low-cost resellers are clearly cheaper, with less certainty about reliability and pricing.

**Recommended architecture**
1. Primary path: per-contractor OAuth to the official Higgsfield MCP from the Railway backend. Each contractor clicks "Connect Higgsfield", logs in on higgsfield.ai, and the app stores only OAuth tokens (encrypted at rest, per user, with a disconnect button). No password ever reaches the app. Register the client via CIMD on a fixed custom domain before 31 Dec 2026.
2. Before each job call the estimate tool and `balance`, show the contractor the credit cost, and block if insufficient — this prevents surprise drain of someone's personal credits and gives an audit trail (`transactions`).
3. Throttle per contractor (small fixed concurrency, queue, exponential back-off, no blind retries) because limits are undocumented and enforcement includes temporary suspension.
4. Default recipes that minimise credits: Nano Banana Pro 2K (2 credits) for stills; Kling 3.0 std or Wan 3.0 for routine clips; Seedance 2.0 at 480p/720p when its quality is needed; reserve Seedance 2.5 and 1080p for finals (2.5 at 720p costs 56% more than 2.0; 1080p costs 2.7× 720p). Genjutsu, dubbing and Topaz only on approved clips.
5. Keep generation behind a provider interface with an optional BYOK fallback per contractor (Kling developer API, fal.ai, Gemini API). This hedges against MCP schema changes, the CIMD cut-over, and Higgsfield price changes, and lets high-volume contractors move commodity Kling/Seedance work to whichever is cheaper while keeping Higgsfield for Genjutsu.
6. Contractors who want to exploit their plan's Unlimited models can still do so manually in the Higgsfield web UI and upload results to the tool; the tool must not automate the web UI.

**What not to do**
- Do not collect contractors' Higgsfield passwords or session cookies, and do not use browser-automation/unofficial clients: plaintext or replayable credentials on the server are a security liability, and automated use of the consumer web app/Unlimited conflicts with Higgsfield's stated terms and is the most plausible ban trigger.
- Do not put all contractors on one shared account (non-transferable licence; single point of failure if suspended).
- Do not choose the Higgsfield REST API if "use my subscription credits" is a hard requirement; it bills a separate USD wallet.

### Gaps
- A live end-to-end test is still needed: register a custom OAuth client against the MCP from a non-AI-assistant backend, confirm it is accepted, measure token lifetime/refresh behaviour, and confirm generation tools work without the interactive widgets.
- Real per-plan concurrency limits and whether 20 videos/day/contractor triggers throttling: unknown until tested.
- True cost per finished video depends on retry rate and on Genjutsu/Topaz credit costs, which were not obtainable.
- Whether Higgsfield offers a partner/agency arrangement (bulk credits, sanctioned multi-seat integration) that would be cheaper than individual Ultra + top-ups: not researched; worth asking Higgsfield sales given 5–10 seats at high volume.
