# Automatic short-form video editing where cut rhythm follows the music and replicates a reference video (state as of 22 Nov 2026)

> Reading notes for the report writer
> - Evidence levels used below: **[primary]** = I opened the repo/doc page itself; **[snippet]** = taken from a search-result summary of the cited page, page not opened (treat numbers as approximate, verify before committing money).
> - Several hosts were unreachable from this research session (network allow-list): `remotion.dev`, `creatomate.com`, `hyperframes.heygen.com`, `wireflow.ai`, `arxiv.org`. All pricing for Remotion/Creatomate/Shotstack/JSON2Video is therefore **[snippet]** from third-party blogs, not from official pricing pages.
> - GitHub pages fetched did not expose last-commit dates, so "last activity" is mostly unknown; stars are as displayed on 22 Nov 2026.

## 1. Best beat / downbeat / drop / section detection libraries in 2026

### Takeaway
For a commercial pipeline the cleanest choice is **Beat This! (MIT code + MIT weights, beats + downbeats, no DBN needed)** for the beat grid, plus **librosa** (RMS/onset/spectral features) for a self-written drop detector; **all-in-one** is the only off-the-shelf tool that also gives labelled sections (chorus/verse/break...) but drags in madmom, whose pretrained models are CC BY-NC-SA (non-commercial). There is no standard "drop detector" library: drops are found with an energy-jump heuristic on the beat grid or a small trained classifier.

### Cited Findings
**Beat This! (CPJKU/beat_this)**
- Code and published model weights are MIT; README warns some training data is copyrighted / limited-CC so users must assess their own case. 491 stars, 245 commits, 3 open issues. [primary] — [GitHub CPJKU/beat_this](https://github.com/CPJKU/beat_this)
- Outputs beat and downbeat times (CLI writes `.beats`; Python API returns arrays; `Audio2Frames` gives framewise logits). Install: PyTorch >= 2.0 + `pip install beat-this`; loadable via `torch.hub`. Uses GPU by default, falls back to CPU; `--float16` may speed up recent GPUs; README publishes no speed benchmark. [primary] — [GitHub CPJKU/beat_this](https://github.com/CPJKU/beat_this)
- Model sizes: `final*` about 78 MB, `small*` about 8.1 MB (smaller model row of the paper's Table 2). [primary] — [GitHub CPJKU/beat_this](https://github.com/CPJKU/beat_this)
- DBN post-processing is optional and requires madmom installed from GitHub (PyPI madmom only supports Python < 3.10 / numpy < 1.20). [primary] — [GitHub CPJKU/beat_this](https://github.com/CPJKU/beat_this)
- The paper (ISMIR 2024) claims high accuracy without DBN, but admits failures on difficult/under-represented genres and worse continuity metrics. [snippet] — [arXiv 2407.21658](https://arxiv.org/pdf/2407.21658)
- A third-party GGUF port exists (suggesting a CPU/ggml-style runtime path) and its page repeats that upstream code and weights are MIT and that madmom's DBN is non-commercial. [snippet] — [HF cstr/beat-this-GGUF](https://huggingface.co/cstr/beat-this-GGUF)
- Counter-evidence: a Nov 2026 preprint (GlobalTap, crowdsourced tapping on globally diverse music) reports paired excerpt-level tests favouring madmom over Beat This! on all five metrics tested on that dataset. [snippet; paper not opened] — [arXiv 2611.11137](https://arxiv.org/pdf/2611.11137)

**madmom**
- Source code BSD; **model and data files CC BY-NC-SA 4.0**; README says to contact Gerhard Widmer to include the models (or technology using them) in a commercial product. 1.7k stars, 61 open issues, 22 open PRs; README still states Python 2.7 / 3.5+. [primary] — [GitHub CPJKU/madmom](https://github.com/CPJKU/madmom)

**all-in-one (mir-aidj/all-in-one)**
- MIT; 893 stars, only 38 commits, 16 open issues, 5 open PRs. Outputs BPM, beats, downbeats, beat position in bar (1-4), and functional segments labelled start/end/intro/outro/break/bridge/inst/solo/verse/chorus (Harmonix label set); JSON via CLI. [primary] — [GitHub mir-aidj/all-in-one](https://github.com/mir-aidj/all-in-one)
- Dependencies: PyTorch, NATTEN (manual install on Linux), **madmom from GitHub**, Demucs (it source-separates first), optional FFmpeg. Speed: 10 songs (33 min) in 73 s on an RTX 4090; no CPU figure published. [primary] — [GitHub mir-aidj/all-in-one](https://github.com/mir-aidj/all-in-one)
- Author notes MP3 decoders shift timing by about 20-40 ms and recommends converting to WAV before beat tracking. [primary] — [GitHub mir-aidj/all-in-one](https://github.com/mir-aidj/all-in-one)

**Drop detection**
- `felixmeyer6/drop-detector`: trained model (EDM-specific features + XGBoost) with a CLI; repo reports F1 0.95 vs 0.71 for the 2014 baseline it extends. [snippet] — [GitHub felixmeyer6/drop-detector](https://github.com/felixmeyer6/drop-detector)
- Simple heuristic seen in the wild (HF Space SyncAI): beat-track with madmom, compute librosa RMS at each beat, take the largest beat-to-beat energy increase as the drop. [snippet] — [HF mvp-lab/SyncAI beat_detector.py](https://huggingface.co/spaces/mvp-lab/SyncAI/blob/main/src/beat_detector.py)
- Academic baseline: Yadati et al., ISMIR 2014, two-stage drop detection (candidate segments, then classification). [snippet] — [ISMIR 2014 paper](https://archives.ismir.net/ismir2014/paper/000297.pdf)
- librosa is what the small open-source beat-sync editors actually use (beat timestamps, tempo, energy curve, peaks/valleys). [primary] — [GitHub ZiadAbdelkarim/beat-synced-edit](https://github.com/ZiadAbdelkarim/beat-synced-edit)

### Inferences
- Licence ranking for commercial use: Beat This! (MIT/MIT) and librosa are safe; anything that loads madmom pretrained models (madmom itself, all-in-one, Beat This! with `--dbn`) inherits a non-commercial restriction on the model files. all-in-one's MIT label does not cure this because it installs and uses madmom. Legal confirmation is advisable before using all-in-one in production.
- For 8-30 s clips the audio is short, so CPU inference with the Beat This! `small` model is very likely fast enough on Railway (no GPU); this is not benchmarked in any source I found and should be measured.
- Practical drop detector for TikTok sounds (not only EDM): on the Beat This! grid compute per-beat RMS, low-band (sub 150 Hz) energy and spectral flux with librosa; drop = downbeat with the largest ratio of mean energy in the following 2-4 bars to the preceding 1-2 bars, preferably preceded by a low-bass "build" window. Section boundaries can be approximated without all-in-one via novelty on a self-similarity matrix (librosa segmentation) snapped to downbeats.
- Because trackers disagree by genre (Beat This! paper vs GlobalTap), keep a cheap sanity check: compare Beat This! tempo with librosa tempo and flag octave errors (x2 / x0.5) for review.
- Always decode audio to WAV at a fixed sample rate before analysis and before rendering, to avoid the 20-40 ms MP3 offset (more than one frame at 30 fps).

### Gaps
- No source found with 2026 numbers for BeatNet or essentia (accuracy, maintenance, licence); not covered by the searches run. Note from prior knowledge only (unverified here): essentia is AGPL-licensed, which would be a constraint for a closed SaaS.
- No published CPU speed for Beat This! or all-in-one.
- GlobalTap numbers not read first-hand (arxiv.org blocked).
- Whether all-in-one is still maintained in 2026 (no commit dates visible; 38 commits total suggests low activity).

## 2. Shot/cut detection for the reference video, and capturing speed ramps / zooms / transitions / on-screen text timing

### Takeaway
Use **TransNetV2** (neural, handles gradual transitions) as the main cut detector with **PySceneDetect** as a fast CPU baseline/cross-check; AutoShot was built for short-form video but independent tests put it level with or slightly below TransNetV2. No off-the-shelf tool extracts speed ramps or zooms: that needs optical-flow analysis or a VLM pass; on-screen text timing is done with PaddleOCR on sampled frames.

### Cited Findings
- On the BBC dataset in NVIDIA's Cosmos paper: PySceneDetect F1 0.889, TransNetV2 0.967, AutoShot 0.952; the Cosmos authors found TransNetV2 better on harder shot changes. [snippet] — [arXiv 2501.03575](https://arxiv.org/pdf/2501.03575)
- TransNetV2 predicts a per-frame transition probability from a 100-frame rolling window; PyTorch port (`transnetv2-pytorch` on PyPI) reports F1 77.9 ClipShots / 96.2 BBC / 93.9 RAI. [snippet] — [PyPI transnetv2-pytorch](https://pypi.org/project/transnetv2-pytorch/)
- AutoShot (CVPRW 2023) was designed for short videos; authors claim +4.2% F1 over TransNetV2 on their own SHOT dataset and +1.1/0.9/1.2% on ClipShots/BBC/RAI (authors' own evaluation). [snippet] — [arXiv 2304.06116](https://arxiv.org/pdf/2304.06116)
- PySceneDetect thresholds HSV-histogram change between frames, runs CPU-only and is faster than TransNetV2; one study gave it 65.5% shot-segmentation accuracy vs 87.0% for TransNetV2. [snippet] — [arXiv 2508.11484 (CineTrans)](https://arxiv.org/pdf/2508.11484)
- OmniShotCut (preprint, April 2026) reframes shot-boundary detection around transition relationships and claims SOTA on its own benchmark; not independently verified. [snippet] — [arXiv 2604.24762](https://arxiv.org/pdf/2604.24762)
- OCR: a project README comparison rates PaddleOCR (PP-OCRv5) "excellent / fast" and EasyOCR "good / medium", both 80+ languages (README claim, not an independent benchmark). [snippet] — [GitHub Agions/HardSubX](https://github.com/Agions/HardSubX)
- Existing hard-subtitle extractors use a two-step pattern: first locate frames where text appears/changes (VideoSubFinder), then OCR those frames with PaddleOCR; timestamps come from the detection step. Linux-capable projects: VideOCR, videocr-PaddleOCR. [snippet] — [GitHub timminator/VideOCR](https://github.com/timminator/VideOCR); [pyVideoTrans docs](https://en.pyvideotrans.com/ocrsp)
- The 2021 Adobe-style paper "Automatic Non-Linear Video Editing Transfer" extracts per-shot framing, playback speed and lighting from a source video to transfer editing choices to new footage (proves the per-shot attribute approach; no code found). [snippet] — [arXiv 2105.06988](https://arxiv.org/pdf/2105.06988)

### Inferences
- TikTok edits are dominated by hard cuts with flashes/whip transitions and constant overlaid text, which produce false positives in histogram methods; the neural detectors are the safer default. Run TransNetV2 on CPU (reference clips are under 60 s, so it is cheap) and treat detections with flash frames within 2-3 frames as a single "flash cut" transition type.
- Speed ramps / zooms (my proposed method, no ready-made tool found): per shot, compute dense optical-flow magnitude over time (OpenCV Farneback or RAFT). A ramp shows as a smooth multi-x change in flow magnitude within a single shot; a punch-in zoom shows as a radially divergent flow field or a step change in the scale of a fitted similarity transform between consecutive frames. Classify each shot as constant / ramp-in / ramp-out / zoom-punch and store the time of peak change.
- A VLM pass (frames sampled at 4-10 fps, or native video input) is the pragmatic way to label what classical CV cannot: transition type, overlay style (font weight, colour, position, animation), hook vs body, and shot content type. Use it for labels, never for timestamps; timestamps should come from TransNetV2 / OCR diffing, which are frame-accurate.
- Text-overlay timing: sample at 10 fps, run PaddleOCR, cluster boxes by position and string similarity, and emit (text, bbox, t_in, t_out); snap t_in/t_out to the nearest cut or beat when within about 80 ms.

### Gaps
- No independent 2026 benchmark of TransNetV2 vs AutoShot vs OmniShotCut on vertical TikTok-style content.
- No source found for an existing library that detects speed ramps or zoom keyframes from finished video.
- No OCR timing-accuracy comparison (PaddleOCR vs EasyOCR vs VLM) found; needs an in-house test on real reference videos.
- AutoShot and TransNetV2 licences and maintenance status were not verified first-hand.

## 3. Existing open-source "edit to the beat" / "copy the edit of a reference video" projects

### Takeaway
There is **no mature open-source project that does full reference-edit transfer** (shot structure + ramps + text timing) end to end; what exists are small librosa + PySceneDetect + FFmpeg "cut on beat" tools and ComfyUI beat nodes. The rhythm-transfer logic has to be built in-house, but it is a thin layer over the analysis libraries above.

### Cited Findings
- `ZiadAbdelkarim/beat-synced-edit`: MIT, 15 stars, 30 commits. Pipeline: `beat_map.py` (librosa beats, tempo, energy curve, peaks/valleys) -> `clip_tag.py` (PySceneDetect + motion/energy/brightness scoring per clip) -> `plan_edit.py` (high-energy clips on energy peaks, calm clips on valleys, anti-repetition, black-frame filtering, `--beat-stride N`) -> `render_edit.py` (FFmpeg). Emits JSON beat map, clip tags and an EDL; supports 9:16; ships a Claude Code skill. Reference-video support is limited to matching a colour grade, not the cut pattern. No explicit drop detection in the code. [primary] — [GitHub ZiadAbdelkarim/beat-synced-edit](https://github.com/ZiadAbdelkarim/beat-synced-edit)
- `LanaaAyeraa/AutoEdit-Video`: accepts CapCut template / TikTok / Reels links, downloads the audio with yt-dlp, runs librosa beat detection and cuts user footage on beats with FFmpeg theme presets. 0 stars, 1 commit, no licence stated; it copies the template's **audio rhythm only**, not its shot structure. [primary] — [GitHub LanaaAyeraa/AutoEdit-Video](https://github.com/LanaaAyeraa/AutoEdit-Video)
- Other beat-sync repos surfaced (not opened): `Merserk/BeatSync-Engine` (AGPL-3.0, AMV/GMV), `ActArtech/CtrlBeat` (AGPL, Windows desktop), `moritzef/AutoCutter` (Java, older), `mfahsold/montage-ai` (local-first, beat-synced cuts), `floomhq/opencut` (MIT, Remotion/TypeScript engine with music-sync helpers). [snippet] — [GitHub topic beat-sync](https://github.com/topics/beat-sync); [GitHub floomhq/opencut](https://github.com/floomhq/opencut)
- ComfyUI nodes that cut or retime to beats: Radiance "Audio Cut" (about 246 stars), Fill-Nodes "FL Audio Music Video Sequencer" / "FL Audio Reactive Speed", S42 CutFlow "Beat Snap" and "Funky Beat Sync" (time-warps video to audio), MKR "Beat Sync Retimer", ComfyTV "Audio Beats & Notes", Yvann-Nodes (about 701 stars, audio-reactive generation rather than cutting). Listings come from a third-party node index. [snippet] — [comfy.icu S42 Beat Snap](https://comfy.icu/node/S42CF_BeatSnap); [comfy.icu FL Sequencer](https://comfy.icu/node/FL_Audio_Music_Video_Sequencer); [comfy.icu MKR Beat Sync Retimer](https://comfy.icu/node/MKRBeatSyncRetimer)
- Research: "Automatic Non-Linear Video Editing Transfer" (2021) is the closest paper to reference-edit transfer; a 2026 paper (RefVFX, "Tuning-free Visual Effect Transfer across Videos") transfers visual effects from a reference video with a generative model, not cut timing. The search found no 2025-2026 paper with code for cut-timing/rhythm template transfer. [snippet] — [arXiv 2105.06988](https://arxiv.org/pdf/2105.06988); [arXiv 2601.07833](https://arxiv.org/html/2601.07833)

### Inferences
- `beat-synced-edit` is worth reading as a reference implementation (JSON beat map -> clip tags -> EDL -> FFmpeg is exactly the right architecture and it is MIT), but it is a 15-star hobby project: reuse ideas, do not depend on it.
- AGPL projects (BeatSync-Engine, CtrlBeat) should not be embedded in a closed product.
- ComfyUI beat nodes are useful only if clip generation already runs in ComfyUI; they do not help with reference-pattern extraction or captions.
- The absence of an open "template transfer" tool is consistent with CapCut templates being the commercial answer to this problem; the differentiator of an in-house system is extracting the template from any viral video rather than from CapCut's catalogue.

### Gaps
- Stars/last-commit for BeatSync-Engine, montage-ai, opencut, CtrlBeat not verified first-hand.
- No hands-on Reddit/HN reports from 2025-2026 on these specific tools were found.

## 4. Programmatic renderers for the final cut (quality, speed, cost at volume, text styling, licence)

### Takeaway
At dozens of videos/day, per-video cost is small with any option; the decision is about **control of timing and text styling**. Self-hosted FFmpeg (cuts, speed ramps, audio) plus an HTML/React-based renderer for animated captions gives frame-exact timing; **Remotion** is the most mature but is source-available and needs a paid Company Licence above 3 people (reported minimum about $100/month for automated rendering); **HyperFrames (Apache-2.0)** and **Revideo (MIT)** are the permissive alternatives. Creatomate (already in use) is the most expensive per minute of the hosted APIs.

### Cited Findings
- Remotion: source-available "Remotion License", free for individuals and organisations up to 3 people including commercial use; 4+ people need a Company Licence: reported $25/month per creator seat, automated rendering $0.01 per render with a $100/month minimum, Enterprise from $500/month; infrastructure (e.g. AWS Lambda) is billed separately. Third-party sources disagree on details of the minimums. Very active (4.0.543 cited as latest on 14 Nov 2026). [snippet; official page unreachable] — [snapcn: Remotion license pricing](https://snapcn.dev/remotion-license-pricing); [toolradar: Remotion pricing](https://toolradar.com/tools/remotion/pricing); [img.ly: Remotion alternatives](https://img.ly/blog/remotion-alternatives/)
- Revideo: MIT, free; one comparison lists 0.11.0 on npm dated 10 Jul 2026 with no GitHub releases (slower cadence). [snippet] — [snapcn: Remotion alternatives](https://snapcn.dev/remotion-alternatives)
- HyperFrames (HeyGen): Apache-2.0 HTML-based code-to-video framework, public since March or April 2026 (sources disagree), releasing very frequently (0.9.43 cited mid-Nov 2026). One vendor ranking inconsistently lists it as MIT. [snippet] — [remocn: HyperFrames alternatives](https://remocn.dev/docs/guides/hyperframes-alternatives); [orkas: HyperFrames vs Remotion](https://orkas.ai/blog/hyperframes-vs-remotion/)
- Hosted API pricing at 1080p (third-party compilations): Shotstack about $0.195/min on the $39 subscription (200 min) and $0.30/min prepaid; one comparison puts Shotstack monthly plans at $0.05-0.16/min vs $0.23-1.01/min for Creatomate; JSON2Video about $0.25/min ($49.95/mo, 200 min) or $0.20/min ($99.95/mo, 500 min); Creatomate Essential estimated about $0.84-0.86/min. [snippet] — [zvid.io pricing benchmark](https://zvid.io/benchmarks/pricing); [orshot: Shotstack alternative](https://orshot.com/blog/shotstack-api-alternative); [motionbox: JSON2Video alternatives](https://motionbox.io/blog/best-json2video-alternatives-in-2026)
- MoviePy: latest confirmed version 2.2.1 (21 May 2025); v2 introduced breaking changes vs 1.x; a third-party tracker lists 3 maintainers and a "healthy" cadence, but no 2026 release was confirmed. [snippet] — [PyPI moviepy](https://pypi.org/project/moviepy); [GitHub Zulko/moviepy](https://github.com/Zulko/moviepy)
- The MIT `opencut` engine (floomhq) shows the pattern of Whisper subtitles + React components + Remotion rendering with helpers that lock transitions to tempo. [snippet] — [GitHub floomhq/opencut](https://github.com/floomhq/opencut)
- `video-use` renders with FFmpeg and delegates animated overlays to HyperFrames, Remotion, Manim or PIL, and burns 2-word uppercase caption chunks by default: evidence that "FFmpeg for cuts + HTML/React layer for text" is the common 2026 architecture. [primary] — [GitHub browser-use/video-use](https://github.com/browser-use/video-use)

### Inferences
- Rough cost for 30 videos/day x 20 s = about 300 min/month: Shotstack about $60, JSON2Video about $60-75, Creatomate about $250 (using the per-minute estimates above; derived, not quoted). Self-hosted FFmpeg + HyperFrames/Revideo costs only Railway CPU time. Remotion would be free if the company is 3 people or fewer, otherwise about $100/month minimum plus compute.
- Rhythm precision argument: hosted JSON APIs accept times in seconds and re-encode on their side, which is fine, but speed ramps (variable-speed curves), flash frames and per-word caption animation are easier and more deterministic in FFmpeg (`setpts` piecewise / `minterpolate`, `xfade`) plus a browser-based caption layer. This directly targets the owner's "rhythm is the weakest point" complaint, which with Creatomate + manual CapCut is plausibly a problem of cuts being placed by template durations instead of a beat grid, not of renderer quality.
- TikTok-style captions (word-by-word highlight, stroke, custom fonts, emoji) are trivial in HTML/CSS renderers (Remotion, HyperFrames, Revideo) and painful in pure FFmpeg `drawtext`/ASS. A lightweight middle path is ASS subtitles with karaoke tags burned by FFmpeg (libass), which needs no browser.
- Chromium-based renderers need more RAM/CPU on Railway than FFmpeg; render the caption layer as a transparent overlay (ProRes 4444 / WebM alpha / PNG sequence) only for the text and composite with FFmpeg to keep render time low.
- Frame-snap everything: at 30 fps a frame is 33 ms; cut times must be rounded to frame boundaries after beat alignment, and all clips normalised to constant frame rate before assembly, or cuts drift off-beat.

### Gaps
- Official current pricing for Remotion, Creatomate, Shotstack, JSON2Video not verified (hosts blocked); all figures come from third-party/affiliate blogs that conflict in places.
- No findings on editly (maintenance status), MLT/melt headless rendering, or Motion Canvas in 2026; the search returned nothing. From prior knowledge only (unverified): editly has had little maintenance for years and should be assumed stale until checked.
- No measured render-time benchmarks (seconds per 20 s 1080x1920 video) for any renderer.
- Whether Remotion's licence counts contractors/agents toward the 3-person threshold was not verified.

## 5. CapCut automation / reverse engineering (draft generation)

### Takeaway
Generating CapCut/JianYing drafts programmatically works in 2026 (CapCut International drafts are still plain JSON; only JianYing 6.0+ encrypts), but **none of the open tools can render on a Linux server**: the draft must be opened and exported in the desktop app (Windows/macOS), the open-source export automation is Windows-only UI automation that stops at JianYing 6.8, and CapCut's terms reportedly prohibit reverse engineering and automated interaction. It is suitable as an optional "hand-off to a human editor in CapCut" output, not as the production renderer.

### Cited Findings
- JianYing (Chinese build) 6.0+ stores `draft_content.json` as an AES-encrypted payload; 5.9.x is the last plaintext line; **CapCut International is not encrypted** (CapCut 6.x-9.x use plain JSON). Evidence labelled "as of 2026-09". [primary] — [capcut-cli docs: jianying-encryption](https://github.com/renezander030/capcut-cli/blob/master/docs/jianying-encryption.md); [gist: draft schema cheat sheet](https://gist.github.com/renezander030/80823f1d47081c312d2c1f9edd20dc22)
- Encryption blocks reading app-created drafts, not writing new ones: JianYing 11.4 (macOS) opens a plaintext `draft_info.json` and upgrades it in place to the encrypted format; once re-saved "there is no way back", so the pattern is "generate, don't roundtrip". [primary] — [capcut-cli docs: jianying-encryption](https://github.com/renezander030/capcut-cli/blob/master/docs/jianying-encryption.md); [gist: draft schema cheat sheet](https://gist.github.com/renezander030/80823f1d47081c312d2c1f9edd20dc22)
- Schema facts: all times in microseconds; per-segment `speed` plus `materials.speeds[]`; text in `materials.texts[]` with a JSON-encoded `content` string whose style ranges are UTF-16LE byte offsets (hand-editing is the main cause of "text disappeared" bugs); `platform.app_source` is `cc` (CapCut) vs `lv` (JianYing) with different effect/transition slug namespaces; `masks` (CapCut <= 9.5) vs `common_masks` (>= 9.6); cover validation stricter in 10.x+; a "content corrupted" bug cited for 10.3 macOS. [primary] — [gist: draft schema cheat sheet](https://gist.github.com/renezander030/80823f1d47081c312d2c1f9edd20dc22)
- Some CapCut builds (8.4, 8.7 on Windows, 9.3) are reported to reject drafts built from old templates. [snippet] — [Voyager: CapCut MCP](https://voyager.so/blog/capcut-mcp)
- `pyJianYingDraft`: Apache-2.0, 5.0k stars, 740 forks, 43 open issues. Targets JianYing 5.9 and 10.8; **no CapCut support in this repo** (a separate `pyCapCut` is "in development"). Linux/macOS can generate drafts only; **automated export is Windows-only**, via `uiautomation` (takes over window and cursor), tested on JianYing 5.9 and 6.8 and **not working on 7+**. Supports trimming, constant speed, keyframes, masks, transitions, effects, filters, text styling/animations, SRT import, template material replacement. **Curve speed (speed ramps) is not supported.** [primary] — [GitHub GuanYixuan/pyJianYingDraft](https://github.com/GuanYixuan/pyJianYingDraft)
- `VectCutAPI` (sun-guannan; formerly/also known as CapCutAPI, star history points to `sun-guannan/CapCutAPI`): Apache-2.0, about 2.4k stars, 503 forks. HTTP server (port 9001) + MCP server that writes drafts for "Jianying or CapCut International" (profiles `capcut_legacy`, `jianying_legacy`, `jianying_pro_10`); output is a `dfd_` folder to copy into the app's drafts directory. Cloud rendering, the editing agent and the web client are advertised but **not open source** (hosted at vectcut.com). [primary] — [GitHub sun-guannan/VectCutAPI](https://github.com/sun-guannan/VectCutAPI)
- `capcut-cli` (renezander030): CLI that writes/lints drafts, imports SRT/ASS captions, detects (but does not decrypt) encrypted drafts; states it is independent of ByteDance. A community approach that calls the app's own Windows DLL to decrypt is described by the author as legally "murky". [primary] — [capcut-cli docs](https://github.com/renezander030/capcut-cli/blob/master/docs/jianying-encryption.md); [gist: draft schema cheat sheet](https://gist.github.com/renezander030/80823f1d47081c312d2c1f9edd20dc22)
- CapCut has no public editing API in 2026, and its terms are reported to prohibit reverse engineering and automated interaction with the services. [snippet; ToS not read first-hand] — [samautomation: CapCut API 2026](https://samautomation.work/capcut-api/); [Voyager: CapCut and AI](https://voyager.so/resources/apps/capcut)

### Inferences
- For a Railway pipeline the realistic uses are: (a) emit a CapCut International draft alongside the rendered MP4 so the owner can open the auto-edit in CapCut and polish instead of starting from scratch (replaces today's fully manual CapCut step); (b) nothing more. Headless rendering through CapCut would require a Windows VM running the GUI app under UI automation: fragile, version-pinned, and against the reported ToS.
- Draft format breaks with app updates (mask key rename at 9.6, stricter covers in 10.x, rejection of old-template drafts in 8.4/8.7/9.3), so any draft generator needs a pinned CapCut desktop version with auto-update disabled and a regression fixture per version.
- CapCut's proprietary effects, fonts and transitions referenced by slug only resolve inside the app (and may need downloads or Pro), so a draft is not a portable description of the final look.
- pyJianYingDraft lacking curve speed means ramps would have to be written into the draft JSON by hand (`materials.speeds[]` curve fields, undocumented in the sources read) or pre-baked into the clip with FFmpeg before placing it at speed 1.0. Pre-baking is the safer option.
- VectCut's hosted cloud render is a closed third-party service built on reverse-engineered formats: vendor and ToS risk; not recommended as a core dependency.

### Gaps
- Could not confirm first-hand which exact CapCut International desktop versions (late 2026) open generated drafts cleanly; the encryption doc names no CapCut International version.
- Status and maturity of `pyCapCut` not checked.
- CapCut ToS text not read directly; account-ban risk for draft injection is undocumented (drafts are local files, so enforcement risk seems low, but this is unverified).
- VectCut cloud pricing/reliability unknown.

## 6. LLM/VLM "video editing agents" usable via API

### Takeaway
The 2026 agentic editors (video-use, OpenFilm, HyperFrames, VEED OpenEdit) are **coding-agent skills oriented to talking-head/transcript editing**, not music-driven montage: none of those reviewed does beat sync or reference-rhythm transfer. The useful idea to borrow is their architecture: the LLM never touches pixels, it reads compact text/JSON descriptions and writes an EDL that deterministic code renders.

### Cited Findings
- `browser-use/video-use`: MIT, 31.4k stars, 23 commits. A skill for shell-capable coding agents. The LLM reads an ElevenLabs Scribe word-level transcript packed into about 12 KB plus on-demand filmstrip/waveform composites; pipeline transcribe -> pack -> LLM reasoning -> EDL -> FFmpeg render -> self-evaluation at each cut boundary (max 3 retries). Requires an ElevenLabs API key; install docs are Homebrew/macOS-oriented, Linux not mentioned; hosted version only on a waitlist; **no music/beat sync**. [primary] — [GitHub browser-use/video-use](https://github.com/browser-use/video-use)
- OpenFilm: open-source "AI video agent" that turns Claude Code/Codex into a video agent; needs Node 22.2+ and FFmpeg. [snippet] — [GitHub openfilm/openfilm](https://github.com/openfilm/openfilm)
- VEED OpenEdit: free open-source agent-native editor, local rendering; generation features call VEED's hosted API. [snippet] — [VEED OpenEdit](https://www.veed.io/tools/openedit)
- HyperFrames positions itself as agent-first (agent writes HTML compositions and renders); the "12 best open-source AI video editors" ranking that promotes it is a HeyGen vendor blog. [snippet] — [HyperFrames blog](https://hyperframes.heygen.com/blog/best-open-source-ai-video-editors)
- `beat-synced-edit` ships a Claude Code skill on top of a deterministic CLI (natural-language requests such as flashes on drops are translated to CLI/EDL operations). [primary] — [GitHub ZiadAbdelkarim/beat-synced-edit](https://github.com/ZiadAbdelkarim/beat-synced-edit)
- `MartinDelophy/ai-video-editor`: local-first editor where creators and AI agents edit the same timeline. [snippet] — [GitHub MartinDelophy/ai-video-editor](https://github.com/MartinDelophy/ai-video-editor)

### Inferences
- For this use case an "agent" is not needed in the render loop. The valuable LLM/VLM roles are bounded and offline: (1) label the reference video (hook/body boundary, transition types, text style, shot content categories); (2) match user clips to reference slots semantically (product close-up vs lifestyle vs result); (3) write overlay copy. Timing must stay deterministic.
- Adopting the EDL-as-contract pattern (JSON edit decision list validated by schema, rendered by code, checked by an automatic QA step) gives the benefits of agentic editors without their dependencies (ElevenLabs key, interactive coding agent).
- A self-evaluation step is cheap and worth copying: after render, re-run cut detection and beat tracking on the output and assert that each cut is within one frame of its target beat.

### Gaps
- Descript, OpusClip and similar commercial "AI editor" APIs were not researched in depth (no reliable source reviewed on whether they expose montage/beat-sync endpoints); an OpusClip blog listing "best video editing APIs" exists but is a vendor source and was not opened: [OpusClip blog](https://www.opus.pro/blog/best-video-editing-apis-for-developers).
- No evidence found of any hosted API offering "copy this reference video's edit" as a product feature.
- Star counts/licences for OpenFilm, OpenEdit, HyperFrames not verified first-hand.

## 7. Concrete recommended stack and algorithm sketch for reference-rhythm transfer

### Takeaway
Recommended stack: **Beat This! + librosa** (music), **TransNetV2 + PySceneDetect + PaddleOCR + optical flow + one VLM labelling pass** (reference), a **JSON "rhythm template" and EDL** as the contract, **FFmpeg** for cuts/ramps/audio and an **HTML-based caption layer (HyperFrames or Revideo; Remotion if licence allows)** or libass for text, with an optional **CapCut International draft export** for manual polish. The core trick is to express the reference edit in **beats relative to its own music and drop**, then re-time it onto the new song's beat grid.

### Cited Findings
- Component facts supporting the stack are cited in sections 1-6: Beat This! MIT code/weights with beats + downbeats ([GitHub](https://github.com/CPJKU/beat_this)); madmom models non-commercial ([GitHub](https://github.com/CPJKU/madmom)); all-in-one sections but madmom/NATTEN/Demucs dependencies ([GitHub](https://github.com/mir-aidj/all-in-one)); TransNetV2 F1 0.967 vs PySceneDetect 0.889 on BBC ([arXiv 2501.03575](https://arxiv.org/pdf/2501.03575)); EDL-based architecture in existing tools ([beat-synced-edit](https://github.com/ZiadAbdelkarim/beat-synced-edit), [video-use](https://github.com/browser-use/video-use)); CapCut International drafts unencrypted but app needed for export ([capcut-cli docs](https://github.com/renezander030/capcut-cli/blob/master/docs/jianying-encryption.md), [pyJianYingDraft](https://github.com/GuanYixuan/pyJianYingDraft)).
- MP3 decoding can shift timing by 20-40 ms, so analysis and render must use the same WAV decode. — [GitHub mir-aidj/all-in-one](https://github.com/mir-aidj/all-in-one)
- Existing open tools place high-energy clips on energy peaks and calm clips on valleys and expose a "beat stride" (every Nth beat) control. — [GitHub ZiadAbdelkarim/beat-synced-edit](https://github.com/ZiadAbdelkarim/beat-synced-edit)

### Inferences
Everything below is my proposed design (not taken from a source).

**A. Reference analysis -> `rhythm_template.json` (run once per viral reference, cache it)**
1. Download reference; extract audio to WAV 44.1 kHz; normalise video to constant 30 fps.
2. Music: Beat This! -> beats, downbeats; tempo = median inter-beat interval; librosa -> per-beat RMS, low-band energy, onset strength; drop = downbeat maximising post/pre energy ratio (section 1).
3. Cuts: TransNetV2 probabilities -> cut frames; merge detections closer than 3 frames; cross-check with PySceneDetect; flag flash/white frames and dissolves as transition types.
4. Per shot: duration, optical-flow profile -> speed class (constant / ramp-in / ramp-out) and zoom class (none / punch-in / slow push) with time of peak; mean motion energy.
5. Text: PaddleOCR at 10 fps -> overlay events (text, bbox, t_in, t_out).
6. VLM pass on one keyframe per shot + overlay crops -> labels: hook vs body, shot content category, transition look, caption style (font weight, case, colour, stroke, position, animation).
7. **Convert every timestamp to musical coordinates**: for each event store `beat_index` (float, relative to the drop: negative before, positive after), `snapped` (bool: within 60 ms of a beat or half-beat), and `subdivision` (1, 1/2, 1/4). Store shot durations in beats. Also store the fraction of cuts that land on beats (the reference's "tightness") and the cut-density curve (cuts per bar, before vs after the drop).

**B. Song analysis -> `song_map.json`**
1. Same music pipeline on the target track (WAV decode, Beat This!, librosa features, drop, coarse sections).
2. Choose the song window (8-30 s): place the song's drop at the same beat offset from the start as in the template (e.g. template drop at beat 8 -> start the window 8 beats before the song's drop, snapped to a downbeat). If the song has no clear drop, align the template's drop to the strongest downbeat energy jump.

**C. Re-timing (template beats -> new song seconds)**
1. Map each template event at `beat_index b` to time `t = song_beat_time(drop_index + b)`, interpolating between beats for subdivisions. This automatically stretches or compresses the edit to the new tempo while keeping every cut on the grid.
2. Tempo-ratio guard: if `bpm_song / bpm_ref` is outside about 0.75-1.33, shots become too short or long; switch the beat stride (map 1 template beat to 2 song beats or the reverse) so resulting shot lengths stay within the reference's min/max in seconds (and never below about 0.25 s / 8 frames).
3. Round all cut times to frame boundaries; enforce total duration; keep hook length in seconds within the reference's hook length +-20% (hook retention matters more than bar symmetry).
4. Anticipation offset: allow a global setting to place cuts 0-1 frames before the beat (editors commonly cut slightly early); make it a tunable parameter and A/B test.

**D. Clip assignment**
1. Tag user AI clips: duration, motion energy, best sub-window (highest saliency/motion peak), VLM category.
2. Assign clips to slots by cost = category mismatch + |motion energy - slot energy| + repetition penalty; solve with Hungarian assignment or greedy with backtracking; high-motion clips on post-drop slots.
3. Within a slot, choose the source in-point so the clip's motion peak lands on the slot's strongest beat; if the template shot is a ramp, apply a piecewise `setpts` speed curve so the fast-to-slow transition point lands on the beat.
4. If the clip is shorter than the slot, slow it (no less than 0.5x with frame interpolation) or split the slot on a half-beat.

**E. EDL -> render**
1. Emit `edl.json` (tracks: video segments with src in/out, speed curve, zoom keyframes, transition; audio; text events with style id and beat-aligned in/out).
2. FFmpeg: trim + speed + scale/crop to 1080x1920 + transitions (`xfade`/flash frames) + music mux, CRF about 16-18, high profile, 30 fps, AAC 192k+.
3. Captions: render overlay layer with HyperFrames/Revideo (or libass karaoke for a browser-free path) from the template's style and timing; composite with FFmpeg.
4. QA gate: re-run TransNetV2 + Beat This! on the output; fail if more than a set share of cuts deviate from the target beat by more than 1 frame, or if the on-beat ratio is below the reference's.
5. Optional: export the same EDL as a CapCut International draft (capcut-cli / pyJianYingDraft-style writer, ramps pre-baked) for manual polish on the owner's desktop.

**Why this should fix the "rhythm" weakness**: today's flow (FFmpeg + Creatomate templates + manual CapCut) presumably fixes shot durations in seconds per template; the proposal makes the beat grid the time base, so the same template adapts to any tempo and the drop always lands where the reference's did.

**Suggested build order**: (1) song map + beat-snapped cuts with FFmpeg only (largest visible gain, days of work); (2) reference template extraction (cuts + beats-relative timing); (3) drop alignment + ramps; (4) OCR/VLM text-style transfer and caption layer; (5) CapCut draft export.

### Gaps
- The algorithm is a design proposal; none of the thresholds (60 ms snap window, tempo-ratio bounds, anticipation offset) come from a source and all need tuning on real reference videos.
- No benchmark exists for total CPU time per video on Railway for this stack; TransNetV2 + Beat This! + PaddleOCR on CPU for a 20 s clip should be measured (GPU likely unnecessary but unverified).
- Music licensing for the songs (commercial use of trending sounds in product ads) is outside this scope and not researched; note also that TikTok replaces/re-syncs audio when a native sound is attached at upload, which can shift alignment by a few frames. This is a known practical concern I could not source.
- Legal review still needed for: madmom-dependent models (non-commercial), Remotion licence threshold, CapCut ToS.
