# Cycling Stage Graphic Style Guide

## 1. Overview

This style guide defines the visual system used in professional cycling stage graphics (e.g., Tour-style stage profiles). The design combines **high-contrast branding**, **data-dense elevation profiles**, and **minimalist typography** to ensure clarity during fast consumption (e.g., TV broadcast or mobile viewing).

---

## 2. Layout Structure

### 2.1 Canvas

- Aspect ratio: **16:9**
- Background split:
  - **Left panel (~35%)**: Branding / stage info
  - **Right panel (~65%)**: Elevation profile

---

### 2.2 Left Panel (Brand Block)

#### Background
- Solid **bright yellow**
  - HEX: `#FFF200` (primary brand color)

#### Content Alignment
- Left-aligned
- Vertical stacking
- Generous padding (~40–60px)

#### Elements (top → bottom)

1. **Stage Meta Info**
   - Example: `4/07 • 223 KM`
   - Font:
     - Sans-serif, bold
     - Condensed appearance
   - Color: `#000000`
   - Letter spacing: slight (+2–4%)

2. **Stage Label Block**
   - Black geometric shape (angled trapezoid)
   - Contains:
     - `STAGE` (white)
     - `ÉTAPE` (white, smaller)
     - Stage number (`3`) in **accent yellow**
   - Styling:
     - High contrast
     - Bold uppercase
     - Slight rotation or dynamic cut edges

3. **Route Title**
   - Example:
     ```
     WELSHPOOL
     > CARDIFF
     ```
   - Font:
     - Bold, uppercase sans-serif
   - Color: `#000000`
   - Arrow (`>`) used as directional indicator

---

## 3. Right Panel (Elevation Profile)

### 3.1 Background

- Light gray
  - HEX: `#F2F2F2`

---

### 3.2 Elevation Chart

#### Base Layer

- Filled elevation area:
  - Color: **yellow** (`#FFF200`)
- Outline:
  - Thin black stroke (~1–2px)

#### X-Axis

- Distance markers (km)
- Font:
  - Small sans-serif
  - Color: `#000000`
- Key distances emphasized (slightly larger or bold)

#### Y-Axis

- Minimal or omitted
- Optional small scale (e.g., 0m–500m) on left

---

### 3.3 Climbs & Segments

#### Categorized Climbs

- Represented by **icons above the profile**
- Shape:
  - Small square/flag
  - Red background (`#E10600`)
  - White mountain icon

- Optional variants:
  - Blue icon for intermediate sprint or special segment

#### Labels

- Vertical or angled text next to climbs:
  - Example:
    `5 km à 5.8%`
- Font:
  - Narrow sans-serif
  - Small size
- Color: `#000000`

---

### 3.4 Key Locations

- Town names placed along the route
- Style:
  - Uppercase
  - Small font
  - Gray or black

---

### 3.5 Finish Marker

- Checkered flag icon
- Positioned at far right
- Label:
  - Example: `CARDIFF`
  - Bold uppercase

---

### 3.6 Elevation Gain Badge

- Positioned top-right
- Rounded rectangle
- Background: yellow (`#FFF200`)
- Text:
  - Example: `3 000 M D+`
  - Bold black text

---

## 4. Typography

### 4.1 Font Style

- Sans-serif, geometric, condensed
- Suggested families:
  - Inter
  - Helvetica Neue Condensed
  - DIN Condensed

---

### 4.2 Font Weights

| Usage                | Weight     |
|---------------------|------------|
| Headings            | Bold       |
| Labels              | Medium     |
| Small annotations   | Regular    |

---

### 4.3 Text Transform

- Mostly **UPPERCASE**
- Tight line height (~0.9–1.1)

---

## 5. Color System

| Purpose              | Color        | HEX       |
|----------------------|-------------|-----------|
| Primary Brand        | Yellow       | `#FFF200` |
| Background Right     | Light Gray   | `#F2F2F2` |
| Text / Lines         | Black        | `#000000` |
| Climb Icons          | Red          | `#E10600` |
| Secondary Icons      | Blue         | `#007AFF` |
| White text/icons     | White        | `#FFFFFF` |

---

## 6. Iconography

### 6.1 Climb Icon

- Red square
- White mountain silhouette
- Slight drop shadow (optional)

### 6.2 Sprint Icon

- Blue square
- Arrow or sprint symbol

### 6.3 Finish Icon

- Checkered flag
- Black & white

---

## 7. Spacing & Grid

- Use **8px base grid**
- Major spacing increments:
  - 16px / 24px / 32px / 48px

- Consistent margins between:
  - Labels and profile
  - Icons and text

---

## 8. Visual Style Principles

### 8.1 High Contrast

- Yellow + black dominates
- Minimal color noise

### 8.2 Information Density

- Many data points
- Still readable due to hierarchy

### 8.3 Directionality

- Left → right flow
- Arrow usage reinforces movement

### 8.4 Broadcast-Friendly

- Large labels
- Clear icons
- Avoid fine detail that disappears on small screens

---

## 9. Implementation Notes (for Coding Agent)

### 9.1 Layout

- Use CSS Grid:
  ```css
  grid-template-columns: 35% 65%;