# 🎨 PROMPTINARY
### The AI Image Prompt Challenge Game
*Hackathon Concept Document — 2025*

---

## Executive Summary

Promptinary is a competitive multiplayer game where players race to recreate a given reference image as accurately as possible — but with a critical twist: every character typed costs precious tokens. The game sits at the intersection of AI literacy, creative writing, and competitive gaming, turning prompt engineering into an exciting skill that anyone can learn and master.

> **The Core Idea:** Show players a stunning reference image. Give them a limited token budget. Let them craft the best prompt they can. Score them on visual similarity, prompt efficiency, and speed. Crown the best prompt engineer.

---

## The Problem We're Solving

AI image generation has exploded in popularity, but most people treat prompting like a guessing game — adding random words and hoping for the best. There is no engaging, accessible way to learn the craft of writing great prompts. Meanwhile, competitive gaming thrives on tight constraints and skill-based scoring.

Promptinary bridges this gap: it transforms prompt engineering from a solitary, trial-and-error activity into a social, high-stakes competition with clear feedback loops.

---

## How It Works

### Core Game Loop

1. A reference image is displayed to all players simultaneously — drawn from a curated library of royalty-free images spanning art, photography, nature, architecture, and abstract design.
2. Each player is allocated a fixed token budget (e.g. 150 tokens) and a countdown timer begins.
3. Players craft a text prompt within their token budget and submit it to an AI image generator.
4. The generated image is compared to the reference using a visual similarity algorithm (e.g. CLIP score or structural similarity index).
5. Points are awarded based on three dimensions: visual similarity, tokens saved, and submission speed.
6. Results are revealed to all players, scores are tallied, and the leaderboard updates in real time.

### Scoring System

| Scoring Dimension | How It's Calculated | Weight |
|---|---|---|
| Visual Similarity | AI-computed score comparing generated vs. reference image (composition, color, lighting, subject) | 60% |
| Prompt Efficiency | Bonus points for tokens saved under the budget — rewarding brevity | 25% |
| Speed | Time bonus: faster submissions earn more; eliminates at time limit | 15% |

### Game Modes

- 🌐 **Online Multiplayer** — Join a global lobby; matched with players of similar skill level. Up to 8 players per round.
- 🔒 **Private Room** — Create a room with a unique code and invite friends. Perfect for parties, classrooms, or team events.
- 🧑‍💻 **Solo Practice** — Play alone against the clock to improve prompt engineering skills with detailed feedback.
- 🏛️ **Venue Mode** — Kiosk-friendly display mode designed for museums, galleries, and events with simplified controls and large-format display.

---

## Reference Image Library

The quality and diversity of reference images is central to the gameplay experience. Images will be curated across multiple categories to ensure varied challenge levels:

| Category | Examples | Difficulty |
|---|---|---|
| Fine Art | Impressionist paintings, sculpture, abstract art | Hard |
| Photography | Landscape, portrait, street, macro | Medium |
| Architecture | Iconic buildings, interior design, cityscapes | Medium |
| Nature | Wildlife, botanical, weather phenomena | Easy–Medium |
| Concept Art | Sci-fi, fantasy, surrealist scenes | Hard |
| Historical | Period settings, vintage imagery | Medium–Hard |

All images are sourced from royalty-free repositories (Unsplash, Pexels, Wikimedia Commons, or original AI-generated images) to avoid copyright issues. Each image is tagged with difficulty, category, and key visual descriptors for system use.

---

## The Token System

Tokens are the central constraint mechanic of Promptinary. Each player begins every round with a fixed allocation. Characters in the prompt are counted and converted to approximate tokens (roughly 4 characters = 1 token).

> **Why Tokens?** Token limits force meaningful trade-offs. A player must decide: do I describe the lighting in detail, or trust the AI to infer it? Do I name an art style explicitly, or save tokens for compositional details? These decisions are the heart of the game.

### Token Budget Tiers

| Mode | Token Budget | Intended Experience |
|---|---|---|
| Beginner | 200 tokens | Generous space to describe the image freely |
| Standard | 120 tokens | Requires prioritization of key visual elements |
| Expert | 60 tokens | Extreme compression; every word must earn its place |
| Haiku Mode | 20 tokens | Ultra-hard; forces lateral, poetic thinking |

---

## Power-Ups & Boosts *(Future Feature)*

Power-ups add a strategic layer to competitive play, allowing players to influence not just their own performance but their opponents'. Players earn boost credits through gameplay and can deploy them at key moments.

### Offensive Boosts
- ⚡ **Token Drain** — Reduce a target opponent's remaining token budget by 20 tokens.
- 🌀 **Scramble** — Temporarily shuffle the reference image for a target player (5 seconds).
- ❄️ **Freeze** — Pause a target player's submission timer for 10 seconds.

### Defensive Boosts
- 🛡️ **Token Shield** — Protect your token budget from drain attacks for one round.
- ✏️ **Prompt Revision** — After your image is generated, edit your prompt and regenerate once.
- ⏱️ **Extra Time** — Add 15 seconds to your personal countdown.

### Utility Boosts
- 💡 **Hint** — Reveal 2 AI-suggested keywords relevant to the reference image (costs 10 tokens to use them).
- 🏷️ **Category Reveal** — Reveal the style/category tag of the reference image.
- ⭐ **Double Points** — Next round's score is doubled (single use per match).

---

## Venue & Institutional Applications

Promptinary is uniquely positioned to extend beyond consumer gaming into physical venues. The game's visual, accessible nature makes it ideal for audience engagement in cultural and entertainment contexts.

| Venue Type | Use Case |
|---|---|
| Art Museums | Interactive exhibit: visitors try to recreate artworks from the collection via prompt. Teaches visual literacy and art history. |
| Photography Galleries | Challenge mode: recreate a photographer's composition and lighting in words. Deepens appreciation of craft. |
| Science Centers | Explore how AI "sees" and interprets language. Educational framing around computer vision and NLP. |
| Cinema / Film Events | Recreate iconic movie stills or scenes. Creates engagement and social sharing around film premieres. |
| Corporate Events | Team-building game: departments compete against each other. Builds AI literacy in a fun, non-threatening way. |
| Schools & Universities | Classroom tool for teaching prompt engineering, media literacy, and creative writing. |

---

## Technical Architecture

### Core Components

- 🖥️ **Frontend** — Web app (React/Next.js) with a real-time game interface, prompt editor with live token counter, and image comparison reveal animation.
- ⚙️ **Backend** — Node.js/Python API handling room management, player state, timer synchronization, and scoring logic.
- 🤖 **AI Image Generation** — Integration with a generative model API (e.g. Stable Diffusion, DALL-E, or Flux) to render player prompts.
- 📊 **Similarity Scoring** — CLIP-based cosine similarity between reference image and generated image embeddings; optionally supplemented with SSIM.
- 📡 **Real-Time Layer** — WebSocket connection (Socket.io or similar) for synchronized countdowns, live score updates, and boost delivery.
- 🖼️ **Image Library** — CDN-hosted reference images with metadata tags for difficulty, category, and visual descriptors.

### Hackathon MVP Scope

> For the hackathon, the MVP focuses on: single-room local multiplayer (same device or shared screen), one AI image generation API, CLIP similarity scoring, a curated set of 20 reference images, and the core token-limited prompt editor. Power-ups and venue mode are post-hackathon features.

**What We Need to Build:**
- Prompt editor UI with live token counting and submission flow
- Integration with one AI image generation API (Stable Diffusion or DALL-E)
- CLIP-based image similarity scoring pipeline
- Real-time multiplayer room with synchronized timer and result reveal
- Curated set of 20 diverse, royalty-free reference images with difficulty tags
- Score calculation and leaderboard display

---

## User Experience Highlights

### Prompt Editor
The prompt editor is the centerpiece of the player experience. Key UX features include:
- Live token counter with color-coded urgency (green → yellow → red as budget depletes)
- Character-by-character cost display so players always know exactly what they are spending
- Undo button that refunds tokens for removed characters
- Optional keyword suggestions (as a paid boost) displayed as ghost text

### Image Reveal
After submission, there is a dramatic reveal sequence:
- A split-screen shows the reference image alongside each player's generated image
- A similarity score animates from 0 to the final value, building tension
- The winning image and prompt are highlighted with full score breakdown
- Players can "react" to other players' results — adding a social layer to the reveal

---

## Competitive Differentiation

Promptinary occupies a unique market position that no existing product directly addresses:

| Competitor / Comparator | Gap Promptinary Fills |
|---|---|
| Midjourney / DALL-E / Stable Diffusion | These are tools, not games. No social layer, no scoring, no constraints that create competitive tension. |
| Gartic Phone / Skribbl.io | Drawing games with no AI involvement. Promptinary brings AI generation as the creative medium. |
| AI Prompt marketplaces | Transactional, not playful. No competitive or educational game loop. |
| Museum interactives | Most are passive or single-player kiosks. Promptinary adds multiplayer and real-time competition. |

---

## Monetization Strategy *(Future)*

| Revenue Stream | Description |
|---|---|
| Freemium Model | Free to play with standard image library and modes. Premium unlocks expanded image packs, cosmetics, and extra boosts. |
| Venue Licensing | Monthly SaaS license for museums, galleries, and event venues with white-label branding and analytics dashboard. |
| Education Tier | Discounted institutional license for schools and universities with classroom management tools and progress tracking. |
| Cosmetic Shop | Player avatars, prompt editor themes, score animation styles. No pay-to-win items. |
| Sponsored Challenges | Brands or cultural institutions sponsor themed image packs (e.g. a film studio releasing stills from a new movie). |

---

## Product Roadmap

| Phase | Timeline | Key Deliverables |
|---|---|---|
| Phase 1 — Hackathon MVP | Hackathon weekend | Core game loop, token editor, CLIP scoring, 20 reference images, local multiplayer |
| Phase 2 — Beta | Month 1–2 | Online matchmaking, user accounts, image library expansion (100+ images), leaderboards |
| Phase 3 — Launch | Month 3–4 | Power-up system, private rooms, mobile-responsive design, social sharing |
| Phase 4 — Scale | Month 5–8 | Venue mode, institutional licensing, API for third-party image packs, analytics dashboard |
| Phase 5 — Ecosystem | Month 9+ | User-generated image packs, tournament mode, branded partnerships, mobile apps |

---

*Promptinary turns the art of prompting into a sport.*
*Every token counts. Every second matters. Every image tells a story.*
