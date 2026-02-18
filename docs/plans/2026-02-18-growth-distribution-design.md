# Growth & Distribution Design — Reeldocs

**Date:** 2026-02-18
**Status:** Approved

## Context

Reeldocs (currently "Recap" at `respeak-io/recap`) is an open-source video-to-documentation platform. Upload a product video, get polished documentation. The repo is public with <10 stars.

### Competitive Landscape

**Documentation frameworks (Mintlify alternatives):**

| Project | Stars |
|---------|-------|
| Docusaurus | 63.8k |
| MkDocs Material | 26k |
| VitePress | 17.1k |
| Scalar | 13.9k |
| Nextra | 13.6k |
| Fumadocs | 10.8k |
| Starlight | 7.9k |

**Video-to-docs space (direct competition):**

The space is massively underserved in open source. The closest competitors have single-digit to low-hundreds of stars (AI-DocGen ~20, yt2doc ~385, video2docs ~8). Commercial tools (Scribe, Tango, Guidde) dominate. There is no established open-source tool that does what Reeldocs does.

### Growth Preferences

- Code-driven growth preferred over content marketing
- Broad target audience (DevRel, SaaS teams, OSS maintainers)
- No live demo yet (planned)

## Strategy: "The Magnet" + "The Ecosystem Play"

Two complementary strategies executed in phases:

1. **The Magnet** — Make it trivially easy to experience the magic (CLI, gallery, one-command demo), then launch hard once
2. **The Ecosystem Play** — Integrate with every major docs framework so Reeldocs shows up where docs users already are

---

## Naming

Rename from "Recap" to **"Reeldocs"**.

- "Recap" is a common English word — searching "recap github" returns meeting tools, sports recaps, podcast summarizers
- "Reeldocs" is unique, memorable, and category-descriptive ("reel" = video, "docs" = documentation)
- "reeldocs github" will return exactly one result
- Do this rename before any major launch push

---

## Phase 1: The Zero-to-100 Sprint (0 → 100 stars)

**Goal:** Make it trivially easy to experience the magic, then launch once.

### 1a. The CLI

Build a standalone CLI that lets anyone generate docs from a video URL with zero infrastructure:

```bash
npx reeldocs https://www.youtube.com/watch?v=xyz
```

What it does:
1. Downloads/processes the video
2. Sends it through the Gemini pipeline
3. Outputs a folder of Markdown files (or MDX, configurable)
4. Optionally opens a local preview

**Why:** The full app requires Supabase setup, env vars, migrations — a 30-minute commitment before anyone sees the value. The CLI gives them the "wow" moment in 60 seconds. User provides their own Gemini key (free tier exists), so no hosted infra needed.

### 1b. The Gallery

Create 5-10 example outputs from well-known product videos:
- A Notion feature walkthrough → generated docs
- A Linear demo → generated docs
- A Vercel deployment tutorial → generated docs

Host as static pages on the docs site. This is the "proof wall" — when someone lands on the repo, they click one link and see exactly what the tool produces. No setup, no imagination required.

### 1c. Repo Polish (pre-launch)

Before any launch, the repo needs to pass the "30-second scan" test:
- Rename org + repo to `reeldocs`
- Hero GIF/video at the top of README showing input video → output docs
- Badges (license, stars, build status)
- "Try it now" section with the `npx` command front and center
- Comparison table: Reeldocs vs Scribe vs Tango vs manual docs

### 1d. The Launch

Once CLI + gallery + repo polish are done, do a single coordinated push:

1. **Show HN** — "Show HN: Reeldocs — Generate documentation from product videos with AI" (a good Show HN post gets 100-300 stars in a day)
2. **Reddit** — r/programming, r/webdev, r/SideProject with a GIF/video showing the CLI in action
3. **Twitter/X thread** — "I built an open source tool that turns product videos into documentation. Here's what it generated from a 3-min Notion walkthrough:" + gallery screenshots
4. **Awesome-list PRs** — submit to awesome-selfhosted, awesome-ai-tools, awesome-developer-tools, awesome-open-source

---

## Phase 2: The Ecosystem Hooks (100 → 1,000 stars)

**Goal:** Show up where docs tool users already hang out — inside their existing workflows.

### 2a. Output Adapters

Build first-class output format support for the top docs frameworks:

| Framework | Output Format | Community Size |
|-----------|--------------|----------------|
| Docusaurus | MDX with frontmatter + sidebar config | 64k stars |
| MkDocs Material | Markdown with `mkdocs.yml` nav entries | 26k stars |
| VitePress | Markdown with VitePress frontmatter | 17k stars |
| Mintlify | MDX with `mint.json` nav entries | Tons of paying customers searching for cheaper alternatives |

The CLI becomes:

```bash
npx reeldocs https://youtube.com/... --format docusaurus
npx reeldocs https://youtube.com/... --format mkdocs
```

Each adapter is a cross-promotion opportunity:
- Open PRs to each framework's ecosystem/plugins page linking to Reeldocs
- Post in their Discord/GitHub Discussions: "I built a tool that generates [framework] docs from product videos"

### 2b. GitHub Action

```yaml
- uses: reeldocs/generate@v1
  with:
    video-url: ${{ inputs.video_url }}
    format: docusaurus
    output-dir: docs/
```

Lets teams add video-to-docs to their CI pipeline. GitHub Actions marketplace is a discovery channel — people browse it looking for docs tooling.

### 2c. Watch Mode / Screen Recording Integration

```bash
npx reeldocs watch ~/Desktop/Recordings --format mkdocs --output ./docs
```

Record a video → docs appear automatically. Supports Loom, Screen Studio, OBS, or any local recording tool.

### 2d. Community Seeding

- **Framework Discords** — share adapters in Docusaurus, MkDocs, VitePress communities
- **Dev.to / Hashnode** — write "How I generate my Docusaurus docs from product videos" (code-heavy tutorial)
- **Free doc generation for OSS projects** — find projects that have community YouTube tutorials but weak docs. Generate docs from their community tutorials and open PRs. If even 2-3 merge, that's permanent backlinks and proof.

---

## Phase 3: The Long Game (1,000 → 10k+ stars)

**Goal:** Become the default answer to "how do I generate docs from video content." Expand what Reeldocs can ingest.

### 3a. YouTube Playlist → Full Docs Site

The killer feature nobody else has:

```bash
npx reeldocs playlist https://youtube.com/playlist?list=PLxyz --format docusaurus
```

Point it at a YouTube playlist and get an entire structured docs site:
1. Processes each video in the playlist
2. Detects topic overlap and deduplicates
3. Generates a navigation structure / sidebar
4. Outputs a complete, deployable docs site

**Why this is huge:** Thousands of OSS projects have 20+ community tutorials on YouTube but mediocre docs. Reeldocs harvests existing community knowledge and structures it. A maintainer can turn 50 community videos into a searchable docs site in one command.

### 3b. Expand Input Sources

| Source | Value |
|--------|-------|
| Loom links | Huge in SaaS — every product team has dozens of Loom walkthroughs |
| Conference talks | YouTube playlists from React Conf, PyCon, KubeCon → structured notes/docs |
| Twitch VODs / livestreams | Long, unstructured developer streams → extracted useful parts |
| Screen recording folders | Watch a local folder, auto-process new recordings |

Each new input source taps a different community and creates a new distribution channel.

### 3c. "Reeldocs for X" Templates

Opinionated starter templates for specific use cases:

- **`reeldocs init changelog`** — Visual changelog from demo videos of each release
- **`reeldocs init onboarding`** — Employee/user onboarding docs from walkthrough recordings
- **`reeldocs init api-docs`** — API tutorial docs from screencast demos

Each template is a landing page, a blog post, a reason for a different audience to discover the tool.

### 3d. Become the "Awesome Video-to-Docs" Hub

The space has no center of gravity. Create it:

- Maintain an `awesome-video-to-docs` list (repo or site page) covering every tool in this space — commercial and open source
- Be generous: list Scribe, Tango, Guidde alongside Reeldocs with honest comparisons
- Captures SEO for every "[tool] alternative" search
- The project that defines the category wins the category

### 3e. Sustaining Growth Flywheel

```
More users → more framework adapters contributed by community
→ more ecosystems reached → more users
→ more example galleries → more social proof → more stars
```

Sustaining mechanisms:
- **Good first issues** — tag CLI adapter work, new output formats, and gallery examples as approachable contributions
- **"Generate docs for my project" bot** — GitHub App or Discord bot where anyone pastes a YouTube URL and gets docs back
- **GitHub Sponsors** — once at 1k+ stars, companies using it commercially (AGPL license pushes them toward this) will want to sponsor or buy a commercial license
