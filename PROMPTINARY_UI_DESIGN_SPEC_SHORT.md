# Promptinary — UI Design Specification

> **For the coding agent:** This document defines the visual design language for Promptinary, inspired by the *Indopendence Quiz Game App* (Dribbble #26108795). Follow this spec for all UI decisions.

---

## Design Philosophy

**"Playful Bold"** — chunky typography, warm off-white base, vivid flat color blocks, heavy black outlines, hard offset shadows, and rounded everything. It should feel like a game from the first second.

- Flat, solid colors only — no gradients, no blurred shadows
- Rounded corners everywhere — nothing sharp
- Every interactive element feels physically pressable

---

## Colors

| Name | Hex | Usage |
|---|---|---|
| Fantasy (Background) | `#F5F4ED` | Base background for ALL screens — never pure white |
| Smoky Black | `#100F06` | Text, borders, shadows, button fills |
| Light Gold | `#FFDA57` | Hero accents, highlights, game card backgrounds |
| Teal | `#00917A` | Primary action buttons, active nav state |
| Bright Lavender | `#A293FF` | Secondary cards, current player highlight |
| Malibu Blue | `#7DCAF6` | Game cards, info states |
| Blossom Pink | `#FFBBF4` | Decorative, alternate game card backgrounds |
| Light Coral | `#F47575` | Errors, wrong answer feedback |
| Orange | `#F4A23A` | Progress bar, warm card alternate |
| White | `#FFFFFF` | Card surfaces, modals, input fields |

---

## Typography

Import from Google Fonts:
```
Unbounded (700, 800, 900) — headings, titles, scores
Space Grotesk (400, 500, 700) — body, labels, buttons
```

| Element | Font | Weight | Size |
|---|---|---|---|
| Screen title | Unbounded | 800 | 32–40px |
| Game card title | Unbounded | 700 | 24–28px |
| Score / counter | Unbounded | 900 | 48–72px |
| Button label | Space Grotesk | 700 | 16px |
| Body text | Space Grotesk | 400 | 14–16px |
| Caption / metadata | Space Grotesk | 400 | 12px |

---

## Spacing & Shape

- **Base grid:** 8px. All spacing is multiples of 8.
- **Screen padding:** 20px horizontal.
- **Border radius scale:** tags `12px` · buttons/inputs `16px` · cards `20px` · hero cards `28px` · pills `999px`

---

## Shadows

The most distinctive element — all shadows are **hard offset, zero blur**:

```css
/* Cards and buttons */
box-shadow: 3px 3px 0px #100F06;

/* Hero game cards */
box-shadow: 5px 5px 0px #100F06;

/* On press — simulates physical click */
box-shadow: 1px 1px 0px #100F06;
transform: translate(2px, 2px);
```

Every card and every button has a hard shadow. Shadow color is always `#100F06`.

---

## Key Components

**Buttons** — Pill shape (`border-radius: 999px`), `2px solid #100F06` border, hard shadow. Primary uses Teal or Black fill with white text. Press state translates element into shadow.

**Answer Options** — Full-width, `border-radius: 16px`, white background with black border and shadow. Prefix with a colored letter badge (A/B/C/D). Selected state fills Teal; wrong fills Coral.

**Game Cards** — Large vivid color fill (rotate through palette), `border-radius: 28px`, `5px` hard shadow. Card title sits on a white rounded rectangle inside the card — not directly on the color.

**Input Fields** — White background, `2px solid #100F06`, `border-radius: 16px`. Submit button is a small black circle with white arrow, inside the input on the right.

**Bottom Nav** — Floating black pill (`background: #100F06`, `border-radius: 999px`), with margin on all sides — it never touches screen edges. Active item is a Teal pill with white icon + label.

**Progress Bar** — Orange fill (`#F4A23A`), transitions to Coral under 20%. No border, no shadow. `6px` height, pill shaped.

---

## Decorative Touches

- **Sparkles (`✦`):** Scattered on cards, slow pulse animation, white or light-colored
- **Squiggles:** Orange SVG wavy lines in screen corners on splash/hero screens
- **Dot pagination:** Active dot is an elongated pill (colored), inactive dots are small grey circles

---

## Animations

| Interaction | Behavior |
|---|---|
| Button press | Translate `(2px, 2px)` + shadow shrinks, 80ms |
| Score count-up | 0 → final value, 1.2s easeOutExpo |
| Correct answer | Card pulses Teal, 400ms |
| Wrong answer | Card pulses Coral, 400ms |
| Token warning (<20%) | Shake + color shifts to Coral |
| Modal appear | Scale from 0.92 + fade in, 250ms ease-out |
| Card hover (web) | Translate `(-2px, -2px)` + shadow grows, 120ms |

---

## Implementation Checklist

- [ ] Background is `#F5F4ED`, not white
- [ ] All cards/buttons have `2px solid #100F06` border + hard offset shadow
- [ ] Buttons press down on click (shadow reduces, element translates)
- [ ] Headings use **Unbounded**, body uses **Space Grotesk**
- [ ] No gradients, no blurred shadows anywhere
- [ ] Bottom nav is a floating pill, not a flat bar
- [ ] Score/token numbers use Unbounded 900 weight
- [ ] Game card titles sit on a white rounded rectangle, not directly on the card color

---

*Reference: Indopendence — Independence Quiz Games App, Dribbble #26108795*
