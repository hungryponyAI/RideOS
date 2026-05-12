# OUDENA — Design System

Version: 2.0

# 1. Design Principles

- Calm Clarity
- Functional Minimalism
- Motion With Purpose
- Road-Centric Design
- Quiet Precision

---

# 2. Visual Language

Combination of:
- Nordic Minimalism
- Performance Technology
- Industrial Simplicity

Inspired by:
- Apple
- Tesla

---

# 3. Visual Characteristics

- restrained color usage
- spacious layouts
- elegant hierarchy
- subtle depth
- cinematic motion
- low visual noise

---

# 4. Color System

## Primary Palette

| Token | Value |
|---|---|
| background-primary | #F4F6F5 |
| background-secondary | #EBEFEE |
| surface-primary | #FFFFFF |
| text-primary | #1D242D |
| text-secondary | #5F6874 |
| text-muted | #8D97A3 |

---

## Accent Colors

| Token | Value |
|---|---|
| accent-glacier | #74AFCB |
| accent-titanium | #68707A |
| success | #6BAA75 |
| warning | #C59A52 |
| critical | #C76D6D |

---

# 5. Dark Mode

| Token | Value |
|---|---|
| dark-background | #111417 |
| dark-surface | #1B2127 |
| dark-border | #2A323B |
| dark-text | #F3F5F7 |

---

# 6. Typography

## Primary Typeface

- SF Pro
- Inter fallback

---

## Typography Style

- generous spacing
- calm hierarchy
- tabular numerals
- restrained density

---

## Typography Scale

| Style | Size | Weight |
|---|---|---|
| hero-metric | 56 | Medium |
| metric-large | 40 | Medium |
| section-title | 28 | Medium |
| card-title | 20 | Medium |
| body | 16 | Regular |
| secondary | 14 | Regular |
| metadata | 12 | Medium |

---

# 7. Metric Styling

Metrics should:
- feel large
- feel calm
- avoid unnecessary labels

Good:
248
W

Avoid:
248 watts

---

# 8. Spacing System

Use only the 8pt grid.

| Token | Value |
|---|---|
| xs | 4 |
| sm | 8 |
| md | 16 |
| lg | 24 |
| xl | 32 |
| xxl | 48 |
| hero | 72 |

---

# 9. Layout System

## Desktop

- 12-column grid
- max width: 1440px

## Mobile

- 4-column grid

---

## Density Rules

Prefer:
- whitespace
- separation
- breathing room

Avoid:
- compressed dashboards
- dense analytics

---

# 10. Surface System

## Cards

Radius:
20px

Shadow:
0 6px 20px rgba(0,0,0,0.06)

Hover:
- subtle elevation
- slight shadow increase
- no aggressive scaling

---

## HUD Panels

Use:
- translucent surfaces
- soft blur
- low contrast edges

Example:
rgba(255,255,255,0.72)

Blur:
12–18px

---

# 11. Component System

## Buttons

### Primary
- glacier accent
- rounded corners
- large touch area

### Secondary
- muted surface
- restrained outline

### Tertiary
- text only
- low emphasis

---

## Inputs

Should feel:
- soft
- spacious
- calm

Avoid:
- harsh borders
- excessive contrast

---

# 12. Iconography

- thin line icons
- SF Symbols inspired
- restrained visual weight

Avoid:
- gaming visuals
- bulky icons
- aggressive styling

---

# 13. Ride HUD Design

HUD should feel:
- floating
- lightweight
- secondary to the ride

Visible by default:
- power
- cadence
- heart rate
- ghost delta

Secondary metrics stay expandable.

---

# 14. Elevation Timeline

Purpose:
“The emotional timeline of the ride.”

States:
- normal
- climb-expanded
- recovery

---

# 15. Ride Visualization

- monochrome terrain
- dawn atmosphere
- cinematic camera movement
- subtle contour lines

Primary route:
Glacier Blue

Ghost:
Muted translucent blue.

---

# 16. Motion System

Everything glides.

---

## Timing

| Interaction | Duration |
|---|---|
| tap | 120ms |
| hover | 150ms |
| expand | 250ms |
| modal | 350ms |
| cinematic | 600ms |

---

## Easing

cubic-bezier(0.22, 1, 0.36, 1)

---

# 17. Interaction States

## Hover
- slight elevation
- subtle glow

## Active
- restrained accent emphasis

## Disabled
- reduced opacity

## Loading
Use:
- skeleton placeholders
- animated route traces

Avoid:
- blocking spinners

---

# 18. Responsive Rules

## Desktop
- immersive route layouts
- persistent metrics
- multi-panel analytics

## Mobile
- simplified controls
- swipe metric expansion
- glanceable metrics

---

# 19. Accessibility

- minimum touch target: 44px
- WCAG AA contrast
- scalable typography
- keyboard accessibility

---

# 20. Photography Direction

Mood:
- foggy climbs
- dawn light
- calm indoor setups
- quiet endurance

More:
- Porsche campaign

Less:
- Red Bull campaign

---

# 21. Logo System

The logo should feel:
- timeless
- technical
- premium
- calm

Based on:
- elevation curves
- circular movement
- route continuity

---

# 22. Wordmark

O U D E N A

Characteristics:
- all caps
- wide tracking
- geometric spacing
- thin premium weight

---

# 23. App Icon

Minimal route-inspired symbol on:
- titanium background
or
- dark monochrome surface

Avoid:
- bike illustrations
- clutter
- text

---

# 24. Engineering Notes

- design-token architecture
- CSS variables
- Tailwind token mapping
- GPU-friendly animations
- route interpolation smoothing

---

# 25. Final Design Principle

“Powerful without appearing complicated.”