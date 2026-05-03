Got it — you don’t want multiple conceptual sections or reusable pieces, but **one single, self-contained `.md` file** that a coding agent can directly use to recreate the route profile **end-to-end**.

Here is a **single-file, implementation-ready spec** (design + data + rendering + example all in one place):

---

````md
# Cycling Route Profile – Single File Implementation Spec

## 1. Goal

Render a **professional cycling route profile graphic** identical in style to pro race visuals:

- Yellow filled elevation profile
- Black baseline with distance markers
- Red climb category markers
- Vertical rotated climb labels
- Geographic labels + segmentation
- Start / sprint / finish icons
- Elevation gain badge

Everything needed (design + logic + data + rendering) is defined in this file.

---

## 2. Canvas

```yaml
width: 1200
height: 400
aspect_ratio: 3:1
background: "#F2F2F2"
````

Optional border:

```css
border: 4px solid #FFF200;
border-radius: 8px;
```

---

## 3. Color System

```yaml
yellow: "#FFF200"
black: "#000000"
gray: "#666666"
light_gray: "#F2F2F2"
red: "#E10600"
green: "#2EAD4B"
blue: "#007AFF"
white: "#FFFFFF"
```

---

## 4. Typography

```yaml
font_family: "DIN Condensed, Helvetica Neue Condensed, Inter, sans-serif"

sizes:
  small: 10px
  medium: 12px
  large: 14px

weights:
  regular: 400
  medium: 500
  bold: 700
```

---

## 5. Data Model (Example Input)

```json
{
  "totalDistance": 206,
  "elevationGain": 1850,
  "profile": [
    { "km": 0, "elevation": 74 },
    { "km": 20, "elevation": 120 },
    { "km": 50, "elevation": 480 },
    { "km": 100, "elevation": 300 },
    { "km": 150, "elevation": 420 },
    { "km": 206, "elevation": 40 }
  ],
  "climbs": [
    {
      "km": 49.7,
      "length": 12.5,
      "gradient": 5.1,
      "category": 2,
      "name": "VALICO TRE FAGGI"
    }
  ],
  "sprints": [
    { "km": 83.6 }
  ],
  "locations": [
    { "km": 0, "name": "FLORENCE" },
    { "km": 206, "name": "RIMINI" }
  ],
  "regions": [
    { "start": 0, "end": 100, "name": "FLORENCE" },
    { "start": 100, "end": 206, "name": "RIMINI" }
  ]
}
```

---

## 6. Coordinate Mapping

```js
function mapX(km, totalDistance, width) {
  return (km / totalDistance) * width;
}

function mapY(elevation, minElevation, maxElevation, height) {
  return height - ((elevation - minElevation) / (maxElevation - minElevation)) * height;
}
```

---

## 7. SVG Rendering (FULL STRUCTURE)

```svg
<svg width="1200" height="400">

  <!-- Elevation profile -->
  <path
    d="M0,300 L100,280 L200,200 L400,260 L600,220 L800,180 L1200,300 Z"
    fill="#FFF200"
    stroke="#000000"
    stroke-width="2"
  />

  <!-- Baseline -->
  <rect x="0" y="320" width="1200" height="14" fill="#000000"/>

  <!-- Distance labels -->
  <text x="100" y="315" fill="#FFF200" font-size="12" font-weight="bold">20</text>
  <text x="300" y="315" fill="#FFF200" font-size="12" font-weight="bold">50</text>

  <!-- Climb marker -->
  <rect x="300" y="100" width="24" height="16" fill="#E10600" rx="3"/>
  <text x="312" y="112" fill="#FFFFFF" font-size="12" text-anchor="middle">2</text>

  <!-- Climb guide line -->
  <line x1="312" y1="116" x2="312" y2="260"
        stroke="#999999"
        stroke-dasharray="3,3"/>

  <!-- Rotated climb label -->
  <text transform="rotate(-90 320,200)"
        x="320" y="200"
        font-size="10"
        fill="#000000">
    12.5 km à 5.1% VALICO TRE FAGGI
  </text>

  <!-- Start icon -->
  <rect x="10" y="260" width="16" height="16" fill="#007AFF"/>

  <!-- Sprint icon -->
  <rect x="500" y="240" width="16" height="16" fill="#2EAD4B"/>

  <!-- Finish icon -->
  <rect x="1180" y="250" width="16" height="16" fill="#000000"/>

</svg>
```

---

## 8. Elevation Profile Rules

* Always filled (`#FFF200`)
* Always closed shape to baseline
* Slight smoothing recommended (Bezier curves)
* Vertical exaggeration allowed (~1.2x)

---

## 9. Distance Axis Rules

* Black bar at bottom
* Labels inside or just above
* Format:

  * integers or decimals (comma style optional)

---

## 10. Climb Rules

### Marker

```yaml
shape: rounded rectangle
color: red (#E10600)
text: white
content: category number
```

### Label

```yaml
rotation: -90 degrees
format: "[length] km à [gradient]% [NAME]"
font_size: 10px
color: black
```

### Connection

```yaml
line: dashed
color: #999999
```

---

## 11. Icons

| Type   | Color | Shape     |
| ------ | ----- | --------- |
| Start  | Blue  | Square    |
| Sprint | Green | Square    |
| Finish | Black | Checkered |

---

## 12. Location Labels

```yaml
font_size: 10px
color: #666666
uppercase: true
position: along baseline
```

---

## 13. Region Segmentation

```plaintext
[FLORENCE] -------- [RIMINI]
```

* Thin gray line
* Optional flags below

---

## 14. Elevation Gain Badge

```css
background: #000000;
color: #FFF200;
font-weight: bold;
padding: 6px 12px;
```

Text example:

```
DÉNIVELÉ POSITIF : 1850 M
```

---

## 15. Rendering Order (IMPORTANT)

1. Background
2. Elevation path
3. Baseline
4. Distance labels
5. Climb lines
6. Climb markers
7. Rotated labels
8. Icons (start/sprint/finish)
9. Location labels
10. Regions
11. Elevation badge

---

## 16. Constraints

* No overlapping labels
* Maintain proportional spacing
* Align climb markers exactly above peaks
* Keep high contrast (yellow/black dominant)

---

## 17. Result

Following this file alone, a system can generate a **fully styled professional cycling route profile graphic** with:

* Accurate geometry
* Correct visual hierarchy
* Broadcast-level readability

---

```
```
