# Promptinary — UI Design Specification
> **For the coding agent:** This document defines every visual and interaction design decision for Promptinary. All implementation decisions — colors, fonts, spacing, components, animations — must strictly follow this spec. The design language is derived from the *Indopendence Quiz Game App* by Peter Haltermy on Dribbble (shot #26108795).

---

## 1. Design Philosophy

The overall aesthetic is **"Playful Bold"** — a style that combines:
- **Chunky, confident typography** that commands attention
- **A warm off-white base** that keeps the UI feeling friendly, not clinical
- **Vivid, saturated color blocks** used as accents and card backgrounds (never as the full-page background)
- **Heavy black outlines and deep shadows** on interactive elements to create a tactile, almost physical feel
- **Rounded everything** — corners, pills, blobs — nothing sharp or aggressive
- **Cartoon mascot energy** — even without literal mascots, UI elements should feel expressive and alive

The UI must feel like a game from the first second. It should be immediately obvious this is something fun — not a productivity tool.

---

## 2. Color Palette

Use these exact hex values. No substitutions.

| Name | Hex | Usage |
|---|---|---|
| **Fantasy (Background)** | `#F5F4ED` | Primary page/screen background — the warm off-white base for ALL screens |
| **Smoky Black** | `#100F06` | Primary text, button fills, outlines, icon strokes |
| **Light Gold** | `#FFDA57` | Hero accents, highlight states, CTA backgrounds, game card backgrounds |
| **Teal** | `#00917A` | Primary action buttons (e.g. "Get Started", "Play Game", nav active state) |
| **Bright Lavender** | `#A293FF` | Secondary cards, answer option highlights, leaderboard rows |
| **Malibu (Sky Blue)** | `#7DCAF6` | Game mode cards, info states, secondary UI blocks |
| **Blossom Pink** | `#FFBBF4` | Mascot/decorative elements, game card backgrounds (alternate) |
| **Light Coral** | `#F47575` | Warning states, error feedback, "wrong answer" flash |
| **Orange** | `#F4A23A` | Game card backgrounds (warm alternate), progress bar fill |
| **Pure White** | `#FFFFFF` | Card surfaces, modal backgrounds, input fields |

### Color Rules
- **Page background is always `#F5F4ED`** (Fantasy). Never pure white or dark backgrounds for base screens.
- **Game cards** use vivid color fills (Gold, Blue, Orange, Lavender, Pink) — rotate through the palette.
- **Text on colored backgrounds** is always `#100F06` (Smoky Black) or `#FFFFFF` depending on contrast.
- **Never use gradients.** All color blocks are flat, solid fills.
- **The black `#100F06`** is used for all shadows (offset, not blurred — see Shadows section).

---

## 3. Typography

### Font Families
Import both from Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@300;400;500;700&display=swap" rel="stylesheet">
```

| Font | Role | Weights Used |
|---|---|---|
| **Unbounded** | Display headings, game titles, screen titles, score numbers | Bold (700), Extra Bold (800), Black (900) |
| **Space Grotesk** | Body text, subtitles, labels, button text, metadata | Light (300), Regular (400), Medium (500), Bold (700) |

### Type Scale

| Element | Font | Weight | Size | Line Height |
|---|---|---|---|---|
| Hero / Screen Title | Unbounded | 800 | 32–40px | 1.1 |
| Game Card Title | Unbounded | 700 | 24–28px | 1.15 |
| Section Heading | Unbounded | 700 | 20px | 1.2 |
| Score / Counter (large) | Unbounded | 900 | 48–72px | 1.0 |
| Button Label | Space Grotesk | 700 | 16px | 1.0 |
| Body / Description | Space Grotesk | 400 | 14–16px | 1.5 |
| Caption / Metadata | Space Grotesk | 400 | 12px | 1.4 |
| Badge / Tag | Space Grotesk | 500 | 11–12px | 1.0 |

### Typography Rules
- Screen titles (e.g. "Pick Game To Play") use **Unbounded Bold, left-aligned, multi-line** — let them wrap naturally and take up space. Do not shrink to fit.
- **Letter spacing on Unbounded headings:** `-0.02em` (slightly tight).
- **Letter spacing on Space Grotesk body:** `0` (normal).
- Numbers in scores and timers always use **Unbounded 900** — they are a visual feature, not just data.

---

## 4. Spacing & Layout

### Base Unit
Use an **8px base grid**. All spacing values are multiples of 8.

| Token | Value | Usage |
|---|---|---|
| `space-xs` | 4px | Icon gaps, tight inline spacing |
| `space-sm` | 8px | Internal card padding (tight) |
| `space-md` | 16px | Standard component padding |
| `space-lg` | 24px | Card padding, section gaps |
| `space-xl` | 32px | Screen-level padding, large gaps |
| `space-2xl` | 48px | Between major sections |

### Screen Padding
- Mobile: `20px` horizontal padding on all screens.
- Content max-width (web): `420px` centered — this is a mobile-first design.

### Border Radius Scale
| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 12px | Tags, badges, small chips |
| `radius-md` | 16px | Answer option buttons, input fields |
| `radius-lg` | 20px | Cards, modals |
| `radius-xl` | 28px | Game mode hero cards |
| `radius-pill` | 999px | CTAs, nav bar, toggle buttons |

---

## 5. Shadows & Depth

This is one of the most distinctive elements of the design. **All interactive elements use a hard offset shadow** — no blur, no spread. This creates a flat, comic-book / sticker quality.

```css
/* Primary hard shadow — used on all cards and buttons */
box-shadow: 3px 3px 0px #100F06;

/* Heavier shadow — used on hero game cards */
box-shadow: 5px 5px 0px #100F06;

/* On hover / active — reduce shadow to simulate press */
box-shadow: 1px 1px 0px #100F06;
transform: translate(2px, 2px); /* moves element into shadow */
```

### Shadow Rules
- **Every card has a hard shadow.**
- **Every primary button has a hard shadow.**
- **On press/click**, the shadow shrinks and the element translates toward the shadow — simulating a physical press.
- Input fields do NOT have shadows by default, only on focus.
- The shadow color is always `#100F06` — never grey, never transparent.

---

## 6. Component Specifications

### 6.1 Buttons

#### Primary CTA Button (e.g. "Get Started", "Play Game")
```
Background:     #00917A (Teal) or #100F06 (Black) for dark variant
Text:           #FFFFFF, Space Grotesk Bold 16px
Padding:        16px 32px
Border Radius:  999px (pill)
Border:         2px solid #100F06
Shadow:         3px 3px 0px #100F06
Height:         52–56px
Width:          Full width of container
```
- Include a small icon or arrow to the right of the label (e.g. `→` or `▶`).
- On hover: `transform: translate(2px, 2px)` + shadow reduces to `1px 1px`.

#### Secondary / Ghost Button
```
Background:     transparent
Text:           #100F06, Space Grotesk Bold 16px
Border:         2px solid #100F06
Border Radius:  999px
Shadow:         3px 3px 0px #100F06
```

#### Icon-Only Button (nav icons)
```
Background:     #FFFFFF
Size:           44x44px
Border Radius:  999px
Border:         2px solid #100F06
Shadow:         2px 2px 0px #100F06
```

### 6.2 Answer Option Buttons (Multiple Choice)

```
Background:     #FFFFFF (default), #00917A when selected/correct, #F47575 when wrong
Text:           #100F06, Space Grotesk Medium 15px
Border:         2px solid #100F06
Border Radius:  16px
Padding:        14px 16px
Shadow:         3px 3px 0px #100F06
Width:          Full width
```
- Prefix each option with a letter label in a small colored circle: A (Gold), B (White), C (Teal), D (Lavender).
- Letter badge: 28x28px circle, `Space Grotesk Bold`, centered.
- Selected state: background fills with Teal `#00917A`, text turns white.

### 6.3 Game Mode Cards (Hero Carousel)

```
Background:     Vivid color (Gold #FFDA57, Blue #7DCAF6, Orange #F4A23A — rotate)
Border Radius:  28px
Border:         2px solid #100F06
Shadow:         5px 5px 0px #100F06
Padding:        24px
Height:         ~320px
Width:          ~90% of screen width
```
- Contains: game title in Unbounded Bold (large, white, centered, on a white rounded pill/blob background), an online player count badge (green dot + Space Grotesk text), a mascot illustration (top-right, overflowing card bounds), and a "Play Game ▶" black pill button at the bottom.
- The game title sits on a **white rounded rectangle** (`border-radius: 20px`) — not directly on the card color.
- Sparkle/star decorative elements (`✦`) scattered on the card, white or semi-transparent.

### 6.4 Cards (General)

```
Background:     #FFFFFF
Border:         2px solid #100F06
Border Radius:  20px
Shadow:         4px 4px 0px #100F06
Padding:        16–20px
```

### 6.5 Navigation Bar (Bottom)

```
Background:     #100F06 (Smoky Black)
Border Radius:  999px (pill shape)
Height:         64px
Padding:        8px
Margin:         0 16px 24px 16px (floats above the bottom edge)
Shadow:         none (it IS the dark element)
```
- Active nav item: pill-shaped background in Teal `#00917A` with white icon + white label.
- Inactive nav items: icon-only (no label), white icon, circular white background at 40% opacity.
- The nav bar floats — it does not touch the screen edges. It has margin on all sides.

### 6.6 Input Field (Text / Prompt Editor)

```
Background:     #FFFFFF
Border:         2px solid #100F06
Border Radius:  16px
Padding:        14px 16px
Font:           Space Grotesk Regular 15px, color #100F06
Placeholder:    Space Grotesk Regular 15px, color #100F06 at 40% opacity
Shadow (focus): 3px 3px 0px #100F06
```
- Send/submit button sits inside the input, right-aligned: small circle `#100F06` with white arrow icon.

### 6.7 Progress Bar (Timer / Token Count)

```
Track:          #E5E4DE (slightly darker than background)
Fill:           #F4A23A (Orange) — transitions to #F47575 (Coral) under 20%
Height:         6px
Border Radius:  999px
```
- No border, no shadow.
- Timer label (e.g. `02:54`) displayed to the right with a clock icon, `Space Grotesk Medium 14px`.

### 6.8 Player / Score Row (Leaderboard)

```
Background:     #FFFFFF (others), #A293FF (current player "You")
Border:         1.5px solid #100F06
Border Radius:  16px
Padding:        12px 16px
Shadow:         2px 2px 0px #100F06
```
- Rank number: `Space Grotesk Bold`, left-most.
- Avatar: 32px circle with 1.5px `#100F06` border.
- Name: `Space Grotesk Medium 14px`.
- Score: `Space Grotesk Bold 14px`, right-aligned, with coin icon.

### 6.9 Modal / Overlay

```
Backdrop:       rgba(16, 15, 6, 0.5) — blurred background, NOT the UI
Card:           #FFFFFF, border-radius: 28px, border: 2px solid #100F06
Shadow:         6px 6px 0px #100F06
Padding:        32px 24px
```

### 6.10 Badge / Tag / Chip

```
Background:     Color varies by type (see palette)
Text:           Space Grotesk Medium 12px
Padding:        4px 12px
Border Radius:  999px
Border:         1.5px solid #100F06
```
- "Online" badge: green dot `#00C48C` (8px circle) + count text.

---

## 7. Iconography

- Use **outlined icons** (not filled), stroke weight `2px`, color always `#100F06` unless on a dark background (then `#FFFFFF`).
- Recommended icon library: **Lucide Icons** or **Phosphor Icons** — both have a clean, rounded outline style.
- Icon sizes: 20px (inline/nav), 24px (card), 32px (feature).

---

## 8. Decorative Elements

These small touches are what make the design feel alive:

- **Sparkles / Stars (`✦` or `✸`):** Scattered on game cards and hero areas. White or light-colored, varying sizes (8px–16px). Animate with a slow pulse or twinkle.
- **Squiggles / Wavy Lines:** Orange `#F4A23A` decorative squiggle shapes in corners of the splash screen. Use SVG paths, not emoji.
- **Dot Pagination:** For carousels, use small circles — active dot is elongated (pill shape, colored), inactive dots are small grey circles. Never use arrows as primary carousel navigation.
- **Confetti / Celebration particles:** On correct answer or score reveal, trigger a burst of colored confetti dots in the palette colors.

---

## 9. Screen-by-Screen Layout Guide

### Screen 1: Splash / Onboarding
- Background: `#F5F4ED`
- Large mascot character illustration, centered, top 55% of screen
- Squiggle decoration top-left and bottom-right corners
- Bottom 45%: left-aligned text block
  - Heading: Unbounded 800, 36px, `#100F06`, multi-line
  - Subheading: Space Grotesk 400, 14px, `#100F06` at 60% opacity
- Dot pagination row (pink active dot)
- Full-width Teal CTA pill button + small circle play icon to the left

### Screen 2: Home / Game Picker
- Top bar: Avatar (32px circle) + username (Space Grotesk Medium) + coin score + coin icon (right-aligned)
- Title: "Pick Game\nTo Play" — Unbounded 800, 32px, `#100F06`, left-aligned, 2 lines
- Right icons: cart + search (outline, 24px)
- Carousel of Game Mode Cards (see 6.3) — swipeable, with dot pagination below
- Floating pill bottom nav

### Screen 3: Game / Prompt Screen
- Top: progress bar (full width) + timer `MM:SS` right-aligned
- Main area: Reference image displayed in a white card with `border-radius: 20px`, `border: 2px solid #100F06`, `shadow: 4px 4px 0px #100F06`
- Token counter: large Unbounded number showing remaining tokens, color-coded (gold → orange → coral as depletes)
- Text input area: full-width, multiline, with live character count
- Submit button: black pill, full-width, "Generate ▶"

### Screen 4: Results / Reveal
- Split-screen or stacked: reference image vs. generated image, side by side in cards
- Similarity score animates up as a large Unbounded number with a `%` suffix
- Score breakdown chips (similarity, speed, efficiency) below
- Leaderboard rows for all players

### Screen 5: Leaderboard
- Full-screen dark panel (`#100F06`) for top 3, transitions to `#F5F4ED` background for the rest
- Top 3: larger cards with rank crown icons
- "You" row: always highlighted in Lavender `#A293FF`
- "Back to Home" teal pill button, full-width, bottom

### Screen 6: Matchmaking / Queue Modal
- Dimmed background (current screen at 50% opacity)
- White modal card, centered, with mascot illustration
- "Queueing game (X/Y)..." — Space Grotesk Medium
- Black pill "Cancel" button

---

## 10. Animation & Interaction

| Interaction | Animation |
|---|---|
| Button press | `transform: translate(2px, 2px)` + shadow shrinks, 80ms ease |
| Screen transition | Slide up from bottom, 300ms ease-out |
| Score counter | Count up from 0 to final value, 1.2s with easeOutExpo |
| Correct answer flash | Card background pulses Teal for 400ms |
| Wrong answer flash | Card background pulses Coral for 400ms |
| Token counter warning | Shake animation + color shift to Coral when <20% remaining |
| Confetti | Particle burst on round end, 64 particles in palette colors |
| Card hover (web) | `transform: translate(-2px, -2px)` + shadow grows, 120ms ease |
| Carousel | Spring physics drag, snap to nearest card |
| Sparkle elements | Slow opacity pulse 0.6→1.0→0.6, 2s infinite, staggered |
| Modal appear | Scale from 0.92 + fade in, 250ms ease-out |

---

## 11. Responsive Behavior

This is a **mobile-first design**. The canonical layout is 390px wide (iPhone 14 viewport).

- On desktop/web, center the game interface at `max-width: 420px` with the `#F5F4ED` background extending edge-to-edge.
- Do not widen the layout for larger screens — keep the app-like proportions.
- The floating bottom nav becomes a fixed bottom bar on web.

---

## 12. Implementation Checklist for Coding Agent

Before shipping any screen, verify:

- [ ] Background is `#F5F4ED`, not white or grey
- [ ] All cards have `2px solid #100F06` border AND a hard offset shadow
- [ ] Buttons press down visually on click (shadow reduces, element translates)
- [ ] Headings use **Unbounded** font, body uses **Space Grotesk**
- [ ] No gradients anywhere
- [ ] No blurred shadows — all shadows are hard offset `0 blur`
- [ ] Bottom nav is a floating pill (`border-radius: 999px`), not a flat bar
- [ ] Token/score numbers use Unbounded Black (900 weight)
- [ ] Color fills on game cards are flat, vivid, and rotate through the palette
- [ ] Game card titles sit on a white rounded-rectangle background, not directly on the color

---

*Reference: Indopendence — Independence Quiz Games App by Peter Haltermy, Dribbble shot #26108795*
