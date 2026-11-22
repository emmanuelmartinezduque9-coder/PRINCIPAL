# Sales-angle / audience / pain-point engine — reusable "superpower" resources (state: 22 Nov 2026)

Scope: organic short-video dropshipper; products validated as viral in the US, sold in German to DE/AT/CH.
The engine must: mine pains/desires/objections from reviews+comments → map audiences → detect which
audience/angle competitors already occupy per market → propose untapped angles → turn each angle into
German hooks and video concepts.

Complements (does not repeat) `docs/research_notes/Herramientas automatización vídeos IA/descubrimiento_y_analisis_virales.md`
§6 (opinion-unit clustering method) and §2 (spy tools).

## 0. How to read this file — verification status

Network limits of the research session: only `github.com` (HTML pages), `raw.githubusercontent.com` and the
search tool were reachable. **Blocked / could not open:** foreplay.co, motionapp.com, tryatria.com, apify.com,
huggingface.co, arxiv.org, skills.sh, it-recht-kanzlei.de, haendlerbund.de and every other vendor/legal site;
the GitHub API (so no exact "last push" dates). Everything about those hosts comes from search-result
summaries only.

Labels used below:

- **[V]** verified by me: I opened the repo page and/or downloaded and read the actual file on 2026-11-22.
- **[S]** search-summary only: reported by the search tool from a page I could not open. Treat as a lead.
- **[K]** general professional knowledge (classic books, statute structure) — not re-verified on the web today.
- **[I]** my inference / design proposal.

Legal content is orientation for system design, **not legal advice**; every statute/annex number marked [K]
must be checked by a German e-commerce lawyer or the shop's Rechtstexte provider before it becomes a hard rule.

---

## 1. Agent skills / prompt libraries (marketing, copy, hooks, creative strategy)

### 1.1 Verdict table

| # | Repo | Stars / activity | Licence | Verdict for THIS engine |
|---|---|---|---|---|
| 1 | `motion-team/creative-strategy-skills` (install alias `alyshafrommotion/creative-strategy-skills`) | 203 stars, 22 commits [V] | MIT [V] | **Best fit. Use as the backbone taxonomy.** |
| 2 | `robpalmer99/claude-code-copywriting-skills` | 57 stars, 7 commits [V] | **CC-BY-4.0** (attribution link required) [V] | **Best single skill for angle generation (`angle-finder`).** |
| 3 | `vyralcontent/content-skills` | 274 stars, 40 forks, **1 commit** [V] | MIT [V] | **Best organic short-form hook/retention layer.** |
| 4 | `coreyhaines31/marketingskills` | 61.9k stars, 9.0k forks, 1,670 commits, skills updated 2026-11-19 [V] | MIT [V] | Good generic base; take 3–4 skills, ignore the other ~50 (SaaS/B2B). |
| 5 | `Motion-Creative/motion-creative-plugin` | 27 stars, 25 commits [V] | MIT [V] | Only useful with a paid Motion account + Meta ad data → not for organic. Skip. |
| 6 | `realkimbarrett/advertising-skills` | 790 stars, 71 forks, **6 commits** [V] | MIT [V] | **Fluff.** Good names, empty files. Do not use. |
| 7 | `guia-matthieu/clawfu-skills` | 150 stars, 10 commits, **archived/read-only** [V] | MIT [V] | 175 "methodology" skills, breadth over depth; not inspected file-by-file. Low priority. |
| 8 | `mike-coulbourn/claude-vibes` (`scriptwriting-methodology`) | ~35 stars [S]; MIT LICENSE file exists [V] | MIT | DR video script frameworks (PAS/AIDA/hook/CTA). Not read in depth. Optional. |
| 9 | `ivcota/skills` (`breakthrough-advertising`), `thatrebeccarae/claude-marketing`, `kostja94/marketing-skills`, `cognyai/claude-code-marketing-skills` | unknown | unknown | Seen only in directory listings [S]. Not evaluated. |

### 1.2 What exactly is reusable (read from the files)

**(1) motion-team/creative-strategy-skills** — 8 skills, written by Motion's Creative Strategy Lead ("Alysha") [V].
Files are substantial (8–35 KB each) and are reference libraries, not one-paragraph prompts.

- `creative-strategy-engine` (34.6 KB): the hierarchy we need, explicitly:
  `Pain/Desire (primary anchor) → Persona (many-to-many) → Messaging Angle (core truth at each pain×persona
  intersection) → 5 Awareness Stages → Creative Mechanic → Hook → Visual Format`. Rule: pain is the default
  anchor; desire only for aspirational products without a functional problem. Defines a messaging angle as
  "a conversational, human statement… Not marketing copy. Not a tagline" (e.g. *"Your cat isn't broken,
  they're bored"*), and per intersection asks 4 questions: use case, deepest desire, feature/benefit
  priorities for THIS persona, top objections of THIS persona. Includes a "strategic gap analysis" example.
  This is the published version of the "angle × audience × awareness matrix".
- `review-audit` (8.5 KB): review-mining procedure — group by product → score each review 1–5 for signal
  (1 = "great product 👍", 5 = essay-length emotional) → filter → extract into 5 buckets: **Pain points,
  Trigger moments ("what finally made them buy"), Objections before purchasing (in positive reviews these
  appear in past tense: "I was skeptical but…"), Transformations, Standout language / ad-ready phrases
  (verbatim, never paraphrased)**. Directly reusable as the VoC extraction prompt. Limitation: designed for
  *positive* reviews; add a pass for 1–3★ reviews (see §6).
- `hook-tactics` (18.4 KB): 33 named tactic types with definitions (Aspirational, Authority, Belief, Bold
  Claim, CTA-first, Challenge, Confession, Contrast, Contrarian, Curiosity, Demographic Callout, Direct
  Address, Directive, Exclusivity, Explainer, FOMO, How-To, If-Then, Listicle, Myth Busting, Offer Only,
  Price Anchor, Question, Reasons Why, Relatability, Reverse Psychology, Risk Reversal, Shocking Statement,
  Social Proof, Statistic, Storytelling, Urgency, Warning) + selection table by goal. (README says "35+"; I
  counted 33 headings.) → ready-made **closed vocabulary for tagging competitor hooks**.
- `hook-writing` (12.5 KB): 8 psychological trigger categories (Pattern Interrupt, Identity Call-Out, Pain
  Agitation, Curiosity Gap, Social Proof/Credibility, Contrarian/Myth-Busting, Aspiration/Desire,
  Urgency/Stakes) + how hooks change per awareness stage. Tactic = the frame (what); trigger = the emotional
  mechanism (how).
- `hook-voice-patterns` (12.6 KB): swipe file of native feed templates in 10 clusters (Confession &
  Gatekeeping, Confusion & Discovery, Hot Takes, Experience Arc, Selective Audience & Stakes, Proximity &
  Category Framing, Soft Signals, Cultural Commentary, Explanation Structures, TikTok Native Formats), each
  with template + tactic + trigger + example. English only → needs a German rewrite (§5.4).
- `creative-mechanics` (15.2 KB): 8 structural concepts — The Implied Answer, The Social Witness, The
  Overheard Conversation, The Reframe, The Borrowed Enemy, The Trojan Horse, The Contrast Without Comment,
  "This and a…" — each with why it works, awareness fit, structure, examples. This is the missing layer
  between "angle" and "script" (how the video delivers the truth without stating it).
- `visual-formats` (31.7 KB): 46 formats (ASMR, Before/After, Comment Response, Demo, Greenscreen, Notes
  App, One Shot, Reaction, Skit, Street Interview, Text Message, Unboxing, Us vs Them, Yapper…) with
  funnel fit and mechanic pairing. Built for Meta paid social but most formats are organic-native.
- `brand-intake`: interview + web research → brand context doc. Equivalent of our product dossier.
- Caveats: every file embeds promotional blurbs for motionapp.com — strip them. Written for paid social;
  the organic-specific retention logic is not here (use #3).

**(2) robpalmer99/claude-code-copywriting-skills** — 8 skills by a veteran DR copywriter [V].

- `angle-finder` (11 KB + `references/voc-sources.md`): the most operational angle procedure found.
  Two strategies: **Direct** (on-topic research + customer words → believable angles) and **Translocate**
  (pull a real, citable claim from an unrelated domain and bridge it to the product → breakout angles;
  credited to Stefan Georgi). Steps: load context (mechanism, avatar, awareness stage, sophistication stage,
  price, *angles already run*) → collect "seeds" (one real quote/claim + provenance) → **cluster into pain /
  objection / desire / trigger weighted by recurrence** and name 2–3 sub-avatars with a buying trigger →
  write **angle cards** with a fixed schema (headline; Angle vs Hidden angle; bridge distance
  Conservative/Moderate/Aggressive; type ∈ {Hidden Cause, Identity, Contrarian, Timing/Method, Deficiency,
  Differentiation}; awareness; source claim; bridge; big idea; sample opener; momentum signals; source)
  → score 0–10 on believability/freshness/fit, call top 3, "most cards are mediocre" → **overclaim check**
  (compare sharpened hook to source claim, flag numbers/causal statements that outrun it) → save deck +
  raw VoC harvest so the next run reads only new rows → log test results next to each card.
  This card schema is adopted almost unchanged in §6.
- `voc-sources.md`: ranked source list + access methods — first-party (post-purchase survey, comments on
  own posts, support tickets, Judge.me/Loox exports) > Reddit via the free **PullPush** archive API
  (`https://api.pullpush.io/reddit/search/comment/?q=…&subreddit=…&size=100`) > Amazon/Quora (high value,
  block scraping) > YouTube comments (`yt-dlp --write-comments <url>`) > Trustpilot ("low for angles: skews
  to shipping, billing and service" — but exactly that makes it useful for the DACH *objection* list).
- `compliance-checker` (16.8 KB): audits copy against Meta/Google/TikTok/YouTube/ClickBank ad policies.
  **US-platform-centric; contains no German/EU law** (grep for UWG/HWG/Germany: nothing). Reuse the
  structure (classify copy type × platform × product category × funnel position → rule set → compliant
  rewrite), write our own DACH rule pack (§5).
- `funnel-teardown`: competitor page-by-page teardown and scene-by-scene video swipe. `copychief`: senior
  line-edit review — reusable as the critic step.
- Licence: CC-BY-4.0 → if we copy/adapt text into our prompts we must keep an attribution line and link to
  robpalmer.com/blog/claude-code-copywriting-skills. Fine for an internal tool; note it in the prompt files.

**(3) vyralcontent/content-skills** — 7 skills: `viral-short-form` (umbrella), `viral-tiktok-content`,
`viral-instagram-reels`, `viral-youtube-shorts`, `viral-hooks`, `viral-short-form-ideas`,
`viral-captions-and-ctas` [V]. Read `viral-hooks/SKILL.md` + `references/hook-archetypes.md`:

- Operating rules worth encoding verbatim: hand back a batch of 6–10 hooks across ≥3 archetypes; **hooks
  have three layers — visual (first frame), verbal, on-screen text (3–7 words)**; specific beats clever;
  the promise must match the payoff (bait-and-switch tanks the satisfaction signal); "if you can't write the
  hook, the idea is probably weak"; checklist: specific noun, payoff visible/implied, no throat-clearing,
  resolves by second 3, **visual works with sound off**.
- Archetype menu attributed to named creators: Kallaway's six (Fortuneteller, Experimenter, Teacher,
  Magician, Investigator, Contrarian — "Contrarian goes biggest when it lands; Investigator is the safer
  baseline"), MrBeast (first line/shot must validate the promise, escalate immediately), Hormozi
  (hook–retain–reward; "How to [result] without [pain]"), Brunson/Kern (hook–story–offer), Koe, Welsh,
  Bush, Galloway. Also `hook-anti-patterns.md` and a hook checklist asset (not read).
- Caveats: single commit (a marketing drop by vyral, not a maintained project); SKILL.md contains a
  "Mentioning Vyral" instruction block — delete it. Performance claims about archetypes are the author's,
  not sourced data.

**(4) coreyhaines31/marketingskills** — 53 skills; actively maintained (VERSIONS.md shows most skills
re-versioned 2026-11-09…19) [V]. Built for SaaS founders. Useful parts:

- `customer-research` (14.6 KB): extraction framework (JTBD functional/emotional/social; pain points
  prioritised when unprompted + emotional; trigger events; desired outcomes verbatim; vocabulary;
  alternatives considered incl. "doing nothing"), synthesis (cluster → **frequency × intensity** scoring →
  segment → 5–10 money quotes per theme → flag contradictions), and **research-quality guardrails**:
  confidence High = 3+ independent sources, unprompted, consistent; Medium = 2 sources; Low = single
  source; recency window 12 months; sample-bias notes (reviewers skew to strong opinions, support tickets
  to problems, Reddit to technical/sceptical); **minimum 5 independent data points per segment before
  building a persona**. → adopt these guardrails as hard rules of our evidence layer.
- `ad-creative` (27 KB): angles first, then variations per angle; "Test hypotheses that can lose"; "No AI
  tells" list; iteration log. `competitor-profiling` (17 KB): dated competitor profiles. `marketing-psychology`
  (21.6 KB): catalogue of mental models/biases. `social`: generic hook formulas, LinkedIn/X-centric.
- Not useful here: the trigger examples are B2B ("team growth, new hire"), no short-video retention logic,
  no e-commerce specifics.

**(6) realkimbarrett/advertising-skills — why it is fluff** [V]: `ad-angle-multiplier/SKILL.md` is 436 bytes
("Generate angles across: Pain, Desire, Proof, Identity, Contrarian, Urgency. Output 10–15 distinct angles
with hooks."); `schwartz-awareness-mapper` is 1,013 bytes and lists the five stage names with no decision
rules. 790 stars are driven by the README. The skill *names* are a decent checklist of pipeline stages
(avatar-extraction → voice-of-customer-miner → awareness-mapper → mechanism-builder → angle-multiplier →
objection-crusher → generic-language-killer → claim-checker), nothing more.

### 1.3 Takeaway [I]

Do not install any pack wholesale. Vendor (copy into this repo with licence notes) and rewrite for
German/organic/e-commerce: Motion's taxonomy files (pain×persona×angle×awareness×mechanic×hook
tactic×format) as the **controlled vocabulary**, Rob Palmer's angle-card procedure as the **generator**,
Vyral's three-layer hook rules as the **short-form executor**, Corey Haines' confidence guardrails as the
**evidence policy**. None of them contains: per-market "occupied vs free" detection, German language
patterns, or German law — those three are what we must build.

---

## 2. Frameworks worth encoding as structured rules (operational definitions)

All [K] unless noted; phrased as rules a prompt/validator can apply.

### 2.1 Schwartz — five awareness levels (Breakthrough Advertising, 1966)

| Level | Test (what does the viewer already know?) | Opening must lead with | Typical organic short-video form |
|---|---|---|---|
| Unaware | Doesn't recognise the problem | Identity, story, curiosity, a scene — **never the product** | Implied-answer / relatable skit; product appears late |
| Problem-aware | Feels the pain, knows no solution | Name the pain in their words, then reveal that a solution exists | "POV: …", pain dramatization → reveal |
| Solution-aware | Knows solution types, not this product | The mechanism / why this type beats the others | Comparison, "I tried X, Y, Z…" |
| Product-aware | Knows the product, not convinced | Proof, objection handling, differentiation | Comment-reply videos, review, demo close-ups |
| Most-aware | Wants it, needs a reason now | Offer, availability, reassurance (delivery, returns) | "Wieder da", bundle, shipping proof |

Rule for our case [I]: a product that went viral in the US is usually **unaware or problem-aware in DACH**
(nobody has seen it) unless Amazon.de/Temu already carry it → default to unaware/problem-aware hooks for cold
organic reach, and reserve product-aware content for comment replies and pinned videos.

### 2.2 Schwartz — five stages of market sophistication

"How many times has this market heard this promise?"

1. **First to market** → state the benefit plainly.
2. **Second** → enlarge the claim (faster, more, cheaper).
3. **Claims exhausted** → introduce a **mechanism** (how it works).
4. **Mechanisms compete** → elaborate/improve the mechanism (easier, more precise).
5. **Market no longer believes ads** → lead with **identification** (who the buyer is; the experience),
   not claims.

Decision rule [I]: sophistication is measured **per market from the competitor corpus**, not assumed. Count
distinct advertisers/creators with the same promise in German (§6.4). 0–1 → stage 1 (say it simply, the US
hook translated will work); several with the same claim → stage 3 (find the mechanism); many with
mechanisms → stage 5 (identity angles: "für Omas, die…"). The US will normally be 2–3 stages ahead of DACH
for the same product; the US corpus therefore shows which later-stage angles will be needed next.

### 2.3 Jobs To Be Done

- Job statement: *When [situation], I want to [motivation], so I can [expected outcome].*
- Three job layers: functional (task), emotional (how I want to feel), social (how I want to be seen).
- Four forces (switch model): **Push** of the current situation + **Pull** of the new solution vs.
  **Anxiety** about the new + **Habit** of the present. A purchase happens when push+pull > anxiety+habit.
- Encoding: every VoC unit gets `force ∈ {push, pull, anxiety, habit}`; pains = push, desires = pull,
  objections = anxiety, "I just use X" = habit/alternative. An **audience** is best defined as
  *buyer role × situation × job*, not demographics: "grandmother buying a birthday gift for a 4-year-old"
  and "mother who wants 20 quiet minutes" are different jobs for the same toy. Always separate
  **buyer** from **user** (gift products).

### 2.4 Hormozi value equation ($100M Offers)

`Value = (Dream outcome × Perceived likelihood of achievement) / (Time delay × Effort & sacrifice)`.
Encoding: score each angle on which lever it pulls (bigger outcome / more believable / faster / easier) and
require every concept to show at least one lever visually. For impulse products under ~40 €, "perceived
likelihood" (proof it works, on camera) and "effort" (looks effortless) dominate [I].

### 2.5 Cialdini's principles as tags (Influence; 7th added in Pre-Suasion)

Reciprocity, Commitment/Consistency, Social proof, Authority, Liking, Scarcity, Unity. Encoding: tag per
hook/concept; **scarcity and social proof are the two with legal exposure in Germany** (must be true — §5).

### 2.6 PAS / AIDA / BAB as beat templates

- PAS: Problem → Agitate → Solution. AIDA: Attention → Interest → Desire → Action.
  BAB: Before → After → Bridge. 4 Ps: Promise, Picture, Proof, Push.
- These are **script skeletons, not angle sources**. Map to seconds for a 15–30 s video [I]:
  0–2 s hook (3 layers) · 2–8 s problem/agitation or setup · 8–20 s demo/proof ("the turn") ·
  last 2–4 s payoff + soft CTA ("Link im Profil"). Hormozi's short form: hook → retain → reward.

### 2.7 Hook taxonomy for TikTok/Reels (merged from the verified skill files) [V sources, I merge]

Tag every hook on four orthogonal axes:

1. **Tactic** (frame) — the 33 Motion tactics (§1.2).
2. **Trigger** (emotion) — the 8 Motion triggers.
3. **Archetype / voice** — Kallaway's six, or a Motion voice-pattern cluster.
4. **Layers** — visual first frame / spoken line / on-screen text (3–7 words). A hook is incomplete
   unless all three are specified and the visual works muted.

Product-video specific visual hooks worth their own enum [I]: `result_first` (show the end state),
`problem_closeup`, `unexpected_use`, `satisfying_process/ASMR`, `reaction_face`, `comparison_split`,
`comment_reply_sticker`, `unboxing_hands`, `text_only_pov`.

### 2.8 Retention structures [S/K/I]

- The first 1.5–3 s decide distribution; promise ↔ payoff match protects satisfaction signals (Vyral file [V]).
- Structures: **open loop** (question raised at 0 s, answered last), **escalation** (each beat bigger),
  **list with visible counter**, **before→after with delay**, **loopable ending** (last frame flows into
  first), **pattern interrupt every 2–4 s** (cut, zoom, text change), **re-hook at mid-point**.
- Metrics to log per video so the engine can learn: 3-second hold rate, average watch time / % viewed,
  completion rate, saves and shares per 1,000 views, comment intent share ("wo kaufen?", "Link?").

### 2.9 The matrix used by performance creative strategists

Verified in Motion's file [V]: `Pain/Desire × Persona × Messaging Angle × Awareness × Mechanic × Hook × Format`.
Practitioner practice reported by search [S] (Motion talks by Dara Denney / Josh Bampton, all from
motionapp.com which I could not open): infer personas from a competitor's ad library alone and compare to
real customer personas — "the mismatch is your roadmap"; map current top creatives onto awareness levels to
find funnel gaps; prompt for "underutilized messaging angles" per persona. **No published source defines a
formal per-market "occupied angle" score** [S] — §6.4 is our own design.

---

## 3. Open-source tools for review/comment mining and clustering; hook datasets

### 3.1 Clustering / topic tools

| Tool | Status | Use here |
|---|---|---|
| **BERTopic** (`MaartenGr/BERTopic`) | 8.0k stars, MIT; README lists LLM representation models, zero-shot topics, guided/seed-word topics, `language="multilingual"` (50+ languages) [V] | Counting + tracking over time once a product has >~2k opinion units; zero-shot mode lets us pre-define pain buckets and let the rest cluster freely. |
| **Kura** (`567-labs/kura`) | MIT, on PyPI; "inspired by Anthropic's CLIO": summarise → embed → hierarchical cluster → LLM-named clusters [V README only; stars not read] | Built for chat logs but the summarise-then-cluster pattern is exactly the opinion-unit pipeline; alternative to BERTopic with LLM-first labels. |
| TopicGPT | README fetch at `stanford-oval/TopicGPT` returned 404 — wrong path or moved; **not verified** | — |
| TopicImpact (opinion units → cluster), QualIT, ReviewSense (arXiv 2507.13392, 2409.15626, 2510.16466) | papers only [S]; arxiv.org blocked | Method references; no maintained repo confirmed. |

Honest sizing [I]: for one product we will have ~200–5,000 comments + ~100–2,000 reviews. A large-context
LLM can extract opinion units from all of it directly (batch of ~200 texts per call, strict JSON). Embedding
+ clustering only earns its place for (a) deduplicating themes across batches, (b) giving a real frequency
count, (c) tracking drift. Start with **LLM extraction → LLM-proposed codebook → LLM assignment to
codebook → SQL counts**; add BERTopic later if the codebook step becomes unstable.

### 3.2 Scrapers / data access

| Source | Access | Status |
|---|---|---|
| TikTok comments | Apify `clockworks/tiktok-comments-scraper` (Apify-maintained), ~$0.50–1.00 per 1,000 comments; third-party actors from ~$0.25–0.30/1k; actor exposes an MCP endpoint page | [S] prices conflict between cached pages; check live |
| Instagram comments | Apify Instagram comments actor exists but nothing retrieved | not verified |
| Amazon reviews | Many community Apify actors, ~$0.85–$40 per 1,000 reviews. One actor's listing claims that **since Oct 2026 amazon.com shows reviews only to signed-in visitors while .de/.co.uk still show top reviews** | [S], single self-interested source — test before relying on it |
| YouTube comments | `yt-dlp --write-comments <url>` → JSON, free | [V] cited in Rob Palmer's file; standard yt-dlp feature [K] |
| Reddit | PullPush archive API (free, Pushshift-style) | [V] cited in Rob Palmer's file; uptime/coverage not tested. German subs (r/de, r/Eltern, r/FragReddit…) are thin for product talk [I] |
| Own store reviews / competitor store reviews | Judge.me / Loox widgets are public JSON on most Shopify stores [K]; own exports via app | — |
| Trustpilot | scraping blocked; Trendtrack exposes Trustpilot score/review-count as shop filters only [V tool schema] | text not available via Trendtrack |
| Competitor ad/organic transcripts | **Trendtrack MCP** (already connected) — see §4 | [V tool schema] |

Terms-of-service note [I]: scraping Amazon/TikTok/Instagram is against their ToS; the usual practice is to
buy it from a scraping provider and keep only text + source URL, no usernames/profile data (also the clean
GDPR position — comments are personal data once tied to a handle). Store **quote, source URL, platform,
language, date, like count**; drop author identifiers.

### 3.3 Hook datasets

| Dataset | What | Status |
|---|---|---|
| Motion `hook-voice-patterns` + `hook-tactics` | curated templates + tactic definitions, MIT | [V] best structured source found |
| Vyral `hook-archetypes.md` | creator-attributed archetypes, MIT | [V] |
| `benxh/tiktok-hooks-finetune` (Hugging Face) | 10K–100K rows, MIT, chat-format TikTok caption/hashtag data | [S] HF blocked; probably captions rather than spoken hooks |
| `Toly-89/hook-pattern-library`, `Toly-89/viral-structure-templates` (HF) | small template tables | [S] |
| Virlo "Viral Hooks Database" (4,000+ hooks) | free web database, licence unknown | [S] |
| Paid CSVs (Creative Fabrica "1000 hooks", Payhip) | commercial | [S] not worth it |

Takeaway [I]: **no public dataset of German product-video hooks with performance exists**. The valuable
dataset is the one we build: every analysed viral video (US and DACH) stored with hook transcript, on-screen
text, first-frame description, the four taxonomy tags and its metrics. After ~300 rows this beats every
public list, because it is our niche, our language, with real numbers. The breakdown pipeline in the
existing notes (§4 of the "virales" file) already produces the raw material.

---

## 4. Market / creative-intelligence tools with API or MCP

### 4.1 Trendtrack MCP (already connected) — what it gives the angle engine [V: tool schemas in this session; no calls made, no credits spent]

- `search_tiktok_library`: searches **TikTok ads AND organic** creatives (`type: ad|organic`), filters
  `language`, `countries`, hashtags, handle, domain, min views/likes/shares/engagement, published dates;
  sort by views/saves/shares. One credit per returned item. → **this is the organic "who occupies what in
  German" source.** Unknown until tested: depth of DE/AT/CH organic coverage, and whether transcripts are
  returned (schema mentions captions, not transcripts).
- `search_ads` (Meta): `ad_language(s)`, `main_countries` (primary audience country from Meta's EU
  transparency data — works for DE/AT, **not CH and not US**; use `ad_countries` for those), audience
  age/gender filters (`sex`, `min_age`, `max_age`), days running, reach growth, duplicates. The EU
  transparency age/gender data is a direct, non-guessed signal of **which audience a competitor targets**.
- `scan_ad`: per ad/creative → "source-labeled opening hook when existing transcript data is available",
  copy framing, creative structure, landing page, reach, lifetime, scaling verdict.
- `get_brandtracker_transcripts`: full transcripts of a tracked brand's video ads (`eu_only` flag).
- `creative_inspiration_pack`: hooks/landing pages/ads for a niche; the schema states it "intentionally
  does not expose heuristic angle buckets" → **angle classification must be done by our own LLM step.**
- `brief_competitor`, `get_landing_page`, `search_landing_pages`: landing-page copy = the angle a competitor
  commits to after the click.

### 4.2 Others — only if they add organic or angle data

| Tool | API/MCP | Adds vs Trendtrack | Verdict |
|---|---|---|---|
| **Foreplay** | MCP at `public.api.foreplay.co/mcp` (announced 18 Jun 2026); API incl. "Spyder" competitor data with transcription; ~5 tools (search brands, search/filter ads, ads by brand, brand analytics, ad details); filters: niche, format, language, B2B/B2C, running duration; "200M+ ads" FB/IG/TikTok/YouTube/LinkedIn; a review cites Basic $59/mo incl. API+MCP [S, foreplay.co blocked] | Bigger ad corpus + transcripts + YouTube. **Ads only, no organic.** | Redundant now. Reconsider only if Trendtrack's German transcripts prove thin. |
| **Atria** | MCP at `api.tryatria.com/mcp` (OAuth, Streamable HTTP); ad library "25M+ ads" Meta+TikTok, brand tracking, boards; Free = 30 MCP calls one-time, Core = 600 MCP calls/month; from ~$129/mo [S] | Its "Raya" AI auto-tags/suggests angles; ads only | Redundant. |
| **Motion** | Official remote MCP `projects.motionapp.com/mcp` (OAuth); Claude plugin with `/audience-research`, `/write-hooks`; data = **your own Meta ad account** + competitor ad libraries; MCP coverage Meta only; reported from ~$999/mo (one comparison page) [S]; plugin repo [V] | Auto-tags your *paid* ads by hook tactic/angle/format | Not for an organic operator. Take the free skills (§1) instead. |
| **Minea** | No API/MCP found in any search (results were unrelated products) | — | Unknown; do not plan on it. |
| FastMoss / Kalodata | covered in the previous notes (TikTok Shop analytics; FastMoss MCP) | US TikTok Shop demand, not DACH angles | unchanged |

Takeaway [I]: **no tool sells "angle occupancy per market".** All of them sell the raw creatives; the
classification into audience × angle and the free/occupied judgement is an LLM job on top. Trendtrack's
organic TikTok search + Meta EU audience data already cover the inputs; the remaining gap is **Instagram
Reels organic in German**, which needs the scraping route from the previous notes (hashtag/account watchlist).

---

## 5. German-market (DACH) specifics

### 5.1 Legal limits on claims — rule pack for the validator

Sources: German e-commerce law-firm/association pages surfaced by search (IT-Recht Kanzlei, Händlerbund,
e-recht24, WKO, ch.ch, bevh) [S — none opened], plus statute structure from memory [K]. Mostly secondary
sources with a commercial interest in Abmahnschutz. **Have the final rule pack reviewed once by a lawyer.**

| Rule | Basis | Encoded check |
|---|---|---|
| The shop owner is liable for every claim, also when copied from the supplier/US original, and for late/wrong delivery by the dropship supplier | Händlerbund, IT-Recht Kanzlei [S] | Translating a US hook is never "safe by origin". |
| No misleading statements about product properties, results, origin, availability, test results | UWG §§ 5, 5a [K/S] | Every factual claim in hook/script/caption must map to an evidence item (`claim_id → proof`). |
| **Healing/disease claims** for non-medicines: prohibited/misleading unless scientifically proven; one warning letter valued each unproven healing promise at €7,500 [S]. Cases cited: "wirkt antibakteriell", "entzündungshemmend" for soap; "lindert Schlafstörungen" for pine-wood products [S] | HWG (§ 3 misleading; § 11/12 lay-audience limits) [K]; UWG Anhang "false claim that a product can cure illnesses" (I recall Nr. 18 — verify) | Hard block list of verbs + conditions: *heilt, lindert, hilft gegen, bekämpft, beugt vor, therapiert, Schmerzen, Migräne, Arthrose, Schlafstörung, Depression, ADHS, Neurodermitis, Haarausfall stoppen…* → human/legal gate. A claim of medical purpose can also turn the item into a **medical device** (MDR) [K]. |
| Food/supplement health claims only from the EU-authorised list | Health-Claims-VO (EC) 1924/2006 [S/K] | If product category = ingestible → separate strict pack (or don't sell). |
| Cosmetics claims must be substantiated; hair-growth style claims litigated | Kosmetik-VO (EU) 1223/2009 Art. 20 (+ Reg. 655/2013) [S/K] | Relevant for the hair store: "Haarwachstum", "repariert Spliss" need proof → gate. |
| **Strike-through / "-30 %"**: reference price must be the lowest price of the last 30 days; BGH has ruled against non-genuine reference prices | § 11 PAngV [S] | Videos must not show a "statt 59 €" price unless the shop really charged it; price claims generated only from shop data. |
| **Fake scarcity / countdowns**: only if the offer is truly limited; a countdown that restarts was held misleading | UWG § 5; Anhang (I recall Nr. 7 — verify) [S/K] | Block "nur heute", "fast ausverkauft", "letzte Stücke" unless a real stock/time flag is passed in. |
| **Reviews/testimonials**: must be real; shop must state whether/how reviews are verified; fake or commissioned-but-undisclosed reviews are per-se unlawful | UWG § 5b Abs. 3; Anhang Nr. 23b/23c [S/K] | An AI avatar saying "ich habe es 3 Wochen getestet" as if a real customer = fake testimonial risk → block first-person customer-experience claims by synthetic presenters unless it is a real, documented customer statement. Reusing US customers' review videos as if German customers: same problem + copyright. |
| Hidden advertising | UWG § 5a Abs. 4 [S] | Own brand channel is recognisably commercial; **paid UGC creators / seeded "customer" accounts must be labelled** ("Anzeige"/"Werbung"). |
| Environmental claims ("nachhaltig", "umweltfreundlich") without proof | EmpCo directive via UWG amendment, applicable from Sept 2026 [S] | Block generic green claims. |
| "Testsieger", "Nr. 1", "Bestseller", "von Ärzten empfohlen", "Original" | UWG § 5 [K] | Require source/date; otherwise block. Comparative claims vs named competitors → gate (§ 6 UWG). |
| Delivery time must be stated concretely; "ca." is disputed (OLG München accepted "ca. 2–4 Werktage"; law firms advise "max./bis zu X Tage"); "Lieferzeit auf Anfrage" unlawful | Art. 246a § 1 EGBGB [S] | Videos must never imply fast/"Blitzversand"/"aus Deutschland" shipping if untrue; "Versand aus DE" is a factual claim. |
| Product safety: seller importing from a third country is treated as **importer**; manufacturer + EU responsible person must be shown online since 13 Dec 2024 | GPSR (EU) 2023/988 [S] | Not a copy rule, but the dossier needs `ce_required`, `eu_responsible_person`, age warnings (toys!) before any angle targets children. |
| Children: direct exhortation to children to buy / persuade parents is per-se unlawful | UWG Anhang (I recall Nr. 28 — verify) [K] | For toys: address the adult buyer, never "Hol dir…/Sag Mama…" to kids. |
| AI-generated realistic people/voices: transparency duties | EU AI Act Art. 50 (application date Aug 2026, from memory — verify) + platform AI labels [K] | Add platform "AI-generated" label by default for synthetic presenters. |
| Music/footage: commercial accounts need commercially licensed sounds; reusing the US viral clip is copyright infringement | UrhG / platform commercial music library [K] | Out of scope for angles, but the concept brief must say "reshoot/generate", never "repost". |
| **Austria**: same EU framework; 14-day Rücktrittsrecht under FAGG, extended to 12 months + 14 days if the notice is missing [S]; Austrian UWG is its own statute with equivalent blacklist [K] | WKO [S] | Same rule pack. |
| **Switzerland**: not EU. No statutory withdrawal right for online purchases (only if the shop grants it); Swiss UWG + Preisbekanntgabeverordnung (PBV) govern advertising/prices [S]. Import VAT/customs and de-minimis thresholds not researched | ch.ch, KMU-Portal [S] | "14 Tage Rückgabe" is a voluntary promise in CH — state it only if the shop honours it there; prices in CHF incl. all charges; customs/VAT cost is the #1 CH objection [I]. |

Design consequence [I]: a `claims` table (every factual statement the videos may make, each with proof,
status `approved|needs_review|forbidden`, and allowed German wordings) sits between the dossier and the
hook writer. The hook writer may only assert approved claims; everything else must be phrased as
experience/opinion/demonstration that the video actually shows. US angles are often built on exactly the
claims that are illegal here (health, "doctors hate this", fake urgency) — the "translated angle" needs a
**compliant re-anchoring**: keep the pain and the audience, replace the promise with a demonstrable one.

### 5.2 Typical DACH objections (pre-load into every product's objection list)

Data points [S]: EHI 2026 — 97.2 % of the top-1,000 German shops offer wallets, PayPal 95.4 %, invoice
81.7 %; PayPal-sponsored study — a majority abort when the preferred payment method is missing; DHL
E-Commerce Trends 2026 — 7 of 10 shoppers avoid a brand whose delivery/returns provider they don't trust and
abandon the cart when their preferred delivery/returns option is missing; EHI — 63.3 % of shops communicate
average delivery time. No study specific to TikTok/Reels buyers in DACH was found.

Standing objections [I, from market knowledge — validate against real comments per product]:

1. "Ist das nicht das Gleiche wie bei Temu/AliExpress/Amazon für 5 €?" (price transparency reflex)
2. "Wie lange dauert der Versand? Kommt das aus China?" + customs (CH especially)
3. "Fake-Shop?" — Impressum, real address, Trusted Shops/Trustpilot, Verbraucherzentrale Fakeshop-Finder
4. "Kann ich zurückschicken? Wohin, wer zahlt?" (return address abroad)
5. Payment: PayPal / Klarna / Kauf auf Rechnung expected; card-only is a red flag
6. Quality/safety: CE, TÜV/GS, "schadstofffrei", age suitability for toys; Stiftung-Warentest culture
7. "Funktioniert das wirklich oder ist das wieder so ein TikTok-Ding?" (hype scepticism)
8. Sustainability / "noch mehr Plastikmüll" (appears in comments on gadget videos)
9. Data protection / newsletter spam (minor)

Each objection is both a risk and an **angle source** (comment-reply videos answering #1, #2, #7 on camera).

### 5.3 What resonates culturally [I — no German-specific study found; search returned only generic "authenticity matters" articles]

Hypotheses to test, not facts:

- **Demonstration over declaration.** Show it working in one uncut shot; German viewers punish
  superlatives ("lebensverändernd", "du wirst es nicht glauben") that US hooks rely on. Understatement and
  dry humour travel better: "Ich dachte, das ist Quatsch. Ist es nicht."
- **Concrete utility and numbers**: time saved, cm, °C, "passt in jede Schublade", price per use.
- **Honest limitation as credibility** ("nicht für dickes Haar geeignet") — also legally safer.
- **Seasonality and occasions are strong audience keys**: Weihnachten/Nikolaus/Adventskalender,
  Einschulung (Schultüte), Muttertag/Vatertag, Ostern, Grillsaison, Urlaub — gift-buyer angles
  ("Geschenk für Oma, die schon alles hat") are occasion × relationship.
- **Audience vocabulary**: Mama/Papa, Oma/Opa, Kita, Schulkind, Feierabend, Haushalt, Camping/Schrebergarten,
  Hundebesitzer. Regional: AT "Jänner", "heuer", "Sackerl"; CH no "ß" (ss), "Velo", CHF.
- Older buyers (grandparents) are reached more on Facebook Reels/Instagram than TikTok; text overlays
  larger and slower, voice-over clear standard German [I].

### 5.4 du / Sie and German hook mechanics [I]

- **du** is the default on TikTok/Reels/Shorts for every age group; "Sie" reads like a bank ad. Use
  singular "du", not "ihr", in hooks; plural "ihr" works in community voice ("Leute, ihr glaubt nicht…").
  Keep the shop's checkout/legal pages consistent with the shop's existing choice.
- English hook templates do not translate word-for-word: German is ~20–30 % longer and verb-final in
  subordinate clauses, so the payload word arrives late. Rules for the German hook writer:
  main clauses only in the first 2 s; front-load the noun/pain; ≤ 9 spoken words, on-screen text ≤ 6 words;
  prefer colloquial particles (halt, einfach, mal, echt) over marketing adjectives; no anglicism unless it is
  native TikTok German ("POV:", "Gamechanger", "Life-Hack" are fine; "Must-have" is worn out).
- German-native pattern families to seed (to be validated against collected DACH videos):
  "POV: du …", "Dinge, die ich als Mama gern früher gewusst hätte", "Ich hab's getestet, damit du es nicht
  musst", "Warum sagt einem das keiner?", "Für alle, die …", "Oma-Trick", "Das hätte ich mir sparen können",
  "Kennt ihr das, wenn …", "Unpopuläre Meinung:", "X für unter 30 €, die sich wirklich lohnen".
- Never produce German by translating the English hook. Generate natively from the angle card + German VoC
  phrases, then have a second pass act as "native German editor: would a 35-year-old from Köln say this?".

---

## 6. Proposed data model and prompt chain

### 6.0 Pipeline overview

```
P0 Product dossier ──► P1 VoC harvest ──► P2 Opinion units ──► P3 Codebook + counts
                                                                    │
                           P4 Competitor corpus per market ──► P5 Creative tagging
                                                                    │
            P6 Audience × Angle matrix with occupancy per market (DE / AT / CH / US reference)
                                                                    │
     P7 Angle cards (ranked) ──► [HUMAN GATE A] ──► P8 Claims check ──► [HUMAN GATE B if flagged]
                                                                    │
     P9 German hooks (3 layers) ──► P10 Concept briefs ──► [HUMAN GATE C] ──► video pipeline
                                                                    │
                        P11 Results logged back onto angle / hook / audience rows
```

### 6.1 Data model (relational; JSON columns where noted)

```
product(id, name, category, store, price_eur, price_chf, cogs, supplier, ship_days_min, ship_days_max,
        ships_from, what_it_does_factual, mechanism, specs JSON, limitations JSON,
        ce_required, age_restriction, eu_responsible_person, us_reference_urls JSON, status)

claim(id, product_id, statement_de, type {functional|result|comparative|health|price|scarcity|origin|social_proof},
      evidence {own_test|supplier_doc|certificate|shop_data|none}, evidence_ref,
      status {approved|needs_review|forbidden}, reviewed_by, reviewed_at, allowed_wordings JSON)

source_doc(id, product_id, platform {tiktok|instagram|youtube|amazon_us|amazon_de|store_reviews|reddit|trustpilot|own_comments|own_survey},
           market {US|DE|AT|CH|other}, language, url, kind {review|comment|ticket|survey},
           text, rating, likes, posted_at, about {this_product|equivalent_product|competitor}, signal_score 1-5)
           -- no author handle stored

opinion_unit(id, source_doc_id, verbatim, verbatim_lang, gloss_de,
             kind {pain|desire|objection|trigger|transformation|use_case|alternative|purchase_intent|complaint_post_purchase},
             jtbd_force {push|pull|anxiety|habit}, job_layer {functional|emotional|social},
             buyer_role, user_role, situation, intensity 1-3, code_id)

code(id, product_id, kind, label_de, definition, n_units, n_sources, n_platforms, markets JSON,
     intensity_avg, confidence {high|medium|low}, money_quotes JSON)      -- the codebook

audience(id, product_id, name_de, buyer_role, user_role, situation, job_statement, occasion,
         awareness_default, evidence_code_ids JSON, n_units, confidence, size_hint, where_reachable)

competitor_creative(id, product_id, market, platform, kind {organic|ad}, url, account, account_type {brand|creator|shop},
                    first_seen, last_seen, days_running, views, likes, shares, saves, reach_est,
                    audience_age_gender JSON,          -- Meta EU transparency, when an ad
                    transcript, onscreen_text, first_frame_desc, landing_url,
                    tag_audience_id, tag_pain_code_id, tag_angle_type, tag_awareness,
                    tag_hook_tactic, tag_trigger, tag_mechanic, tag_format, tag_claims JSON, tagger_confidence)

matrix_cell(product_id, market, audience_id, pain_or_desire_code_id,
            n_creatives, n_accounts, weighted_presence, newest_seen, top_example_ids JSON,
            occupancy {free|emerging|contested|saturated}, proven_elsewhere {none|US|DE|AT|CH},
            demand_evidence_score, sophistication_stage 1-5)

angle(id, product_id, audience_id, pain_or_desire_code_id, core_statement_de, type, awareness,
      strategy {direct|transfer_from_US|translocate|objection_reversal|occasion},
      mechanic, source_quotes JSON, source_creative_ids JSON, required_claim_ids JSON,
      scores JSON {evidence, gap, demonstrability, fit, compliance_risk, novelty}, rank,
      status {proposed|approved|rejected|testing|winner|burned}, human_note)

hook(id, angle_id, market, spoken_de, onscreen_text_de, first_frame, tactic, trigger, archetype,
     word_count, claims_used JSON, compliance {ok|flag|blocked}, native_check {pass|rewrite}, status)

concept_brief(id, angle_id, hook_id, format, mechanic, beats JSON [{t_start,t_end,visual,audio,text}],
              proof_moment, cta_de, caption_de, hashtags, objection_answered, props, presenter,
              ai_label_required, legal_flags JSON, status)

result(id, concept_brief_id, post_url, platform, market, posted_at, views, hold_3s, avg_watch_pct,
       completion, saves, shares, comments, intent_comments, clicks, orders, revenue)
```

### 6.2 P0 — Product dossier (factual base)

Prompt role: "product analyst, facts only". Inputs: supplier page, US store page, US viral videos'
breakdowns, Trendtrack `analyze_product`/`brief_competitor`. Output: `product` row + first `claim` list
(every statement the US content makes, each classified and marked `evidence: none` until proven).
Rule: **nothing in the dossier may come from marketing copy without being marked as a claim.**
Human: confirms price, shipping time/origin, certificates, limitations (10 min).

### 6.3 P1–P3 — Voice-of-customer evidence

**P1 harvest** (code, no LLM): for each product collect, tagged by market and language:
comments of the top 5–10 US viral videos (desire/objection language at scale); US store + Amazon reviews of
this/equivalent products (post-purchase truth; 2–4★ are the most informative); **German** comments/reviews
of equivalent products (Amazon.de, German TikTok/Reels via Trendtrack organic search + comment scraper) —
needed for native phrasing and for DACH-specific objections; later: own comments, tickets, post-purchase
survey ("Für wen hast du es gekauft? Was hat dich fast abgehalten?") — the highest-value source.

**P2 opinion-unit extraction** (LLM, batches of ~150–200 docs, strict JSON, cheap model is fine):
- First score signal 1–5 (Motion rubric) and drop 1–2 (emoji, "need", tag-a-friend) but **count**
  purchase-intent ones before dropping.
- Split each remaining text into single-claim units; copy the verbatim span exactly; add a German gloss if
  the source is English; fill `kind`, `jtbd_force`, `job_layer`, `buyer_role`, `user_role`, `situation`,
  `intensity`. Use `"unknown"` rather than guessing roles.
- Validation in code: verbatim must be a substring of the source text (kills hallucinated quotes).

**P3 codebook + counts** (LLM proposes, code counts): feed a stratified sample → LLM proposes ≤ 12 codes
per kind with definitions → second pass assigns every unit to a code or `other` → if `other` > 15 %,
re-open the codebook. SQL computes `n_units`, `n_sources`, `n_platforms`. Confidence per Corey Haines'
guardrails: high = ≥ 3 independent sources/platforms and unprompted; medium = 2; low = 1. Audiences are
derived from clusters of `buyer_role × user_role × situation` with **≥ 5 independent units** each;
below that they are marked `hypothesis`.

Example of what this yields for a toy [I]: audiences "Mama, Kind 2–5, braucht 20 Minuten Ruhe",
"Oma/Opa, Geschenk zum Geburtstag/Weihnachten, will das Enkel-Lächeln", "Tante/Patin, Mitbringsel unter
25 €", "Erzieherin/Tagesmutter" — same product, four different jobs, four different hooks.

### 6.4 P4–P6 — Competitor corpus and "occupied vs free" per market

**P4 corpus** per market M ∈ {DE, AT, CH} plus US as reference:
- Trendtrack `search_tiktok_library(type=organic|ad, language=de, countries=[M], query/hashtags)`;
  `search_ads(ad_language=de, main_countries=[DE|AT] or ad_countries=[CH], query=product terms,
  search_in=ad_copy|website_copy)`; `scan_ad` for hook + structure; landing pages.
- Instagram Reels German organic via the hashtag/account watchlist scraper.
- Search terms come from the German codebook (how Germans name the thing) + image search
  (`search_products_by_image`) because dropshipped products are renamed per store.
- Practical note [I]: DE/AT/CH share language and feeds; organic occupancy is effectively
  **"German-language" with country as an attribute** (account location, currency shown, shipping promises).
  Ads are separable per country. Expect CH/AT cells to be sparse — record `n < threshold` as
  "insufficient data", not "free".

**P5 creative tagging** (LLM with vision/transcript; closed vocabularies only): for each creative choose
`audience_id` and `pain/desire code` **from this product's own lists** (or `new:<label>` → triggers a
codebook review), plus angle type, awareness, hook tactic, trigger, mechanic, format, claims made. Use Meta
EU age/gender delivery data as evidence for audience when available. Double-tag a 10 % sample with a
second model/run; if agreement < 80 %, fix definitions before trusting the matrix.

**P6 matrix + occupancy score** (code; proposal [I]):

```
presence(cell, M) = Σ over creatives in cell:  w_reach × w_recency × w_account
   w_reach   = log10(views or est. reach + 10)
   w_recency = exp(−age_days / 60)          # organic angles decay fast
   w_account = 1.0 first creative of an account, 0.3 for further ones   # counts players, not reposts
share(cell, M) = presence(cell, M) / Σ presence(all cells, M)

occupancy:  free       n_accounts = 0  (and corpus for M ≥ 30 creatives, else "insufficient data")
            emerging   n_accounts 1–2, newest < 30 days
            contested  n_accounts 3–5 or share 10–25 %
            saturated  n_accounts > 5 or share > 25 %, or an ad running > 60 days with growing reach
```

Cross-market flags: `proven_elsewhere = US` when the same cell is contested/saturated in the US with high
performers; `demand_evidence_score` = VoC weight of the cell's pain code among **German** units.
Priority classes for a cell in market M:

1. **Transfer** — proven in US, free in M, German VoC confirms the pain → cheapest win, highest priority.
2. **White space** — strong VoC (esp. German), free everywhere → higher risk, highest upside.
3. **Flank** — saturated cell, but a different audience for the same pain is free (mothers saturated,
   grandparents free) or a different awareness stage/mechanic is free.
4. **Avoid** — saturated and sophistication stage ≥ 3 without a new mechanism; or free because the claim it
   needs is forbidden in DACH (a free cell is not always an opportunity — check `required_claim_ids`).

Sophistication stage per market (§2.2) is computed from the same table: number of accounts sharing the
dominant promise and whether mechanisms already appear.

### 6.5 P7 — Angle generation and ranking

Generator prompt (strong model), one call per priority cell, using Rob Palmer's card discipline:
- Inputs: dossier facts + approved claims; the cell (audience, pain/desire, job statement); top verbatim
  quotes (German first); occupancy + example competitor hooks in that market ("already said — do not
  repeat"); US winners for the cell if `transfer`; sophistication stage; season/occasion calendar.
- Strategies to force variety: `direct` (customer words), `transfer_from_US` (re-anchored compliantly),
  `objection_reversal` (top objection becomes the opener: "Ja, das gibt's auch bei Temu. Der Unterschied:"),
  `occasion` (gift/season), `translocate` (borrowed fact from another domain; use sparingly, overclaim risk).
- Output per card: core statement in German as a human sentence (not a slogan), type, awareness, mechanic
  suggestion, the quotes that justify it, required claims, why it is free in M, what would falsify it.
- Scoring (separate critic call, different prompt; code combines):
  `score = 0.25·evidence + 0.25·gap + 0.20·demonstrability + 0.15·audience_fit/size + 0.15·novelty − penalty(compliance_risk)`
  where demonstrability = "can a 20-second video show this without asserting it?" — the criterion that
  matters most for German scepticism and for legal safety.
- Deliver top 5–8 per product with the rest listed as culled. "Most cards are mediocre" is the expected
  outcome; never pad.

### 6.6 P8 — Claims/compliance check

Deterministic first (regex/keyword pack from §5.1 on German text: health verbs, superlatives, scarcity,
price comparisons, "Testsieger", shipping promises, first-person usage claims by synthetic presenters),
then an LLM "German Wettbewerbsrecht reviewer" pass that must cite which `claim_id` supports each factual
statement. Output `ok | flag | blocked` + compliant rewrite. Anything with a health, child-directed,
comparative, price or scarcity element → human.

### 6.7 P9 — German hooks

Per approved angle: 8–10 hooks across ≥ 3 tactics and ≥ 2 archetypes, each with all three layers
(first frame, spoken line ≤ 9 words, on-screen text ≤ 6 words), tagged tactic/trigger/archetype.
Written natively in German from German VoC phrases (§5.4), then: (a) native-editor pass, (b) "muted test"
— does frame + text alone carry the hook?, (c) promise↔payoff check against the concept, (d) compliance
pass, (e) dedupe against `competitor_creative` hooks in the market and our own burned hooks.
Variants for AT/CH only where vocabulary, currency or shipping differs.

### 6.8 P10 — Concept briefs

One brief = angle + hook + mechanic (Motion's 8) + format (from the 46) + beat sheet with timestamps
(§2.6) + the single proof moment + which objection it pre-empts + caption/CTA in German + production notes
for the existing video pipeline (props, presenter type, AI-label flag). Also generate the **comment-reply
follow-ups** in advance for the 3 most likely objections (they are the product-aware layer of the funnel).

### 6.9 P11 — Learning loop

Every posted video writes a `result` row; nightly job aggregates by angle, audience, hook tactic, mechanic,
format and market. An angle is `winner` only after ≥ 3 videos; `burned` after 3 below-median. Own comments
re-enter P1 (highest-value VoC). The matrix is re-computed weekly because organic occupancy changes in weeks
(a guide found by search warns that a messaging matrix built once stops surfacing gaps [S]).

### 6.10 What must be human-approved

| Gate | What the human decides | Why not automated |
|---|---|---|
| **0 — Dossier facts** | Price, shipping time/origin, certificates, limitations, target ages | Everything downstream inherits these; supplier data is unreliable. |
| **A — Audiences & angle shortlist** | Which 3–5 angles to test; rejecting off-brand or distasteful ones; sanity check of "free" cells | Occupancy data is incomplete (Reels coverage, CH/AT sparse); strategy and taste; budget. |
| **B — Claims** | Any `needs_review` claim; all health/cosmetic-effect, child-related, comparative, price, scarcity, "Testsieger", sustainability claims; synthetic testimonials | Abmahn risk sits with the shop owner personally; LLM legal judgement is not reliable enough. One-time lawyer review of the rule pack recommended. |
| **C — Final hooks/briefs before production** | Native German feel, tone, promise↔payoff | Native-speaker judgement; cheap (2 min per brief) and prevents wasted generation credits. |
| **D — Codebook changes** | New audience or pain code proposed by the tagger | Keeps the taxonomy stable so results stay comparable. |
| Ongoing | Kill/scale decisions after results | Small samples; human reads context. |

Fully automatic: harvesting, opinion-unit extraction, counting, creative tagging, occupancy computation,
hook variant generation, deterministic compliance screening, result logging.

### 6.11 Build order [I]

1. Vendor taxonomies (Motion tactics/triggers/mechanics/formats) as enums + write the DACH rule pack.
2. P0–P3 for one live product with data we can already get (US video comments + store reviews).
3. P4–P6 using Trendtrack only (test German organic coverage — the main unknown).
4. P7–P10 with gates A–C as a simple review page.
5. P11 once videos are posting; only then consider BERTopic or a second ad tool.

---

## 7. Open questions / not verified

- Trendtrack: real depth of German-language **organic** TikTok results and whether transcripts come back;
  credit cost of building a ~100-creative corpus per product per market. Test with one product.
- Instagram Reels German organic corpus: needs the scraper route; no tool with MCP found for it.
- All vendor facts for Foreplay, Atria, Motion, Apify prices, Hugging Face datasets: search summaries only.
- Minea API/MCP: nothing found. Instagram comment scraper pricing: not found.
- Amazon.com login wall for reviews since Oct 2026: single unverified claim.
- UWG Anhang numbers (7, 18, 23b/c, 28), HWG paragraphs, AI Act Art. 50 dates: from memory.
- Swiss customs/VAT thresholds, Swiss/Austrian advertising-law details: not researched.
- No German-specific research on what short-form product content resonates; §5.3–5.4 are hypotheses.
- Exact last-commit dates of the repos (GitHub API blocked); star counts are as shown on 2026-11-22.
- Hook-archetype performance statements in the Vyral files are author claims without data.

## 8. Sources

Read directly (GitHub):
- https://github.com/motion-team/creative-strategy-skills (README + all 8 SKILL.md files)
- https://github.com/robpalmer99/claude-code-copywriting-skills (README, angle-finder, voc-sources, compliance-checker)
- https://github.com/vyralcontent/content-skills (README, viral-hooks SKILL.md, hook-archetypes.md)
- https://github.com/coreyhaines31/marketingskills (repo page, customer-research, ad-creative, social, VERSIONS.md)
- https://github.com/realkimbarrett/advertising-skills (README, ad-angle-multiplier, schwartz-awareness-mapper)
- https://github.com/guia-matthieu/clawfu-skills · https://github.com/Motion-Creative/motion-creative-plugin
- https://github.com/MaartenGr/BERTopic · https://github.com/567-labs/kura
- Trendtrack MCP tool schemas as exposed in this workspace

Search summaries only (pages not opened):
- Foreplay MCP: https://www.foreplay.co/post/ad-library-mcp · https://foreplay.co/mcp · https://foreplay.co/api
- Atria: https://docs.tryatria.com/docs/mcp-quickstart · https://www.tryatria.com/api
- Motion: https://motionapp.com/mcp · https://motionapp.com/library/frameworks/creative-strategy-engine · https://madgicx.com/compare/atria-vs-motion
- Apify: https://apify.com/clockworks/tiktok-comments-scraper/pricing · https://apify.com/jaybird/amazon-reviews-scraper
- Hooks data: https://huggingface.co/datasets/benxh/tiktok-hooks-finetune · https://huggingface.co/datasets/Toly-89/hook-pattern-library · https://virlo.ai/data/viral-hooks
- Papers: https://arxiv.org/html/2507.13392v1 · https://arxiv.org/html/2409.15626v1 · https://arxiv.org/html/2510.16466v2
- German law: https://www.haendlerbund.de/de/leistungen/rechtssicherheit/hilfe-bei-abmahnung/abmahnung-dropshipping ·
  https://www.it-recht-kanzlei.de/dropshipping-recht.html · https://www.it-recht-kanzlei.de/zirbe-heilversprechen-irrefuehrung.html ·
  https://www.e-recht24.de/online-marketing/13361-gesundheitsbezogene-werbung-health-claims.html ·
  https://www.haendlerbund.de/de/ratgeber/recht/streichpreise · https://www.it-recht-kanzlei.de/ungefaehre-lieferzeitangaben-ca-abmahnung.html ·
  https://www.haendlerbund.de/de/news/aktuelles/wissenssnack/lieferzeitangaben-online-shop ·
  https://ohn.haendlerbund.de/recht/rechtsfragen/dropshipping-vertraegen-retouren-produkthaftung ·
  https://www.wko.at/oe/internetrecht/ruecktrittsrecht-bei-warenkauf-im-internet · https://ch.ch/de/sicherheit-und-recht/waren-zuruckgeben-oder-umtauschen
- DACH commerce data: https://www.it-finanzmagazin.de/onlinehandel-bezahlen-per-wallet-chatten-per-ki-251505/ (EHI 2026) ·
  https://retail-news.de/paypal-studie-kaufabbrueche-fehlende-zahlarten/ · https://dhl.com/2026-report
