# OUDENA — UI & UX Guidelines

Version: 2.0

# 1. UX Vision

OUDENA is a calm and premium indoor cycling operating system focused on:
- real-world riding history
- immersive route replay
- ghost pacing
- elegant performance feedback
- emotional continuity between rides

The experience should feel:
- focused
- calm
- frictionless
- technically capable
- emotionally intelligent

Never:
- noisy
- childish
- overstimulating
- esports-oriented
- dashboard-heavy

---

# 2. UX Philosophy

## Calm First
Reduce cognitive load continuously.

## Road First, Metrics Second
The ride experience dominates visually.

## Progressive Disclosure
Advanced functionality only appears when needed.

## Quiet Confidence
Feedback should feel mature and restrained.

## Motion Guides Attention
Animation improves orientation and flow.

## Layered Complexity
Beginners see simplicity.
Advanced users can discover depth progressively.

---

# 3. Primary User Groups

## Casual Indoor Cyclists
Need:
- low friction
- simplicity
- motivation
- visually pleasant experience

## Older Hobby Cyclists
Need:
- reliability
- clarity
- readability
- calm interaction

## Data-Oriented Cyclists
Need:
- pacing detail
- layered analytics
- precision
- historical comparison

---

# 4. Information Architecture

## Desktop Navigation

- Home
- Ride
- Routes
- History
- Analytics
- Devices
- Settings

## Mobile Navigation

- Home
- Ride
- History
- Profile

---

# 5. Beginner vs Advanced UX

## Beginner Mode (Default)

Visible:
- connect trainer
- select route
- start ride
- basic metrics

Hidden:
- advanced trainer setup
- pacing analysis
- ERG customization
- route editing

Goal:
reduce onboarding anxiety.

---

## Advanced Mode

Unlocks:
- advanced pacing overlays
- structured workout overlays
- ghost analytics
- detailed trainer setup
- advanced ride analytics

Advanced mode should feel:
- organized
- powerful
- not intimidating

---

# 6. Core User Flows

## First Launch Flow

1. Welcome
2. Connect Trainer
3. Connect Strava
4. Import Routes
5. Select Ride
6. Start Riding

Goal:
first ride within 3–5 minutes.

---

## Returning User Flow

1. Open app
2. View recommended ride
3. Continue or select route
4. Start ride immediately

Goal:
minimal friction.

---

# 7. Home Screen

## UX Goal

The home screen should feel like:
“Your personal indoor cycling studio.”

---

## Main Sections

### Hero Recommendation
Large personalized route recommendation:
- route preview
- elevation profile
- previous performance
- duration estimate
- Start Ride CTA

### Continue Riding
Recent and unfinished rides.

### Routes Worth Revisiting
Historically meaningful rides.

### Seasonal Comparisons
Performance trends over time.

### Ghost Challenges
Asynchronous ride comparison.

### Recovery Suggestions
Low-intensity recommendations.

---

## Home Screen Rules

- max 5 primary content sections
- one dominant CTA
- low visual density
- emotional relevance prioritized over statistics

---

# 8. Route Selection UX

## Goals

- fast route discovery
- low cognitive load
- emotional connection to routes

---

## Route Cards

Each card includes:
- route preview map
- elevation profile
- distance
- elevation gain
- last attempt
- ghost availability

---

## Filters

### Beginner
- easy
- flat
- short
- recovery

### Advanced
- endurance
- climb-heavy
- pacing challenge
- interval-compatible

---

# 9. Route Detail Screen

## Purpose

Convert intent into immediate riding.

---

## Required Content

- route map
- elevation profile
- estimated duration
- distance
- elevation gain
- previous ride
- best ride
- ghost availability

---

## Advanced Drawer

Contains:
- reverse route
- route trimming
- ERG mode
- trainer difficulty
- pacing target

Collapsed by default.

---

# 10. Live Ride Experience

## UX Goal

The rider should feel:
- immersed
- focused
- technically empowered
- emotionally connected to the ride

---

## Layout Structure

### Top Left
Primary metrics:
- power
- cadence
- heart rate

### Top Right
Ghost delta and pacing status.

### Center
Main route visualization.

### Bottom
Persistent elevation timeline.

### Bottom Right
Ride controls:
- pause
- ghost toggle
- ERG mode
- resistance mode

---

# 11. Ride Visualization

## Visual Style

- monochrome terrain
- dawn atmosphere
- cinematic movement
- subtle contouring
- restrained colors

---

## Camera Modes

### Flow View
Default cinematic movement.

### Climb Focus
Expanded terrain perspective.

### Topographic View
Analytical mode.

---

## Avoid

- arcade visuals
- cartoon environments
- exaggerated 3D
- game aesthetics

---

# 12. Ride States

## Normal State
Balanced information density.

## Climb State
Triggered automatically.

Changes:
- expanded elevation profile
- increased ghost emphasis
- reduced peripheral metrics
- adjusted map zoom

## Recovery State
Lower visual intensity.

## Sprint State
Slightly increased visual tension.

---

# 13. Ghost Rider UX

## Philosophy

Ghost riding should feel:
- elegant
- motivating
- subtle
- personal

Never:
- aggressive
- esports-like
- arcade-oriented

---

## Ghost Visualization

- translucent rider marker
- soft glow
- subtle pacing animation

---

## Ghost Feedback

### Closing Gap
Opacity increases slightly.

### Passing Ghost
Soft pulse and smooth transition.

### Losing Pace
Delta gains subtle emphasis.

---

# 14. Elevation Timeline UX

## Philosophy

The elevation profile represents:
“The emotional timeline of the ride.”

---

## Timeline Contents

- rider position
- ghost position
- climbs
- descents
- pacing zones
- PR segments

---

## Adaptive Behavior

### During Climbs
Profile expands automatically.

### During Flats
Profile compresses slightly.

---

# 15. Ride Summary UX

## Goal

Create:
- reflection
- satisfaction
- retention

---

## Structure

### Narrative Insight
Maximum 1–2 insights.

Examples:
- “Your pacing improved on sustained climbs.”
- “This was your strongest climb this month.”

### Effort Timeline
Visual pacing breakdown.

### Key Metrics
- average power
- pacing consistency
- climbing efficiency
- cadence stability

### Suggested Next Ride
Encourage continuity.

---

# 16. Analytics UX

## Principle

Layered complexity.

---

## Levels

### Level 1
Simple trends.

### Level 2
Ride breakdowns.

### Level 3
Advanced pacing analysis.

---

## Analytics Rules

- interpretation over raw data
- preserve whitespace
- avoid dense dashboards by default

---

# 17. Motion Design

## Motion Philosophy

“Everything glides.”

---

## Animation Rules

Avoid:
- bounce
- overshoot
- exaggerated motion

Prefer:
- inertial movement
- smooth easing
- cinematic transitions

---

## Timing

| Interaction | Duration |
|---|---|
| Tap | 120ms |
| Hover | 150ms |
| Expand | 250ms |
| Modal | 350ms |
| Cinematic | 600ms |

---

## Easing

cubic-bezier(0.22, 1, 0.36, 1)

---

# 18. Microinteractions

## Trainer Connected
Soft confirmation animation.

## Route Selection
Subtle elevation and glow.

## Ride Start Ritual

1. fullscreen transition
2. map zoom
3. trainer engagement
4. countdown
5. ride start

---

## Ride Completion

- ghost fades
- map zooms out
- summary appears progressively

---

# 19. Accessibility

- minimum touch target: 44px
- WCAG AA contrast
- scalable typography
- keyboard accessibility
- color-independent communication

---

# 20. UX Performance Requirements

Performance is part of UX.

Targets:
- 60fps minimum
- smooth interpolation
- stable trainer communication
- minimal loading interruption

Priorities:
1. smoothness
2. responsiveness
3. reliability
4. visual polish