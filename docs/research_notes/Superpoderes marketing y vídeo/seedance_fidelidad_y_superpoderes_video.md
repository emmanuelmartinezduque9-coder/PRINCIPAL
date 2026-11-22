# Faithful reference-video reproduction with Seedance 2.5 (no motion transfer) + "superpower" repos for video analysis and editing

State: 22 Nov 2026. Research notes for the product-video automation (EisWerk / EisWerk TM / HaarZauber).
Companion to `docs/research_notes/Herramientas automatización vídeos IA/` (costs, beat detection, renderers, QC are covered there and not repeated).

## 0. How to read this file: evidence levels and what could not be opened

Every claim carries one of these tags:

| Tag | Meaning |
|---|---|
| **[MCP]** | Read first-hand today from the owner's Higgsfield connector (model catalogue, bundled workflow files). Nothing was generated and no credits were spent. |
| **[GH]** | The file itself was downloaded from `raw.githubusercontent.com` and read in this session. The file is verified; what it *says about* ByteDance's official docs is still second-hand. |
| **[API]** | Repo metadata (stars, licence, last push) from the GitHub search API on 2026-11-22. |
| **[S]** | Search-result snippet only. The page was NOT opened. Treat as a lead, not a fact. |
| **[K]** | From prior knowledge, not re-checked in this session. |
| **[I]** | My inference / recommendation. |

**Blocked in this environment (must be allowed in the session's network settings to verify):**

- Page fetches failed (DNS not allowed) for `higgsfield.ai`, `fal.ai`, `www.kapwing.com`, `lumalabs.ai`. After four failures no more sites were tried, so **no vendor guide page was opened**: Dreamina/CapCut, BytePlus, seed.bytedance.com, Runway, Krea, Atlas Cloud, PixVerse, TikTok Ads help, etc. are all [S].
- `curl` could not reach `arxiv.org`, `dev.to`, `huggingface.co`, `docs.byteplus.com`, `www.volcengine.com`, `replicate.com`, `www.reddit.com`.
- GitHub: `api.github.com/repos/...` is refused per repo (file trees, issues, releases not readable). The **search API and raw file downloads worked**, so READMEs/skill files and star counts are verified, but issue activity and release history are not.
- **Not verified at all:** ByteDance's official Seedance 2.5 User Guide / Prompt Guide (dated 2026-07-31 according to secondary sources), BytePlus/Volcengine API parameter names and model ids, any hands-on output quality. No generation test was run.

---

# PART A — Reproducing a reference video faithfully with Seedance 2.5

## A1. Takeaway

There are four ways to get "same shot structure, action, camera and timing, own product and avatar" on Higgsfield without Genjutsu motion transfer. They differ in how literally they copy.

| # | Route | Higgsfield model | What it keeps from the reference | Fits "similar, not identical"? |
|---|---|---|---|---|
| 1 | **Recreate** (backend writes the prompt) | `ad_multiplier_v2` | Beats, order, timing, pacing, aspect ratio, capture style; **new footage** | Yes. Least control, least work. |
| 2 | **Omni-reference** with the viral clip as `@Video1` for camera/pacing/action only | `seedance_2_5`, `mode: omni_reference` | Whatever you tell it to inherit; everything else comes from your images and text | Yes. Most controllable. **Recommended main path.** |
| 3 | **Shot-by-shot**: one Nano Banana Pro first frame per shot + one short Seedance clip per shot, cut in the editor | `nano_banana_pro` + `seedance_2_5` (or `seedance_2_0`) | Exactly the cut times (the editor sets them); motion is re-described in text | Yes. Best product geometry, most calls. |
| 4 | **Video edit** (swap product/person inside the original footage) | `seedance_2_5` `mode: video_edit` / `ad_multiplier` | Everything, frame for frame | **No** — motion is identical and the base is someone else's footage. Only for the owner's own clips. |

[I] Suggested default: try route 1 once per reference as a cheap baseline, build the pipeline on route 2, and fall back to route 3 for shots where the product deforms or a cut lands wrong. Route 3 is also the only one where cut timing is exact, because Seedance itself drifts cuts by up to about a second (A7).

## A2. What Seedance accepts, and limits

### On Higgsfield (first-hand)

| | `seedance_2_0` [MCP] | `seedance_2_5` [MCP] |
|---|---|---|
| Duration | 4–15 s, whole seconds, default 5 | 4–30 s, whole seconds, default 5 |
| Resolution | 480p / 720p / 1080p / 4k (default 720p) | 480p / 720p / 1080p / 4k (default 720p) |
| Aspect ratio | auto, 16:9, 9:16, 4:3, 3:4, 1:1, 21:9 | same |
| Modes | `std` only (needs Plus plan or higher) | `t2v`, `omni_reference`, `video_edit`, `video_extension` |
| Media roles | `start_image`, `end_image`, `image_references`, `video_references`, `audio_references` | same five roles; `start_image`/`end_image` only in `omni_reference` |
| Images | max 9 across references + start + end | max 30 across references + start + end |
| Reference videos | max 3, each 2–15 s | max 10 |
| Reference audio | max 3, each 2–15 s; needs at least one image or video | max 10 |
| Other params | `genre` (auto/action/horror/comedy/noir/drama/epic), `bitrate_mode`, `generate_audio` | `bitrate_mode`, `generate_audio`, `extension_mode` (forward/backward), `draft` (480p draft, finalisable within 7 days), `draft_job_id` |
| Credits per second (480p / 720p / 1080p) | 3 / 4.5 / 12 | 3 / 7 / 16 (from the earlier cost notes, MCP quotes) |

Related Higgsfield models [MCP]:

- `ad_multiplier` — "powered by Seedance 2.5", same modes; the bundled workflow uses it with `mode: video_edit`, `generate_audio: false`, then restores source audio with ffmpeg.
- `ad_multiplier_v2` ("Ad Multiplier Recreate") — exactly 1 source video of 4–30 s + up to 20 images + a prompt of at most 4,000 characters. Accepts only `prompt`, `medias`, `resolution` (480p/720p/1080p), `count`, plus `mode: sections` + `section: hook|cta|both`. The backend analyses the source, classifies each image (product, person, wardrobe, location, prop, logo, style), writes the Seedance prompt itself, renders `ceil(source seconds)` at the source aspect ratio, and bills at the Seedance 2.5 per-second rate. Credits only (no unlimited/free), "Pro plan or higher". Results contain no captions. A job sits `queued` for a few minutes while the backend plans.
- `nano_banana_pro` — 1k/2k/4k, up to 14 reference images, ratios include 9:16.

### On ByteDance's own surfaces (second-hand)

- Seedance 2.0 on Jimeng: ≤9 images (<30 MB each), ≤3 videos (total 2–15 s, <50 MB each, 480p–720p input), ≤3 audio (total ≤15 s), ≤12 files combined, output 4–15 s. Two entry points: "first/last frame" (first frame + prompt only) and "omni reference" (all modalities, `@` tags). Uploads with realistic human faces were blocked. Reference videos cost extra compute. [GH: `MapleShaw/seedance2.0-prompt-skill/references/platform-specs.md`, `dexhunter/seedance2-skill/SKILL.md`]
- Seedance 2.5: 30 s single pass; 50 references (30 images ≤4K/≤30 MB, 10 videos of 2–30 s with ≤30 s total, 10 audio ≤30 s total); timestamps "honoured to the second"; negative commands reliable; video edit and extension first-class; extension up to a 60 s ceiling; separate "Ultra Long" mode 30–180 s; realistic humans allowed with lip-sync in 11 languages; Jimeng web outputs 480p/720p. [GH: `smixs/visual-skills/video/references/seedance-25.md`, which says it is built from the official Dreamina/Jimeng guides of 2026-07-31]
- Official launch post exists: "One-take Creation, Flexible Referencing: Introducing Seedance 2.5", seed.bytedance.com, dated 2026-07-31; BytePlus availability post 2026-08-06. [S]
- **Conflicts between sources:** resolution (720p-only vs 1080p vs native 4K vs a separate "2.5 HD" tier) [S]; Higgsfield's catalogue lists up to 4k [MCP]. Use the Higgsfield catalogue as the truth for this pipeline. One comparison site says first/last-frame input on 2.5 "may depend on the host" [S]; on Higgsfield it is exposed [MCP].

## A3. Reference-tag syntax

- The model family binds uploaded files to roles with `@` tags: `@Image1…`, `@Video1…`, `@Audio1…` (Chinese UI: `@图片1`, `@视频1`, `@音频1`). [GH]
- **On Higgsfield the canonical form is exactly `@Video1` and `@ImageN`** — case-sensitive, no space, never `@video1`/`@image1`. Numbering follows the order of the `medias` array. Never put media ids or URLs in the prompt. [MCP: `ad-multiplier/references/prompt-writer.md`]
- Other spellings seen: `@Image 1` (with space, in the guide derived from the official English docs), `@img1` (older 1.x/2.0 community syntax). [GH] They are host-dependent; use the Higgsfield form.
- **Open point:** with direct `seedance_2_5` + `omni_reference`, it is not documented whether a `start_image` counts as `@Image1`. The Higgsfield workflows only show `role: "video"` and `role: "image"` (the server coerces roles). [MCP] Must be settled with one cheap 480p test. [I]

Rules for writing the role of each reference (consistent across all sources read):

1. **Give every reference exactly one job, in words.** "reference `@Video1`'s camera movement", never just "reference `@Video1`". [GH: dexhunter; S: several guides]
2. **Add exclusions** for anything that could bleed: "Do not use the person's identity, clothing, or scene from the video." "Do not use the image background." [GH: smixs §5]
3. **Bind each subject individually**; never "`@Image1`–`@Image4` are four characters respectively". [GH]
4. **Do not re-describe what a reference already defines.** If `@Video1` defines the motion, state which attributes to inherit; re-describing every action conflicts with it. Same rule for image-to-video: describe motion and camera only, not what is visible in the first frame. [GH: smixs]
5. **Repeat the tag** of an important asset several times through the prompt — said to raise accuracy. [GH]
6. Stability sweet spots (attributed to the official guide): 1–5 subjects per reference video, **reference clip 5–10 s**, 1–8 subjects across images, separate images per view beat a collage, video-edit sources ≤20 s. [GH]
7. Higgsfield's own house rule for person references: the image is authoritative for the **complete look** (face, hair, build, clothing, accessories); `@Video1` supplies only performance, pose, blocking, camera, lighting and timing. [MCP]

## A4. Multi-shot and timing inside one generation

- Explicit cut markers produce separate shots in one clip: `Shot 1.` / `Cut to.` / `Camera cut to.` [GH: smixs `seedance.md`]
- Time windows: `0–3s: …`, `[0-4s] …`, `[00:00-00:08] …`. On 2.0 they were ordering hints; on 2.5 they are honoured as timing. [GH]
- Rules attributed to the official 2.5 guide [GH]:
  - A range is an event's **time budget, not an edit point**; ranges consecutive and non-overlapping.
  - **Windows of 3 s or more**; shorter ones execute unreliably.
  - **One core action + one camera move per window.**
  - State the visible **end state** of each stage.
  - Triggers beat raw seconds: "Three seconds after she presses the button…".
  - Duration, ratio and resolution are API parameters, **not prompt text**.
- Higgsfield's `angles-hf` workflow contradicts the 3 s floor in practice: it writes **2–14 shots, each ≥0.5 s**, with "hard cuts at t1, t2, …" stated once in the first paragraph and again per shot, and it allows bursts of 0.5–1 s cuts. [MCP] It is a `video_edit` over existing footage, which is easier than free generation. [I] For viral product clips (median shot ≈2.3 s, B2) expect to need sub-3 s shots and to verify them.
- Older 2.0 guidance: hard cap about 5 shots per generation; 2–3 shots per 5 s; split longer stories into separate generations. [GH]
- Anti-"one continuous take" block to put at the very top when cuts get smeared [GH]:
  `This must be a clearly edited multi-shot sequence with visible cuts between shots. Do not generate a single continuous take. Each shot must have a different camera angle and different framing.`
- 2.5 audio/text markers: music `( )`, sound effects `< >`, dialogue `{ }`, titles `【 】`. Reliable bans: "Pure video, no subtitles, no background music." [GH]

## A5. Describing camera and action beats

- Understood without translation: extreme wide / wide / medium / close-up / extreme close-up; push in, pull out, pan, lateral move, follow, orbit, dolly out, tilt, handheld; low angle, overhead, first-person; one-take, dolly zoom, aerial, FPV, bullet time, speed ramp, whip pan, crash zoom. [GH]
- For anything rarer: `term + target subject + visible change + foreground/background relationship + direction or speed`. Lens millimetres are allowed, but the visible result in words is what steers. [GH]
- Per shot, Higgsfield's template specifies: **lens (mm), camera position by the set and the people (not "left/right of frame"), height, move with direction and speed, what fills the frame, what is behind the subject, and the moment the shot catches.** [MCP]
- A full orbit or other big move needs about 4 s. [MCP]
- Never name camera gear or "the camera" as an object in the scene — a tripod appeared in a test. [MCP]
- Seedance pushes an angle further round than written ("three-quarter from behind his shoulder" came back as his back). [MCP]
- Action: one micro-action per beat, written as a physical fact; chain consequences ("hand grips jar → lid actually unscrews"). Add `realistic hands` for product handling. Do not combine walking with a fine product manipulation in one beat. [GH: smixs; LearnPrompt UGC template]

## A6. Keeping product geometry and avatar identity

- Lock product and person **separately**, each with its own reference(s). Decompose the product into parts (shape, cap, label position, material, colour, proportions). [GH: LearnPrompt]
- Supply several product views as separate images (front, side, back, in-hand scale), plus a dedicated logo/label close-up. [GH; S]
- Explicit constraints that guides recommend: "keep logo position and packaging proportions fixed; do not invent or redraw label copy; no warped reflections; rigid, no soft-body deformation; stays attached to the palm, no clipping through fingers." [GH; S]
- **Do not hold a macro shot on printed label text**, and do not ask the model for slogans or captions — generated typography is garbled. Leave clean frames and add text in post. [GH]
- When two references disagree, remove the weaker one rather than asking the prompt to reconcile. [S]
- Same subject in two states (before/after) = two image slots bound to time ranges; described as the flakiest binding. [GH]
- Longer clips drift more; review the **whole** clip, not first and last frames. [S]
- For the avatar: character sheet (front / back / portrait) as separate images; append "retaining real fine pores and skin texture". [GH; MCP has a `character-sheet` workflow]
- [I] The strongest geometry lock is still a correct **first frame** containing the real product (route 3, A9): the video model then only has to preserve what is already on screen.

## A7. Known failure modes and fixes

| Failure | Fix | Source |
|---|---|---|
| Cuts land early/late | Expect ±1 s; up to 2.5 s late if the clip opens on the reference's own framing. Re-time in the editor or generate per shot. | [MCP] angles-hf |
| Output ends a fraction short; 24 fps | Cut audio to video; conform to 30 fps in the edit. | [MCP] |
| Model copies the reference too literally | Say what `@Video1` must NOT contribute; describe a different background/setting; a shot close to the original's side/height/size comes back as the original. | [MCP] |
| Reference ignored / motion differs | Make the transfer instruction explicit; shorten and simplify the reference to one readable motion. | [S] |
| One-take when cuts were asked (or the reverse) | Top-of-prompt cut block; or "One continuous shot, no cuts of any kind". 2.5 "errs by commission" and may cut freely. | [GH] |
| Unwanted second camera angle around 2.5–3 s in generated clips | Use the first continuous seconds; keep single-shot clips short. | [GH] herk playbook |
| Twins / blended faces | Per-subject binding + "movements are not synchronised; no identical clones". | [GH] |
| Random subtitles / music | "Pure video, no subtitles, no background music", repeated at the end. | [GH] |
| Plastic skin | "retaining real fine pores and skin texture". | [GH] |
| Garbled on-screen text and labels | Keep text small or out of close-ups; add in post. | [GH] |
| Edit mode stalls | Source ≤20 s; "`@Video1` is the sole editing master"; one edit target per pass. | [GH] |
| Job rejected `nsfw` / `ip_detected` | Do not resubmit; change the input. Relevant when the reference shows brands or known faces. | [MCP] |
| Debugging | Change one variable per retry (motion, camera, identity, light, audio). | [S] |

## A8. Seedance 2.0 vs 2.5

| | 2.0 | 2.5 |
|---|---|---|
| Single pass | ≤15 s | ≤30 s |
| References | 12 files (9 img / 3 vid / 3 aud) | 50 (30 / 10 / 10) |
| Timestamps | ordering hints | honoured as timing [GH] |
| Negative instructions | fragile; rephrase positively | reliable [GH] |
| Real faces | filtered on ByteDance surfaces | allowed; headline feature [GH] |
| Edit / extension | workarounds via prompt | dedicated modes [MCP] |
| Draft workflow | — | 480p draft → finalise [MCP] |
| Price on Higgsfield, 720p | 4.5 credits/s | 7 credits/s |
| When to pick | short clip, one subject, one action; cheap per-shot work [S] | multi-shot in one pass, heavy reference kits, video reference fidelity |

Third-party quality claims ("~20% better prompt adherence") are unbenchmarked. [S]

## A9. The still first frame (Nano Banana Pro) so the video follows it

Mostly [I], backed by [GH]/[S] where marked.

1. **One first frame per shot**, composed like the reference shot's first frame. Extract that frame with ffmpeg and give it to Nano Banana Pro as *composition and pose guide only*, plus product views and the avatar sheet (≤14 references on Higgsfield [MCP]).
2. **Same aspect ratio as the output** (9:16). The first frame locks the ratio; a mismatched last frame is stretched. [GH]
3. **No captions, stickers or UI in the frame.** They get animated and warped. Add in post.
4. **Product large, sharp, correctly oriented, label legible, correct scale in the hand.** Check fingers and grip before spending video credits. Animate only approved stills. [S]
5. **No motion blur and no mid-air poses** unless the shot starts that way; the frame should be a believable instant from which the described motion can begin.
6. **Identical lighting across start and end frames** if an end frame is used; otherwise the model invents a lighting change. [S] Use an end frame only when the final product position matters (reveal, hero shot).
7. **Change setting details on purpose** (room, wardrobe, props) so the result is similar but not a copy.
8. In the video prompt **describe only motion, camera and sound**; do not re-describe the frame. [GH]
9. Generate at 2K (2 credits on Higgsfield per earlier notes); 4K is unnecessary for 720p/1080p video.

Nano Banana Pro first-frame prompt:

```text
Create the opening frame of a vertical 9:16 smartphone video.
Composition and pose: follow reference image 1 — same framing ({shot size}), same camera height and angle,
same subject position and hand pose. Use it for layout only; do not copy its person, product, room or text.
Person: the woman from reference images 2–3 (same face, hair, skin tone, build), wearing {outfit}.
Product: the exact {product} from reference images 4–6 — same shape, proportions, colours, material and label;
label text sharp and unchanged; held in her {right} hand at true scale, fingers natural, nothing covering the logo.
Setting: {own setting, different from the reference}. Light: {source and direction}.
Photoreal phone-camera look, natural skin texture, sharp focus on the product, no motion blur.
No captions, no on-screen text, no watermark, no extra people.
```

## A10. Prompt templates for the video

All templates use the Higgsfield tag form. Duration, ratio and resolution go in the API params, not in the text. Placeholders in `{}` come from the automatic breakdown of the reference (Part B).

### T1 — Route 2: omni-reference, viral clip as structure reference (main path)

Params: `model: seedance_2_5`, `mode: omni_reference`, `aspect_ratio: "9:16"`, `duration: {L}`, `resolution: "720p"`, `generate_audio: false` (if music/voice is added in post). Medias in this order: reference video (trimmed to the segment, ideally 5–10 s), then images.

```text
[References]
@Video1 defines only the shot order, cut timing, camera position and movement in each shot, and the type and
rhythm of the action. Do not use the person, product, clothing, room, colours, text or logos from @Video1.
@Image1 defines the woman: face, hair, skin tone, build and full outfit. Keep her identical in every shot.
@Image2, @Image3 and @Image4 define the product ({product name}): exact shape, proportions, colours, material,
cap and label placement. The product is rigid; it never bends, melts or changes size. Do not redraw label text.
@Image5 defines the room.

[Summary]
A {L}-second vertical UGC product video in {N} shots with hard cuts at {t1} s, {t2} s, {t3} s. Handheld phone look.
The woman from @Image1 {one-line story} with the product from @Image2.

[Shots]
Shot 1, 0.0–{t1} s — {lens/shot size}, {camera position and height}, {move}: {what fills the frame};
she {one action}. End state: {visible state}.
Shot 2, {t1}–{t2} s — {…}: the product from @Image2 {action}; {one camera move}. End state: {…}.
Shot 3, {t2}–{t3} s — {…}
Shot 4, {t3}–{L} s — hero: the product from @Image2 alone, upright, label facing us, then her hand lifts it
toward the lens. End state: product centred, sharp, still.

[Keep consistent]
Same woman, outfit, product and room in every shot. Realistic hands, five fingers, the product stays in her grip
and never clips through fingers. Movements follow the rhythm of @Video1 but are her own natural movements.
Pure video: no subtitles, no on-screen text, no logos other than the product's own label, no watermark, no music.
```

### T2 — Route 2 without a video reference (text-only shot list + first frame)

Use when the reference contains brands/faces that trigger `ip_detected`, or to force "similar, not identical". Params as T1 but medias = `start_image` (the Nano Banana Pro frame) + product/avatar references.

```text
This must be a clearly edited multi-shot sequence with visible hard cuts. Do not generate one continuous take.
The clip opens exactly on @Image1 (first frame). @Image2–@Image4 define the product; @Image5 defines the woman.

[0–3s] {shot size}, {camera position}, {one move}: {one action}. <{one sound}>
[3–6s] Cut to. {…}
[6–9s] Cut to. {…}
[9–12s] Cut to. Hero shot: {…}. End state: {…}.

Same woman, outfit, product and light throughout. The product is rigid and keeps its exact proportions and label.
Realistic hands. No subtitles, no on-screen text, no music.
```

### T3 — Route 3: one clip per shot from its own first frame

Params: `seedance_2_5` `omni_reference` (or `seedance_2_0`), `duration` = shot length rounded up to ≥4 s (trim in the edit), medias = `start_image` (+ optional `end_image`, + 1–2 product references).

```text
One continuous shot, no cuts of any kind. Starts exactly on the first frame.
She {single action, physical and specific}; the product {what it does}. {Camera: static | slow push-in | handheld
follow}, {direction and speed}. The product stays rigid, same size and label, firmly in her grip.
Nothing new enters the frame. No text, no subtitles, no music.
```

### T4 — Route 4: video edit, product swap (own footage only)

Params: `model: ad_multiplier` (or `seedance_2_5`), `mode: video_edit`, `duration: ceil(source)`, `aspect_ratio: "auto"`, `generate_audio: false`; source video first, then images. Compact form from Higgsfield's own contract [MCP]:

```text
TASK - VIDEO EDIT:
Preserve every caption, subtitle, and other untargeted on-screen text element from @Video1 exactly as it appears,
including its wording, styling, placement, animation, and timing. Text physically attached to a replaced target
follows that replacement.
0-{L}s: Replace only {the bottle held by the woman} in @Video1 with {product name} from @Image1. Keep every
unrequested element, camera motion, lighting treatment, and overall color grading from @Video1 exactly the same.
```

A person replacement needs the DETAILED form with a per-person exclusion line ("The original source person identified as … must never appear in any frame…"). The render is silent; original audio is put back with `ffmpeg -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest`. [MCP]

### T5 — Route 1: Recreate

Params: `model: ad_multiplier_v2`, `count: 1`, `resolution: "720p"`, medias = source video (`role: video`) + up to 20 images (`role: image`). Send no duration, ratio or audio fields.

```text
Recreate this ad with my product instead of the original one: {product name}, {facts the owner gave, no invented
claims}. The woman in the first image replaces the presenter; the next three images are the product from the
front, side and back. Spoken language: German. Say exactly: "{line 1}" … "{line 2}". Setting: {own setting}.
Keep the same shots, order and pacing.
```

### Pipeline sketch [I]

1. Download reference → shot detection + frame sheets + transcript (Part B) → shot table JSON: `start, end, shot_size, camera_position, move, action, product_visible, on_screen_text, audio`.
2. A model fills T1 from the table; a validator checks: tags canonical, every attached image cited, shots tile 0–L, one action + one move per shot, no text requests.
3. Draft at 480p (`draft: true` or `resolution: 480p`), 1–2 variants.
4. Automatic QC: detect cuts in the output and compare with the plan (tolerance about 1 s); a vision model checks product shape/label and identity per shot on frame sheets.
5. Finalise the passing draft at 720p/1080p; failed shots are regenerated through T3 and spliced.
6. Captions, zooms, sound, music in the editor (Part B).

## A11. Gaps (Part A)

- ByteDance's official Seedance 2.5 guides and API docs were not read; everything "official" above is relayed by `smixs/visual-skills` or by search snippets.
- No generation was run: how closely `omni_reference` follows a 9:16 viral clip's cut timing with sub-3 s shots is untested.
- How `@ImageN` is numbered when `start_image` is present on direct `seedance_2_5` calls: undocumented.
- Whether a reference video showing real, recognisable creators is accepted by `seedance_2_5` on Higgsfield in practice (only the `nsfw` / `ip_detected` failure codes are documented).
- What `ad_multiplier_v2` actually writes as its internal prompt, and how often it changes the action: black box.
- Using a third party's viral video as an input reference has copyright/platform-policy implications that this note does not assess.

---

# PART B — Repos and tools for automated video analysis and editing (macOS/Linux)

Star counts and dates are [API] on 2026-11-22. Stars are popularity, not quality; several very high counts in this niche grew within months. "Read" = the README or skill file was downloaded and read [GH]. Maturity is my judgement [I].

## B1. Video understanding / breakdown

| Tool | Stars · last push · licence | What is reusable | Maturity |
|---|---|---|---|
| Higgsfield `video_analysis_create` (connector tool) | — | Scene-by-scene storyboard of an uploaded video or YouTube URL, or a free-text question; `deep` / `glance`; costs credits, about 3–5 min; less accurate on long videos. Already used by Higgsfield's own ad workflow as "timed source caption". [MCP] | Production, closed |
| Higgsfield `angles-hf` method (`sheets.py`) | — | Pattern, not a library: a frame every 0.25 s, each stamped with its second, 20 per sheet, plus timed speech; the model must look at every sheet and build a moment list and shot table before prompting. Script is only present inside Higgsfield's sandbox. [MCP] | Pattern to copy |
| [marwanm7moud/watch-video](https://github.com/marwanm7moud/watch-video) | 3 · 2026-10-31 · MIT | MCP server + skill + CLI (`pipx install watch-video-mcp`): local transcript (platform subs → Parakeet → faster-whisper), scene-selected keyframes, labelled contact sheets (about 20 frames for the token cost of 1.5 images), exact-timestamp frames, OCR. No API keys. Read. | Young, tiny user base, clean design |
| [bsisduck/video-analyzer-skill](https://github.com/bsisduck/video-analyzer-skill) | 66 · 2026-11-18 · **GPL-3.0** | Shell scripts: fps by duration tier (2 fps under 1 min), portrait-aware 3×5 grids, scene-change keyframes, Whisper, parallel sub-agents, Markdown timeline. Skips Instagram/TikTok thumbnail streams. Read. | Small, active. GPL: use as a tool, do not copy code into the app |
| [creatify-ai/video-ad-reverse-engineer](https://github.com/creatify-ai/video-ad-reverse-engineer) | 78 · 2026-03-03 · MIT | The knowledge files: 12 ad formats, 10 hook types, 7-step analysis, fill-in output template; `extract_frames.py` with cut detection. Funnels to Creatify's paid API, which is optional. Read. | Small, stale since March; reference material is the value |
| [sharon-laicc/viral-video-decomposer](https://github.com/sharon-laicc/viral-video-decomposer) | 14 · 2026-06-12 · MIT | Output contract worth copying: shot table + "viral mechanism" + **`video_generation_brief.json`** for a downstream generator + HTML report + contact sheet. Chinese-first. Read. | Hobby |
| [fendouai/ViralForge](https://github.com/fendouai/ViralForge) | 480 · 2026-11-20 · Apache-2.0 | "Viral DNA report" (hook, shot structure, word anchors, beat grid, caption style) → editable project → 10 costed variants; MCP server. Its demos were made **by hand** in Jimeng with Seedance 2.0 mini using the original as video reference, and it says shot timing is not verified. Read. | v0.1, early |
| [hypit-ai/hypit](https://github.com/hypit-ai/hypit) | 30,975 · 2026-11-20 · licence unclear | "Clone any viral video": agent rebuilds footage, captions, B-roll, effects as an SVML workflow anchored to words; examples use Seedance 2 Mini + WhisperX + head-tracked captions. Read (top of README). | Popular, very new; licence must be checked before reuse |
| [OpenMontageInc/OpenMontage](https://github.com/OpenMontageInc/OpenMontage) | 82,143 · 2026-11-16 · **AGPL-3.0** | "Paste a reference video" → transcript, pacing, scenes, keyframes → concepts with cost estimate. Already in earlier notes (under its old owner name). | Large; AGPL limits embedding in a hosted app |
| Gemini-based skills: [mrzhangguoguo/gemini-video-analysis-skill](https://github.com/mrzhangguoguo/gemini-video-analysis-skill) (8★, MIT), [adamanz/video-understanding-skill](https://github.com/adamanz/video-understanding-skill) (1★) | — | Native video upload to Gemini → storyboard, keyframes, HTML report. Not read. | Hobby; the Gemini API itself is the reusable part (see earlier notes) |
| [browser-use/video-use](https://github.com/browser-use/video-use) | 31,403 · 2026-10-08 · MIT | Idea to reuse: the model **reads** video as a packed word-level transcript (about 12 KB) plus on-demand "timeline view" PNGs (filmstrip + waveform + word labels) instead of thousands of frames. Read. | Solid, widely used |

[I] For this project: Higgsfield's analysis tool or Gemini for the first pass; a local frame-sheet + PySceneDetect pass (watch-video style) as the ground truth for cut times, because the Seedance prompt and the QC both need exact seconds.

## B2. Retention-oriented editing (cuts, zooms, captions, sound)

| Tool | Stars · last push · licence | What is reusable | Maturity |
|---|---|---|---|
| [browser-use/video-use](https://github.com/browser-use/video-use) | 31,403 · 2026-10-08 · MIT | Transcribe → pack → model writes an EDL → render → **self-evaluation at every cut boundary** (max 3 fix passes); filler removal, 30 ms audio fades at cuts, colour grade per segment, 2-word uppercase captions; overlays via HyperFrames/Remotion/PIL. Needs an ElevenLabs key for Scribe. | Solid |
| [kajisho5/ffmpeg-skill](https://github.com/kajisho5/ffmpeg-skill) | 9,311 · 2026-11-21 · MIT | 42 typed FFmpeg tools + MCP server, Python standard library only: cut, join, silence removal, fit to duration/aspect (`--aspect 9:16 --fit crop`), animated/karaoke captions, loudness (`-I -14`), scene detection, probe/check/look verification, review page with platform safe areas. Refuses to overwrite sources. Read (top). | Active; good "hands" layer |
| [KyaniteLabs/kinocut](https://github.com/KyaniteLabs/kinocut) | 274 · 2026-11-22 · Apache-2.0 | Guardrailed editing MCP server + Python client + CLI (`pip install kinocut`): edits validated before FFmpeg runs, quality gates for black frames/silence/loudness, a "Video Receipt" of what ran. Read (top). | v2.0.1, small |
| [nateherkai/herk-edit-kit](https://github.com/nateherkai/herk-edit-kit) | 3,052 · 2026-10-14 · licence unclear | 15 skills on HyperFrames + GSAP; silence cutting, mistake detection, EDL review, **beat-sync validation**, 406 motion-graphics cards; `docs/EDITING-PLAYBOOK.md` with measured house rules (B4). Read. | Active; check licence |
| [pycodebr/heditor](https://github.com/pycodebr/heditor) | 117 · 2026-11-20 · MIT (per README) | Vertical talking-head editor: 49 style packs, word-synced captions, sound design with licence-tracked sources (Mixkit, Openverse), depth/matte effects via MediaPipe; **`heditor study`** measures cuts (including jump cuts and punch-ins that ffmpeg's scene score misses), shot lengths and rhythm of reference Reels; **`heditor splice`** swaps only the hook on an existing ad with matched loudness. Read (parts; Portuguese). | Small, very active |
| [mrpaidsocial/mrpaidsocial-video-editor-agent](https://github.com/mrpaidsocial/mrpaidsocial-video-editor-agent) | 189 · 2026-11-12 · none stated | Skill pack: `reel-style-clone` → STYLE-GUIDE.md from a reference reel, karaoke captions + SFX markers, ElevenLabs sound kit "mixed by math", QA on the rendered file (frames + dB + seams), `hook-splitter`. Read. | Small; no licence = ask before reuse |
| [Vibha-Ramprakash/claude-video-effects](https://github.com/Vibha-Ramprakash/claude-video-effects) | 1,122 · 2026-11-12 · licence unclear | 51 effects by command, timed by seconds or by spoken word: `lean-in` (punch-in on one word), `locked-on` (face tracking), text behind the head, freeze-frame arrows. ffmpeg + Python. Teaser for a paid pack. Read. | Usable, check licence |
| [kurbaitaev/ghost-editor](https://github.com/kurbaitaev/ghost-editor) | 680 · 2026-11-18 · MIT | Raw talking-head take → reel in 19 named styles; "make my video look like this reel". Read (top). | Active |
| [hassancs91/claude-youtube-editor](https://github.com/hassancs91/claude-youtube-editor) | 388 · 2026-11-05 · MIT | `/suggest-sfx`: function-first sound effects landing on the exact word from a growing library; `/clean-cut`; ghost-speech and A/V-drift checks. Remotion. Read. | Small, complete pipeline |
| [AgriciDaniel/claude-shorts](https://github.com/AgriciDaniel/claude-shorts) | 463 · 2026-07-11 · MIT | Long → short with Remotion animated captions and AI segment scoring. Not read. | Stale since July |
| [WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor) | 6,044 · 2026-11-22 · Unlicense | CLI that cuts silence/dead space by audio or motion; exports timelines. [K] for features. | Mature |
| Caption components for Remotion: [remotion-captioneer](https://github.com/neutral-Stage/remotion-captioneer) (20★), [remotion-captions-themes](https://github.com/vshukla7/remotion-captions-themes) (11★), [remotion-captions-kit](https://github.com/Fats403/remotion-captions-kit) (9★), all MIT; [nicolaigaina/ai-video-captions](https://github.com/nicolaigaina/ai-video-captions) (75★, MIT, 6 styles) | — | Word-level animated caption presets (karaoke, pills, kinetic). Not read. | Hobby-size; Remotion's own `@remotion/captions` is the safer base [K] |
| [m-bain/whisperX](https://github.com/m-bain/whisperX) | 25,575 · 2026-11-21 · BSD-2-Clause | Word-level timestamps + diarisation: the timing source for captions, punch-ins and SFX "on the word". | Mature |
| [js713-lab/sonic-match-mcp](https://github.com/js713-lab/sonic-match-mcp) | 153 · 2026-10-23 · MIT | MCP server that analyses the footage (mood, pace, cuts, speech) and returns licence-labelled royalty-free music, a 12–20 s hook window and an **ffmpeg ducking spec**. Does not provide platform trending audio. Read. | Early; PyPI package not yet published |
| Speed ramps: [nokkanato/speed-ramp-skill](https://github.com/nokkanato/speed-ramp-skill) (0★), [ibrahimjspy/AI-Speed-Ramping](https://github.com/ibrahimjspy/AI-Speed-Ramping) (8★, optical flow) | — | Nothing established. Implement directly with ffmpeg `setpts` segments or in the renderer. [I] | None mature |
| Auto zoom / punch-in | — | No dedicated established repo found (search returned nothing). It lives inside the editors above, or is a `zoompan`/`crop` + `scale` filter keyed to word timestamps. [I] | Build in-house (small) |

## B3. Renderers, FFmpeg helpers, timeline formats

| Tool | Stars · last push · licence | Notes |
|---|---|---|
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | 87,876 · 2026-11-22 · Apache-2.0 | HTML/CSS/GSAP → deterministic MP4; CLI + agent skills (`npx hyperframes skills update`), Claude Code plugin, catalogue of blocks. An independent test list reports 23.5 min for a 15 s brief when an agent authors from scratch. [GH] Templates fix that. Many skills above build on it. |
| [remotion-dev/remotion](https://github.com/remotion-dev/remotion) + [remotion-dev/skills](https://github.com/remotion-dev/skills) | 74,770 / 7,736 · 2026-11 · custom licence | React video; official agent skills. Company licence needed above a small team size [K] — see earlier notes. |
| [midrender/revideo](https://github.com/midrender/revideo) (formerly redotvideo) + [midrender/examples](https://github.com/midrender/examples) | 4,223 / 152 · 2026-07-15 · MIT | TypeScript scenes, headless `renderVideo()`, parallel rendering, Cloud Run example. Last push July: slower than the two above. |
| [nexu-io/html-video](https://github.com/nexu-io/html-video) | 4,892 · 2026-11-17 · Apache-2.0 | HTML → MP4 with pluggable render engines. Not read in depth. |
| [nexu-io/openmotion](https://github.com/nexu-io/openmotion) | 14,742 · 2026-11-22 · Apache-2.0 | Recreates a reference video as editable motion graphics; **`Motion.md`** format for shot order, timing and transitions; imports HyperFrames projects. Read (top). |
| [lucemia/typed-ffmpeg](https://github.com/lucemia/typed-ffmpeg) | 1,163 · 2026-11-19 · MIT | Type-safe FFmpeg filter graphs for Python and TypeScript. Preferred over `ffmpeg-python` (11,022★, last push 2024-08, effectively unmaintained). |
| [Zulko/moviepy](https://github.com/Zulko/moviepy) | 15,188 · 2026-08-26 · MIT | Python compositing; slower than raw FFmpeg. |
| [mifi/editly](https://github.com/mifi/editly) | 5,638 · 2025-05-12 · MIT | Declarative JSON edits; stale. |
| [Breakthrough/PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | 5,612 · 2026-11-22 · BSD-3 | Cut detection for both analysis and QC of generated clips. |
| [AcademySoftwareFoundation/OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | 2,108 · 2026-11-20 · Apache-2.0 | Neutral timeline/EDL format if edits must open in Premiere/Resolve. |
| Catalogues: [zhuyansen/awesome-claude-video-skills](https://github.com/zhuyansen/awesome-claude-video-skills) (2,505★, 537 repos, each "security-graded", 16 tested end to end), [Supersynergy/awesome-ai-video-editing](https://github.com/Supersynergy/awesome-ai-video-editing) (8★, CC0) | — | Best index for finding more; the first was read in part. |

Seedance prompt knowledge packaged as skills (for the prompt-writer step of Part A):

| Repo | Stars · last push · licence | Use |
|---|---|---|
| [smixs/visual-skills](https://github.com/smixs/visual-skills) | 732 · 2026-11-06 · CC BY 4.0 | `video/references/seedance-25.md` — the most complete 2.5 reference found; attribution required. Read in full. |
| [LearnPrompt/awesome-seedance](https://github.com/LearnPrompt/awesome-seedance) | 2,617 · 2026-11-21 · MIT | 1,000+ cases traced to original posts; category templates such as "UGC creator review". Read (one template). |
| [dexhunter/seedance2-skill](https://github.com/dexhunter/seedance2-skill) | 4,558 · 2026-09-19 · MIT | Compact 2.0 skill: limits, `@` roles, templates. Read in full. |
| [MapleShaw/seedance2.0-prompt-skill](https://github.com/MapleShaw/seedance2.0-prompt-skill) | 851 · 2026-06-21 · MIT | Chinese; storyboard-grid-driven prompting, image-to-prompt, first-frame image prompts for Nano Banana. Read (parts). |
| [ZeroLu/awesome-seedance](https://github.com/ZeroLu/awesome-seedance) (2,859★, MIT), [YouMind-OpenLab/awesome-seedance-2-prompts](https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts) (2,242★) | — | Prompt libraries. Not read. |
| [OSideMedia/higgsfield-ai-prompt-skill](https://github.com/OSideMedia/higgsfield-ai-prompt-skill) | 954 · 2026-11-18 · MIT | Higgsfield-specific; marked "no longer maintained". Not read. |

## B4. What drives retention: data and research

**Measured, open data**

- [shortformkit/short-form-video-hook-study-2026](https://github.com/shortformkit/short-form-video-hook-study-2026) — 167 public videos from 21 large creators, measured 2026-11-17, CSV, CC BY 4.0 per README (0 stars; small sample; not peer-reviewed; creators, not product ads). Read. Findings:
  - First cut: median **2.6 s**; only 14% cut within the first second; 53% within 3 s; 13% have no cut.
  - Median shot length **2.3 s**, about **25 cuts per minute** (TikTok calmer: 3.1 s, 16.9/min).
  - Sound from the first frame: 95%. Spoken: 75%; of those, speech within 2 s: 84%.
  - Edited-in **text on the first frame: 58%**.
  - Columns usable as targets for the editor: `first_cut`, `cuts_first3`, `cuts_per_min`, `audio_onset`, `speech_2s`, `text_first_frame`.
- [dasongli1/SnapUGC_Engagement](https://github.com/dasongli1/SnapUGC_Engagement) — "Delving Deep into Engagement Prediction of Short Videos" (ECCV 2024), 26★, last push 2025-05; engagement labels derived from watch time on Snapchat Spotlight [K for details]. Existence verified [API].
- [westlake-repl/MicroLens](https://github.com/westlake-repl/MicroLens) — large short-video recommendation dataset with raw video/audio/text, 314★ [API]. Recommendation-oriented, not edit-feature-oriented [K].
- arXiv 2606.16053, "Modeling Engagement with Brand and Organizational TikTok Videos…": audio source type is the only content variable recurring across all four engagement outcomes; hook variables are among the top predictors. [S] — not opened.

**Platform guidance** (all [S], TikTok Ads help and Creative Codes deck not opened)

- TikTok performance-ads guide: put the hook in the first 6 s; state the proposition in the first 3 s; captions/text overlays at about 5–10 words per second.
- TikTok Creative Codes: "90% of ad recall impact is captured within 6 seconds" (the deck cites a Neuro-Insight study); best with sound on.
- "63% of highest-CTR videos show the key message or product within 3 s" — attributed to TikTok, found only on secondary sites.
- No Meta/Reels primary source was found in this session.

**Practitioner rules** ([GH] herk `EDITING-PLAYBOOK.md`; experience of one creator, not a study)

- Hook in the first 3 s: a claim or command naming the thing.
- Punch-in of **5–15%** on pivots, emphasis and the CTA.
- One caption look for the whole reel; never over the mouth or chin, least of all in the first second; measure contrast behind every caption.
- Sound effects follow **visible actions**, not every cut; avoid a whoosh on every cut.
- Check frame strips 10 frames each side of every cut.
- "A raw recording caps the edit": no hook and no CTA scores low however well it is cut.

**Unverified numbers to avoid quoting** — "65% who watch 3 s stay 10 s", "71% decide within 3 s", retention medians of "84% at 1 s / 56% at 3 s", a "46,605 TikTok hooks" study: vendor blogs, no traceable primary source. [S]

**Gap:** no peer-reviewed study was found that links cut frequency or pattern interrupts directly to retention on TikTok/Reels. [I] The practical answer is to measure the project's own references with the hook-study columns and copy the reference's own numbers per video, rather than apply a universal rule.

## B5. Suggested stack for this project [I]

1. **Analysis:** yt-dlp → PySceneDetect cut list + 0.25 s stamped frame sheets + WhisperX words → Gemini or Higgsfield analysis for semantics → one JSON brief per reference (shot table + hook type + caption style + hook-study metrics).
2. **Generation:** Part A templates filled from that JSON.
3. **Edit:** `ffmpeg-skill` or `typed-ffmpeg` for cuts, 9:16 fit, loudness; HyperFrames (Apache-2.0) for captions and motion graphics; punch-ins and SFX keyed to WhisperX word times; music ducking as in sonic-match.
4. **QC:** re-run cut detection and frame sheets on the output, compare with the reference metrics, vision check at every cut (video-use / angles-hf pattern).
5. Licence hygiene: prefer MIT/Apache/BSD parts; keep GPL/AGPL tools (video-analyzer-skill, OpenMontage, pireel, OpenChatCut) as external tools only; confirm licence for hypit, herk-edit-kit, claude-video-effects before copying anything.

## B6. Gaps (Part B)

- None of these tools was installed or run; maturity is judged from READMEs, dates and stars.
- Issue trackers, release cadence and contributor counts could not be read (repo API refused).
- Higgsfield's `virality_predictor` tool exists in the connector's tool list but was not inspected.
- Meta's own creative guidance and any dataset with per-second retention curves for ads were not found.
