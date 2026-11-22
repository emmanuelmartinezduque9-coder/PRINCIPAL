# Automatic discovery of viral product videos / winning products (IG Reels, TikTok) and automatic breakdown of reference videos — state as of Nov 2026

Research caveats (read first):
- Research date 2026-11-22. Web search only; the one direct page fetch attempted (ai.google.dev) failed because that host is not reachable from this session's network. Therefore all prices/limits below come from search-result snippets of vendor pages and third-party trackers, NOT from pages opened and read in full. Every price should be re-checked on the live vendor page before budgeting.
- Many comparison sources are vendor or affiliate blogs (flagged inline). Where sources disagree, both figures are given.
- Nothing here was tested hands-on (no scraper was run, no video model benchmarked).

## 1. Discovery/scraping: monitoring Instagram and TikTok accounts/hashtags/sounds for new viral posts

### Takeaway
For a small watchlist (tens to low hundreds of accounts) the practical choice is a paid "unofficial API" (ScrapeCreators pay-as-you-go, or an Apify actor) at roughly $0.5–$2.5 per 1,000 results; self-run tools (instaloader, yt-dlp, gallery-dl) are free but fragile on Instagram from server IPs and are best kept for downloading the media file of an already-known URL. Official TikTok APIs (Research API, Commercial Content API) are closed to commercial users, so they are not an option.

### Cited Findings
ScrapeCreators
- Pay-as-you-go credits, no subscription, credits do not expire — [ScrapeCreators pricing](https://scrapecreators.com/credits-never-expire)
- Most endpoints cost 1 credit per request; results already in cache cost 0 credits — [ScrapeCreators cached results](https://scrapecreators.com/free-cached-results)
- Pack prices reported: 25,000 credits for $47 (~$1.88 per 1,000 requests) — [ScrapeCreators blog](https://scrapecreators.com/blog/pay-as-you-go-social-media-scraping-api); Business tier 500,000 credits at ~$0.99 per 1,000 requests (third-party tracker, dated ~Aug 2026) — [aisotools](https://aisotools.com/pricing/scrape-creators)
- Free starter credits: vendor pages disagree (100 vs 1,000 free credits depending on landing-page variant) — [ScrapeCreators home](https://scrapecreators.com/?via=signup)
- Covers TikTok and Instagram among supported platforms; every plan unlocks every API — [ScrapeCreators home](https://scrapecreators.com/?via=signup)

Apify (actor marketplace; prices per actor, very heterogeneous)
- Official `apify/instagram-reel-scraper` listed at $2.30 per 1,000 items — [Apify store](https://apify.com/apify/instagram-reel-scraper/issues/open)
- Community Instagram reel actors listed from $0.45–$0.49 per 1,000 results ([scrapesmith](https://apify.com/scrapesmith/instagram-reels-scraper), [insta_scrapper](https://apify.com/insta_scrapper/instagram-reels-scraper.md)), $1.70/1,000 ([benthepythondev](https://apify.com/benthepythondev/instagram-reels-scraper)), $2.00/1,000 ([futurizerush](https://apify.com/futurizerush/instagram-reel-scraper)), $4.00/1,000 ([agentx](https://apify.com/agentx/instagram-reel-scraper)); one claims $0.05 per 1,000 ([esdrasdw](https://apify.com/esdrasdw/instagram-content-scraper)) — an outlier that should be treated with suspicion.
- A multi-platform post-metrics actor charges $1 per 1,000 successful Instagram/TikTok/X snapshots, no charge for failed/unavailable posts — [nooesc actor](https://apify.com/nooesc/social-media-post-metrics)
- Apify offers a TikTok MCP server that needs no TikTok API key — [Apify TikTok MCP](https://apify.com/mcp/tiktok-mcp-server)
- EnsembleData's TikTok API is also resold as an Apify actor (with MCP endpoint) — [Apify EnsembleData](https://apify.com/ensembledata/tiktok-api/pricing)

EnsembleData
- Subscription with DAILY unit allowances: Wood $100/mo for 1,500 units/day, Bronze $200/mo for 5,000 units/day, free trial 50 units/day — [aisotools](https://aisotools.com/pricing/ensembledata); Platinum $1,400/mo for 50,000 units/day; unused units expire daily at 00:00 UTC, no rollover — [SocialCrawl comparison (competitor blog)](https://www.socialcrawl.dev/blog/best-tiktok-data-apis-2026)
- A TikTok User Info call costs 1 unit; other endpoints cost more — [Phyllo](https://www.getphyllo.com/post/social-data-api-pricing)

Bright Data
- Web Scraper API (Instagram): $1.50 per 1K records pay-as-you-go, free tier 5K records/month, bills only successfully delivered records — [Bright Data Instagram scraper](https://brightdata.com/products/web-scraper/Instagram)
- Another Bright Data page lists entry price $0.75 per 1K records for profile extraction (not reconciled with the $1.50 figure) — [Bright Data profile extractor](https://brightdata.com/solutions/data-extraction/social-media/profile)
- A Scale plan at $499/mo including 384,000 records, then $1.30 per extra 1K, is cited by a competitor comparison — [twitterapi.io](https://twitterapi.io/blog/bright-data-alternatives)

Other MCP/API options surfaced
- HasData TikTok MCP server covers public TikTok profiles, videos, comments and keyword search — [mcpservers.org](https://mcpservers.org/servers/hasdata/tiktok-mcp)
- viral.app's free TikTok-only MCP is retired; successor is a broader paid API/agent skill — [viral.app](https://viral.app/en/free-tools/tiktok-mcp)
- TikTok's own official MCP server (announced at TikTok World '26, `business-api.tiktok.com/open_mcp/`) covers advertising data, not organic video research — [FastMoss blog](https://www.fastmoss.com/blog/mcp-for-ecommerce/)

Self-run open-source tools / anti-bot state (Instagram)
- Instaloader: public profile timelines need no session; stories, highlights, private accounts and single posts need login — [Scrapfly](https://scrapfly.io/blog/posts/best-open-source-instagram-scrapers)
- Instagram rate-limits anonymous requests to public JSON endpoints "within minutes"; logged-in sessions are throttled after a few dozen requests; ~200 requests/hour is reported for browser-based scraping — [dev.to guide](https://dev.to/olams/scraping-instagram-without-getting-banned-what-actually-works-in-2026-3jfh) (low-authority blog; treat numbers as rough)
- Instaloader docs: the "Too many queries" 429 message is a rate-limit notice; keep the session file from `--login`; behaviour changes between versions so update when 429s pile up — [Instaloader troubleshooting](https://instaloader.github.io/troubleshooting.html)
- Blocks escalate: CAPTCHAs, "Try Again Later", phone-verification checkpoints; `challenge_required` fires most often on logins from fresh or datacenter IPs; datacenter IPs are flagged immediately — [dev.to: how Instagram blocks scrapers](https://dev.to/rohith_m_a75381d0f1c3a358/how-instagram-blocks-scrapers-in-2025-and-what-actually-gets-around-it-19n5)

Official TikTok APIs
- Research Tools are for independent/academic researchers on a non-profit basis; applicants must be independent of commercial interests and disclose funding; a developer account alone does not grant access; each project needs approval — [TikTok Research API](https://developers.tiktok.com/products/research-api), [Research API FAQ](https://developers.tiktok.com/docs/en/research-api-faq)
- The Commercial Content API is an ads-transparency tool requiring an approved application — [TikTok Commercial Content API](https://developers.tiktok.com/products/commercial-content-api); at launch applicants had to commit to non-commercial use — [TechCrunch 2023](https://techcrunch.com/2023/07/20/tiktok-ads-transparency)

Legal / ToS
- Meta v. Bright Data (N.D. Cal., Jan 2024): summary judgment for Bright Data on breach of contract; Meta's terms only bind scraping done while logged in to an account; logged-off scraping of public Facebook/Instagram data did not "use" the services — [TechCrunch](https://techcrunch.com/2024/01/24/court-rules-in-favor-of-a-web-scraper-bright-data-which-meta-had-used-and-then-sued)
- The ruling does not establish that all logged-off scraping is lawful, and commentators consider it at odds with most other scraping/contract decisions — [Farella Braun + Martel analysis](https://www.fbm.com/technology/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/)
- Meta subsequently abandoned the lawsuit — [MediaPost](https://www.mediapost.com/publications/article/393996/None)

### Inferences
- Cost at this operator's scale is negligible: polling 100 accounts once a day on a 1-credit-per-request API is ~3,000 requests/month, i.e. about $6/month at ScrapeCreators' $1.88/1k rate, or within Bright Data's 5K free records. Price should not drive the choice; reliability, returned fields (play count, timestamp, bio link, audio id) and no-expiry billing should. EnsembleData's daily-expiring units and $100 floor are a poor fit for a small watchlist.
- Risk gradient: (a) paid API that scrapes logged-out public data = lowest personal risk (the provider carries the anti-bot burden; the buyer's own IG/TikTok accounts are never involved); (b) instaloader/yt-dlp with cookies from a personal account on a server = highest risk, because logged-in scraping is exactly what Meta's ToS binds and what triggers checkpoints. Never use the publishing accounts' cookies for scraping.
- "Virality" should be computed locally, not bought: store each poll (views, likes, comments, timestamp) and alert on views relative to the account's median and on view velocity (views per hour since posting). This needs repeated polling of the same posts, which is where zero-cost cached results do NOT help (cache returns stale counts).
- The linked store is normally in the profile bio/link-in-bio, so a profile endpoint plus link resolution (Linktree etc.) is needed in addition to the posts endpoint.
- Because the Apify MCP and HasData MCP exist, the current LLM agent could call scrapers directly as tools; for scheduled monitoring a plain cron + REST call is cheaper and more deterministic than an agent loop.

### Gaps
- yt-dlp and gallery-dl current Instagram/TikTok behaviour (login/cookie requirements for Reels in late 2026): no source found; untested.
- RapidAPI scrapers: not researched (no results surfaced); generally individual resellers of varying reliability, but I have no cited data.
- TikTok Creative Center: no evidence of a public API was found; third-party actors scrape it. Not verified.
- Hashtag and sound/audio-page monitoring endpoints: which providers expose "videos using sound X" for Instagram audio pages was not verified per provider.
- No independent 2026 reliability benchmark (success rate, data freshness) comparing these providers was found; all "best API" lists surfaced are written by the vendors themselves.
- GDPR/EU angle on storing scraped personal data (usernames, comments) as an EU-based operator: not researched; needs legal input.
- Could not verify ScrapeCreators' exact per-endpoint credit costs or the exact field list (e.g. whether IG play counts are returned for all reels).

## 2. Product/competitor intelligence tools (APIs/MCP, organic vs ads, revenue estimates)

### Takeaway
Almost all "spy tools" are ad-library tools; none of those found is documented as tracking organic Instagram Reels virality, so organic discovery must be built with scraping (section 1) and the spy tools used only for the second step (store/product validation). MCP/API access is confirmed for Trendtrack (already connected in this workspace), FastMoss and StoreLeads; for the rest it is unverified.

### Cited Findings
- FastMoss MCP connects Claude/ChatGPT/Cursor to "500M+ products and 300M+ creators across 19+ markets", free trial, docs at developers.fastmoss.com/mcp (vendor's own figures) — [FastMoss blog](https://www.fastmoss.com/blog/mcp-for-ecommerce/)
- Kalodata is positioned (by competitor FastMoss) as the tool for merchants earning mostly from TikTok Shop livestreaming; no API/MCP details found — [FastMoss blog](https://www.fastmoss.com/blog/mcp-for-ecommerce/)
- StoreLeads plans: $75 / $250 / $450 / $950 per month — [StoreLeads](https://www.storeleads.app); API and MCP access come with the Pro plan ($250) per reviewers — [Trendtrack review of Store Leads](https://www.trendtrack.io/blog-post/store-leads-review), [ColdIQ](https://coldiq.com/blog/storeleads-pricing)
- StoreLeads sales and traffic values are modelled estimates, useful for ranking/segmentation, not precise — [Trendtrack review of Store Leads](https://www.trendtrack.io/blog-post/store-leads-review)
- Minea covers the most ad platforms (incl. Pinterest, Instagram, Snapchat); Pipiads focuses on TikTok and Facebook ads; Winning Hunter is Facebook/TikTok ad spying plus Shopify store tracking with competitor sales estimates; entry prices ~$49/mo (Minea, Winning Hunter), Pipiads from ~$29.90–$49 — [Winning Hunter comparison (vendor)](https://winninghunter.com/insights/minea-vs-pipiads-vs-dropispy-vs-winninghunter/), [Trendtrack comparison (vendor)](https://www.trendtrack.io/blog-post/minea-vs-pipiads-vs-trendtrack), [Cropink](https://cropink.com/minea-alternatives)
- ShopHunter is described as showing product-level performance for real Shopify stores — [ZIK Analytics (competitor blog)](https://www.zikanalytics.com/blog/shophunter-alternatives/)
- A SourceForge listing marks both Minea and PiPiADS as "offering an API", without details — [SourceForge](https://www.sourceforge.net/software/compare/Minea-vs-PiPiADS)

### Inferences
- Observed in this session's tool list (not a web source): the workspace's Trendtrack MCP exposes shop search, product search (incl. by image), `find_winning_products`, `product_launch_radar`, `daily_radar`, brand tracker and a TikTok library search. That already covers store/product/ad intelligence, so buying a second ad-spy tool (Minea, Pipiads, Winning Hunter) would be largely redundant.
- Kalodata/FastMoss are TikTok Shop analytics. TikTok Shop is not the operator's channel (organic Reels to own Shopify store, DACH), so their main value would be US TikTok Shop sales data as a demand signal for a product, plus FastMoss's MCP for agent use.
- Suggested division of labour: scraping API = organic signal (which video/account is exploding); Trendtrack = is the store behind it real and growing, are ads scaling; products.json polling (section 3) = cheap independent check.

### Gaps
- No source confirmed organic (non-ad) video tracking in Minea, Pipiads, Winning Hunter or ShopHunter; no vendor API documentation for any of them was found. "Has API" on SourceForge is unverified.
- Sell The Trend, Foreplay and Koala Inspector: not covered by any result retrieved; no findings.
- Kalodata API/MCP and pricing: not found.
- FastMoss MCP pricing after trial and whether its data covers Instagram at all: not found (it is TikTok-centric by its own description).
- Accuracy of any store-revenue estimator versus real Shopify revenue: no independent validation found.

## 3. Detecting single-product Shopify stores and estimating sales

### Takeaway
There is no validated public method; all revenue figures (StoreLeads, Apify analyzers, spy tools) are heuristics with large error, so they should be used to rank and to detect growth, not as absolute numbers.

### Cited Findings
- One Apify "Shopify revenue estimator" documents its method as product_count x avg_price x estimated orders/day multipliers and itself expects roughly +/-50% error on absolute monthly revenue — [nexgendata actor](https://apify.com/nexgendata/shopify-analyzer/api/cli)
- Another uses visits x conversion rate x AOV with visits taken from SimilarWeb, priced $10 per 1K stores — [apivault_labs actor](https://apify.com/apivault_labs/shopify-store-analyzer?fpr=ewv9tm)
- StoreLeads data is also available via third-party Apify scrapers — [silentflow actor](https://apify.com/silentflow/storeleads-scraper)

### Inferences
- Single-product detection is doable in-house without paid tools: fetch `https://<store>/products.json` (public on most Shopify stores unless disabled) and count products/variants; a store with 1–5 products and one dominant hero product is a "single-product store". This is standard practice but I found no 2026 source documenting it, so treat it as my inference to be tested.
- Sales-velocity proxies obtainable by polling: changes in `updated_at` on the hero product, review-count growth in the review app widget (Loox/Judge.me), and "best-selling" collection ordering. Each is noisy; review-count growth x an assumed review rate is commonly used but unvalidated.
- For a go/no-go decision, organic view velocity on the source account plus store age and review growth is probably a better signal than any revenue estimate.

### Gaps
- No 2026 source on whether Shopify still exposes `/products.json` by default or on how reliable `updated_at`-based sales tracking remains (historically such trackers lost accuracy after Shopify changes). Needs a hands-on test against 5–10 known stores.
- No source for typical conversion rates of organic-traffic single-product stores.

## 4. Video understanding for shot-by-shot breakdown

### Takeaway
Gemini is the only mainstream API found that ingests the video file natively with audio and timestamp references, at a cost of well under a cent per short Reel; the robust pattern is deterministic cut detection (PySceneDetect/ffmpeg) first, then the model per shot, rather than trusting the model's own timestamps. Twelve Labs is priced per minute and geared to search over large archives, which is not this use case.

### Cited Findings
Gemini
- By default video is processed by extracting frames at 1 FPS; newer Flash models ("3.5 Flash Lite" through "3.8 Flash" as named in the search snippets) also support "agentic video understanding", where the model adjusts frame rate and resolution based on the prompt — [Gemini video understanding docs](https://ai.google.dev/gemini-api/docs/video-understanding)
- Timestamps can be referenced in MM:SS form; clipping is set with `videoMetadata` start/end offsets (e.g. "5s"–"25s") — [Gemini video understanding docs](https://ai.google.dev/gemini-api/docs/video-understanding)
- Gemini 3 family: default video media resolution is 70 tokens per frame; audio is 25 tokens per second; media resolution can be set per media Part — [Gemini media resolution docs](https://ai.google.dev/gemini-api/docs/media-resolution)
- Older (2.5-era) accounting: 258 tokens per second of video at 1 fps plus audio tokens (25 tokens/s) — [Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- Gemini accepts uploaded files or YouTube URLs — [NICAR 2026 workshop notebook](https://jsoma.github.io/workshop-ai-images-video/nicar-2026/07-video-deep-dive.html)
- Pricing snippets (conflicting, garbled, verify live): "Gemini 3.6 Flash" $1.50 in / $7.50 out per 1M tokens; "Gemini 3.8 Flash" promotional $0.375 in / $1.875 out through 2026-12-31, rising from 2027-01-01; "Gemini 3.1 Pro Preview" $2.00 in / $12.00 out; some rates change on 2026-12-01 — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), [Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)

Twelve Labs
- Pegasus analysis: $0.0292 per minute of input video plus $0.0075 per 1,000 output tokens (another tracker says $0.021/min); Marengo indexing $0.042/min plus $0.0015/min/month storage; search $4 per 1,000 queries; free tier up to 10 hours of indexing — [Twelve Labs pricing](https://twelvelabs.io/pricing), [usagepricing tracker](https://usagepricing.com/blueprint/twelve-labs), [Toolradar](https://toolradar.com/tools/twelvelabs/pricing)
- An official-page snapshot says customers move to new pricing automatically on 2027-01-04 (new rates not confirmed) — [Twelve Labs pricing](https://www.twelvelabs.io/pricing-2)

Open-source building blocks
- PySceneDetect: free, open-source shot-change detection with several detectors (fast cuts, threshold fades), can split video into clips — [PyPI scenedetect](https://pypi.org/p/scenedetect)
- A published agent skill `iopho-analyzing-videos` ships `video_to_storyboard.py`: uploads the video via the Gemini File API and writes a `.storyboard.md` with scene timestamps, intended as a blueprint for recreation (default model gemini-2.0-flash; code/licence not verified) — [skills.sh](https://skills.sh/iopho-team/iopho-skills/iopho-analyzing-videos)
- Common per-shot design: detect cuts with ffmpeg or similar, then send sampled frames plus context for each shot to the model — [course lecture (PDF)](https://zlisto.github.io/genAI_social_media/slides_pdf/Lecture_16_AI_video_summarization.pdf)
- A ComfyUI node wraps PySceneDetect and returns one representative frame per cut plus shot boundaries — [comfy.icu](https://comfy.icu/node/PySceneDetectVideo)
- `penshot` (PyPI) surfaced as a shot/storyboard-related package; not examined — [PyPI penshot](https://pypi.org/project/penshot/)

### Inferences
- Cost estimate (my arithmetic from the cited rates): a 30 s Reel at 1 FPS = 30 frames x 70 tokens + 30 s x 25 audio tokens = ~2,850 input tokens on Gemini 3; even at $2 per 1M input tokens that is ~$0.006, plus a few thousand output tokens (~$0.02–0.04 on a Pro-class model). Under the older 258 tokens/s accounting it is ~8,500 tokens. Either way roughly 1–5 cents per video, so model choice should be made on quality, not price.
- 1 FPS default sampling is too coarse for fast-cut product videos (shots of 0.5–1.5 s can be missed or merged). Mitigations: request a higher frame rate if the API allows it, or (more robust) split by PySceneDetect and send each shot separately at high media resolution, so shot boundaries are exact and model-independent.
- On-screen text (hooks, captions) is small and brief; send high media resolution for those, and consider a separate OCR pass on keyframes for verbatim text.
- Recommended output: a fixed JSON schema per shot (start, end, shot type/framing, camera movement, subject action, product visibility, on-screen text verbatim, voice-over verbatim, sound/music note, transition) plus video-level fields (hook type in first 3 s, structure, CTA, product, angle, target audience). A fixed schema makes breakdowns comparable across videos and directly feedable into the German adaptation brief.
- Claude and GPT take frames rather than the video file with audio, so they need the same cut-detection + frame extraction + separate transcript (Whisper) pipeline; they are viable as the "reasoning/brief-writing" layer on top of a Gemini or frame-based perception layer. This is my understanding, not confirmed by a 2026 source in this research.
- Observed in this session's tool list (not a web source): the connected Higgsfield MCP exposes `video_analysis_create` and `virality_predictor` tools; worth testing as a ready-made breakdown step since the operator already generates there.

### Gaps
- Could not open the Gemini docs: maximum video length, file size limits, custom-FPS parameter, and low-resolution token counts for Gemini 3 are unconfirmed. The model names in snippets ("Gemini 3.6/3.8 Flash") postdate my knowledge and could not be verified against the official model list.
- No independent 2026 accuracy benchmark for shot-by-shot breakdown or timestamp precision (Gemini vs GPT vs Claude vs Twelve Labs) was found.
- Memories.ai, Qwen-VL and other open models, and OpenAI video input: no findings retrieved; not covered.
- Claude and GPT current video/frame limits and per-image token costs: not researched here.
- No well-established open-source "viral video to prompt" repo was identified beyond the skill above; quality unverified.

## 5. Audio identification of trending sounds and music extraction

### Takeaway
On a Linux server the free route is SongRec (open-source Shazam client with CLI); paid routes are AudD and ACRCloud. Often no fingerprinting is needed at all, because scraper APIs return the post's audio/sound metadata.

### Cited Findings
- SongRec is an open-source Shazam client for Linux written in Rust, actively maintained in 2026 (Arch package 0.8.0-1 built 2026-10-27), installable via pacman, apt PPA, cargo, snap, flatpak; has a CLI — [SongRec GitHub](https://github.com/marin-m/SongRec), [Arch package](https://archlinux.org/packages/extra/x86_64/songrec), [man page](https://man.archlinux.org/man/songrec.1.en)
- A CLI-only fork without the GUI exists — [songrec-rust](https://github.com/BayernMuller/songrec-rust)
- AudD: music recognition API with official Python SDK (`pip install audd`); stream monitoring $45 per stream/month — [AudD](https://audd.io/), [AudD docs](https://docs.audd.io/llms.txt); file recognition reported at $5 per 1,000 requests (third-party listing, unverified) — [itechguides](https://www.itechguides.com/products/audd/)
- ACRCloud: usage-based pricing, 14-day free trial, full pricing behind console login — [ACRCloud docs](https://docs.acrcloud.com/tutorials/recognize-music), [ACRCloud](https://www.acrcloud.com)

### Inferences
- SongRec uses Shazam's unofficial endpoint, so it is free but carries ToS risk and can break without notice; fine as a first attempt with AudD as paid fallback.
- Fingerprinting only identifies commercially released tracks. "Original audio" sounds, voice-overs and remixes on Reels will not match; for those the sound ID/audio page from the scraper is the only identifier.
- For the DACH re-creation, a trending commercial track on a business/brand account raises a licensing problem independent of identification (business accounts are limited to the commercial music library). The practical options are a licensed/royalty-free or AI-generated sound-alike, or publishing with the platform's in-app sound.
- Observed in this session's tool list (not a web source): the Higgsfield MCP exposes `separate_stems` and `tiktok_music_trending`, which may cover stem separation and trending-sound lookup without self-hosting.

### Gaps
- shazamio (Python) maintenance status in 2026: no result retrieved.
- Demucs maintenance status and current best open-source separators (e.g. successor models): no result retrieved; uncited, so not asserted here.
- Exact AudD and ACRCloud per-request prices from primary pages: not confirmed.
- ShazamKit is Apple-platform only as far as I know; no source retrieved to cite.

## 6. Systematic sales-angle and audience ideation from reviews/comments

### Takeaway
The best-supported method is: scrape comments/reviews, have an LLM split each into single-claim "opinion units", embed and cluster those (BERTopic-style), then let the LLM label clusters; clustering whole comments gives muddier topics.

### Cited Findings
- TopicImpact: first an LLM splits each review into aspect-level opinion units, then clusters them; authors report more coherent and interpretable topic clusters than clustering whole reviews — [arXiv 2507.13392](https://arxiv.org/html/2507.13392v1)
- BERTopic pipeline: SBERT embeddings, UMAP reduction, HDBSCAN clustering, c-TF-IDF keywords; topics can be labelled by top keywords or by an LLM-generated label — [MDPI BDCC 9(8):194](https://mdpi.com/2504-2289/9/8/194)
- Data-cleaning decisions strongly affect both LDA and BERTopic results on product reviews/return reasons — [Politecnico di Milano thesis 2024](https://www.politesi.polimi.it/bitstream/10589/222758/1/2024_07_Lechaude.pdf)
- Comment scraping is available from the same providers as section 1 (e.g. HasData TikTok MCP covers comments) — [mcpservers.org](https://mcpservers.org/servers/hasdata/tiktok-mcp)

### Inferences
- At this scale (a few thousand comments per product) embeddings + clustering may be unnecessary: a large-context LLM can read all comments of the top 5–10 videos directly and output a taxonomy. Clustering becomes useful for counting (which objection/desire is most frequent) and for tracking over time.
- Suggested extraction schema per opinion unit: desire/outcome wanted, pain/problem, objection/doubt (price, "does it work", shipping), use case/situation, who it is for (self, gift, child, pet), purchase-intent signal ("where can I buy"), and competitor/alternative mentioned. Angles = top clusters of pains x use cases; audiences = "who it is for" clusters.
- Sources to combine: comments on the viral US videos (raw desire/objection language), the US store's reviews (post-purchase reality, complaints to pre-empt), Amazon reviews of equivalent products (largest volume; 3-star reviews are most informative), and German-language comments/reviews of similar products (Amazon.de) for native phrasing rather than translated phrasing.
- Share of purchase-intent comments ("link?", "need this") per 1,000 views is a useful additional winner signal for section 1's alerting.
- Deduplicate and filter spam/bot comments before analysis; viral posts attract many emoji-only and tag-a-friend comments.

### Gaps
- No practitioner write-ups (Reddit/X/YouTube, 2026) from organic dropshippers or AI-UGC operators describing their angle-mining workflow were retrieved; the method above is assembled from academic sources plus my inference.
- Amazon review scraping providers, prices and Amazon's ToS position: not researched.
- No dedicated "angle mining" SaaS was identified or evaluated.

## 7. Recommended automated pipeline: watchlist → viral alert → auto-breakdown → adaptation brief

### Takeaway
All required pieces exist as cheap APIs or open-source tools; the whole loop can run from one Linux cron job for an estimated low tens of dollars per month, with the human kept in the loop at exactly two points: approving a product to test and approving the German script.

### Cited Findings
- Building blocks and their cited prices/limits are in sections 1–6: scraping at ~$1–2.3 per 1,000 results ([ScrapeCreators](https://scrapecreators.com/blog/pay-as-you-go-social-media-scraping-api), [Apify](https://apify.com/apify/instagram-reel-scraper/issues/open), [Bright Data](https://brightdata.com/products/web-scraper/Instagram)); shot detection with [PySceneDetect](https://pypi.org/p/scenedetect); video-native analysis with [Gemini](https://ai.google.dev/gemini-api/docs/video-understanding); audio ID with [SongRec](https://github.com/marin-m/SongRec) or [AudD](https://audd.io/); opinion-unit clustering per [TopicImpact](https://arxiv.org/html/2507.13392v1).
- An existing end-to-end example of "video → storyboard markdown → recreate" as an agent skill — [skills.sh iopho](https://skills.sh/iopho-team/iopho-skills/iopho-analyzing-videos)

### Inferences
Proposed design (all of this is my synthesis, not a sourced recipe):
1. Watchlist store (SQLite/Postgres): accounts (IG + TikTok handle, niche, bio link, resolved store domain), plus hashtags/sounds. Seed from the accounts he already follows manually; grow it automatically by adding accounts that appear behind newly found viral product videos and "similar shops" from Trendtrack.
2. Poller (cron, 1–2x/day per account; re-poll posts younger than 7 days more often): call the scraper API for latest posts; store a time series of views/likes/comments.
3. Viral score and alert: views divided by the account's median views for its last N posts, view velocity in the first 24–72 h, purchase-intent comment share, and account age/size (small new account with an outlier = strongest "product, not creator" signal). Threshold crossing sends a message (Telegram/email) with link and metrics.
4. Store/product validation (automatic): resolve the bio link, detect Shopify, pull `/products.json` (single-product check, price, launch date), then query Trendtrack via MCP for store traffic/ads/similar shops. Check whether the product is already sold in DACH (German-language store search, Amazon.de) to judge saturation.
5. Auto-breakdown on alert: download the media (provider's download URL or yt-dlp for the single known URL), PySceneDetect for cuts, keyframes per shot, Whisper transcript, audio ID, then a video model with a fixed JSON schema; store the breakdown next to the metrics.
6. Angle/audience module: pull comments of the video and store reviews, run the opinion-unit extraction and clustering, output ranked angles and audiences.
7. Adaptation brief generator: LLM turns breakdown + angles into a German (and optionally Italian) brief: shot list with generation prompts per shot, hook variants, on-screen text and voice-over transcreated (not literally translated; DACH units, "du" register, local proof points), sound recommendation, compliance notes.
8. Feedback loop: log the performance of his own re-creations against the source video's features to learn which hooks/structures transfer to DACH.

- Estimated running cost for ~100 accounts: scraping under $10/month, video analysis a few cents per alerted video, so the dominant cost is the existing Trendtrack subscription and video generation.
- Start with the smallest slice: poller + viral score + alert. That alone removes the manual scrolling; the breakdown step already exists as an agent and only needs to be triggered by the alert instead of a pasted link.

Risks to state plainly in the report:
- Platform ToS: scraping violates Instagram's and TikTok's terms; the US case law cited covers logged-out public data only and is one district-court decision. Use providers, never the publishing accounts.
- Copyright/IP: re-creating a video shot-for-shot, reusing its music, or reusing footage is a separate legal risk from scraping, and near-identical copies can also trigger platform originality/duplicate-content demotion. Adapt structure and angle, not pixels.
- EU consumer/advertising law applies to the German versions (health claims, fake urgency, labelling of AI-generated content under platform rules and the EU AI Act transparency obligations). Not researched here; flag for legal check.

### Gaps
- No 2026 practitioner source describing a comparable end-to-end automated pipeline (with results) was found; the design is untested.
- Instagram's and TikTok's current rules on AI-generated-content labelling and on duplicate/unoriginal content reach were not researched.
- Which provider returns a stable direct media download URL for Reels (avoiding yt-dlp) was not verified.
- Sensible numeric alert thresholds (e.g. "5x account median within 48 h") are not empirically grounded; they must be calibrated on his own historical winners.
