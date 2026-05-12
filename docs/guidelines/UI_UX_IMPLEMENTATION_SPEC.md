# OUDENA — UI_UX_IMPLEMENTATION_SPEC.md

Version: 1.0
Platform:
- Desktop Web
- iPad
- iPhone
- Android (Capacitor)

Core Identity:
A calm, cinematic, premium indoor cycling operating system.

Design References:
- Apple
- Tesla
- Nordic minimalism
- Performance technology
- Premium fitness hardware

Core Product Feeling:
“I am riding a familiar road indoors.”
NOT:
“I am operating training software.”

====================================================================
1. GLOBAL UX PRINCIPLES
====================================================================

# 1.1 UX Philosophy

OUDENA is:
- route-first
- immersive
- emotionally restrained
- premium
- technically capable

OUDENA is NOT:
- a dashboard-heavy training tool
- a gamified esports platform
- a noisy social network
- an enterprise analytics product

The ride experience always dominates over analytics.

---

# 1.2 Emotional Tone

The interface should feel:
- calm
- focused
- cinematic
- spatial
- atmospheric
- technically refined

Avoid:
- hype
- overstimulation
- bright gaming aesthetics
- aggressive achievement mechanics

---

# 1.3 Experience Hierarchy

Priority order:

1. Route immersion
2. Terrain understanding
3. Pacing awareness
4. Ride continuity
5. Performance metrics
6. Analytics depth

---

# 1.4 Information Density Rules

Prefer:
- whitespace
- progressive disclosure
- glanceable metrics
- contextual reveal

Avoid:
- always-visible advanced analytics
- dense data tables
- excessive simultaneous information

Ride screen:
max 4 visible primary metrics.

---

# 1.5 Interaction Philosophy

Interactions should feel:
- immediate
- smooth
- physically stable
- calm

Avoid:
- bounce-heavy motion
- flashy transitions
- gamified feedback

---

# 1.6 Product Personality

The product should feel like:
“An Apple-designed cycling operating system for adults.”

====================================================================
2. VISUAL SYSTEM
====================================================================

# 2.1 Color Philosophy

Primary palette:
- titanium gray
- glacier blue
- off-white
- charcoal
- muted graphite

Accent usage:
minimal and intentional.

Avoid:
- neon
- rainbow gradients
- esports palettes
- oversaturated colors

---

# 2.2 Primary Colors

Background Light:
#F4F6F5

Background Dark:
#1B2127

Primary Text:
#1D242D

Secondary Text:
rgba(29,36,45,0.68)

Accent Glacier:
#74AFCB

Accent Muted:
#91A8B5

Border Light:
rgba(29,36,45,0.08)

---

# 2.3 Typography

Typography style:
- minimal
- premium
- high readability
- restrained

Recommended:
- SF Pro
- Inter

Primary metric typography:
- tabular numerals
- large scale
- medium weight

Sizes:

Primary Metrics:
28–40px

Secondary Metrics:
16–20px

Body:
14–18px

---

# 2.4 Spacing System

Base spacing:
8pt system

Spacing scale:
4
8
12
16
24
32
48
64

---

# 2.5 Radius System

Cards:
20px

Buttons:
999px

Drawers:
24px

---

# 2.6 Shadow System

Use:
- subtle elevation only
- soft atmospheric depth

Avoid:
- harsh shadows
- gaming glow effects

====================================================================
3. LAYOUT SYSTEM
====================================================================

# 3.1 Breakpoints

mobile:
0–639px

tablet:
640–1023px

desktop:
1024–1439px

wide:
1440px+

---

# 3.2 Grid System

Desktop:
12-column

Tablet:
8-column

Mobile:
4-column

---

# 3.3 Layout Philosophy

Desktop:
cinematic immersive workspace

Tablet:
cockpit-like touch console

Mobile:
companion-first simplified experience

---

# 3.4 Ride Layout

 ---------------------------------------------------------
| Top Metrics              Ghost Delta                   |
|--------------------------------------------------------|
|                                                        |
|                                                        |
|                 Route Visualization                    |
|                                                        |
|                                                        |
|--------------------------------------------------------|
| Elevation Timeline                                     |
|--------------------------------------------------------|
| Ride Controls                    Secondary HUD         |
 ---------------------------------------------------------

---

# 3.5 Layout Ratios

Route Visualization:
70%

HUD:
15%

Elevation:
15%

During climb state:
elevation expands.

---

# 3.6 Overlay Rules

All overlays:
- translucent
- blurred
- lightweight
- context-preserving

Light:
rgba(255,255,255,0.72)

Dark:
rgba(27,33,39,0.72)

Blur:
12–18px

---

# 3.7 Sidebar

Collapsed by default.

Ride mode:
hidden.

Sidebar should never dominate the screen.

====================================================================
4. COMPONENT SYSTEM
====================================================================

# 4.1 Button

Variants:
- primary
- secondary
- tertiary

Primary:
glacier accent filled button

Rules:
- min height 44px
- pill radius
- restrained hover
- one dominant CTA per screen

States:
- default
- hover
- active
- focused
- disabled
- loading

---

# 4.2 MetricTile

Purpose:
glanceable ride metrics.

Props:
- label
- value
- unit
- trend
- emphasis
- size

Rules:
- value dominant
- labels secondary
- tabular numerals
- max 4 primary metrics

---

# 4.3 RouteCard

Required:
- route preview
- route name
- distance
- elevation gain
- ghost availability

Optional:
- duration
- seasonal context
- favorite state

Rules:
- preview dominates
- emotional recognition > metadata

---

# 4.4 ElevationProfile

Required:
- rider marker
- ghost marker
- climbs
- descents
- distance progression

States:
- normal
- compact
- expanded
- climb focus

Rules:
- smooth curves
- low clutter
- terrain rhythm focused

---

# 4.5 GhostMarker

Rules:
- translucent
- subtle glow
- muted accent
- no avatars
- no racing visuals

Ghost pass:
soft pulse only.

---

# 4.6 RideHUD

Contains:
- primary metrics
- ghost delta
- elevation profile
- controls

Rules:
- preserve map visibility
- lightweight overlays only

---

# 4.7 RideControls

Controls:
- pause
- resume
- ghost toggle
- ERG toggle
- resistance mode
- end ride

Rules:
- secondary visual priority
- touch-friendly
- non-aggressive

---

# 4.8 Drawer

Used for:
- advanced settings
- analytics
- trainer options

Rules:
- contextual
- lightweight
- preserve route continuity

---

# 4.9 DeviceCard

Required:
- device name
- status
- battery
- signal

States:
- searching
- connecting
- connected
- reconnecting
- error

====================================================================
5. SCREEN SPECIFICATIONS
====================================================================

# 5.1 HOME

Purpose:
Personal cycling hub.

Hierarchy:
1. Hero recommendation
2. Continue riding
3. Routes worth revisiting
4. Ghost challenges
5. Seasonal insights

Rules:
- emotionally familiar
- not statistics-first

Hero card:
- cinematic route preview
- large CTA
- restrained metadata

Empty states:
- connect Strava
- import rides
- complete first route

---

# 5.2 ROUTE BROWSER

Purpose:
Discover and revisit routes.

Rules:
- calm exploration
- large previews
- lightweight filters

Filters:
- easy
- recovery
- climb-heavy
- ghost available
- favorites

Avoid:
- enterprise filtering systems

---

# 5.3 ROUTE DETAIL

Hierarchy:
1. route visualization
2. elevation
3. start ride CTA
4. ghost comparison
5. advanced settings

Advanced settings:
- ERG
- trainer difficulty
- reverse route
- trimming
- pacing

Rules:
- advanced collapsed by default

---

# 5.4 LIVE RIDE SCREEN

Core screen of the product.

Primary feeling:
immersive route riding.

Hierarchy:
1. route visualization
2. elevation timeline
3. ghost pacing
4. metrics
5. controls

Primary Metrics:
- power
- cadence
- HR
- speed

Advanced metrics:
hidden by default.

Ride States:
- riding
- climbing
- descending
- paused
- reconnecting
- completed

Ghost riding:
- personal
- atmospheric
- reflective

NOT:
- competitive esports racing

Climb State:
- expanded elevation profile
- stronger terrain emphasis
- closer camera framing

Pause State:
- route dims subtly
- controls expand
- ride continuity preserved

Reconnect State:
- preserve ride state
- automatic reconnect attempts
- calm recovery UX

Rules:
- no dashboard feel
- no modal interruption
- preserve immersion

---

# 5.5 RIDE SUMMARY

Purpose:
reflective cooldown.

Sections:
- ride hero
- route replay
- key metrics
- pacing insights
- ghost comparison
- suggested next ride

Rules:
- calm
- reflective
- emotionally mature

Avoid:
- trophies
- loud celebrations
- achievement spam

---

# 5.6 ANALYTICS

Purpose:
understanding over obsession.

Layering:
1. overview
2. ride detail
3. advanced analytics

Allowed:
- pacing trends
- cadence consistency
- climbing patterns
- route comparisons

Avoid:
- finance dashboard look
- dense chart walls

Charts:
- monochrome-first
- restrained accents
- subtle grids

---

# 5.7 DEVICES

Purpose:
reduce technical anxiety.

Priority:
1. trainer readiness
2. connection clarity
3. recovery flows

Good:
“Trying to reconnect…”

Bad:
“BLE FTMS protocol failure.”

Rules:
- hide technical complexity
- preserve confidence

---

# 5.8 SETTINGS

Categories:
- ride
- trainer
- visuals
- audio
- integrations
- notifications
- advanced

Rules:
- beginner-friendly first
- advanced collapsed
- immediate previews where possible

====================================================================
6. RIDE STATE MACHINE
====================================================================

States:
- idle
- preparing
- countdown
- riding
- climbing
- descending
- paused
- reconnecting
- completed
- error

---

# idle → preparing

Sequence:
1. route expands
2. navigation fades
3. HUD initializes
4. trainer preparation begins

---

# preparing → countdown

Triggered:
trainer + route ready

Sequence:
1. HUD sharpens
2. countdown appears
3. route zooms subtly

---

# countdown → riding

Sequence:
1. countdown fades
2. movement begins
3. ghost activates

---

# riding → climbing

Triggered:
sustained gradient threshold

Changes:
- elevation expands
- terrain emphasis increases
- camera lowers slightly

---

# climbing → riding

Sequence:
- camera relaxes
- elevation normalizes

---

# paused

Changes:
- route dims subtly
- controls expand
- camera stabilizes

---

# reconnecting

Rules:
- preserve ride state
- automatic reconnect
- calm overlay

---

# completed

Sequence:
1. ghost fades
2. camera widens
3. summary transition begins

====================================================================
7. MOTION SYSTEM
====================================================================

Principles:
- inertial
- restrained
- physically stable

Primary easing:
cubic-bezier(0.22,1,0.36,1)

Timing:

micro:
120–150ms

panel:
250–350ms

screen:
350–600ms

ride transition:
600–1200ms

camera:
800–1500ms

Avoid:
- bounce
- overshoot
- flashy motion

---

# Camera Motion

Default:
- smooth follow
- stable framing
- subtle anticipation

Climb:
- lower angle
- closer framing

Descent:
- wider framing

Reduced motion:
- stabilize camera
- reduce cinematic drift

---

# HUD Motion

Use:
- fade
- slight translation
- smooth interpolation

Avoid:
- flashing updates
- jitter

---

# Loading Motion

Use:
- skeletons
- progressive reveal

Never:
blank screens.

====================================================================
8. RESPONSIVE SYSTEM
====================================================================

Desktop:
cinematic flagship experience

Tablet:
touch-native cockpit

Mobile:
companion-first

---

# Mobile Ride HUD

Visible:
- power
- cadence
- ghost delta

Optional:
heart rate

---

# Mobile Rules

- single-column layouts
- simplified overlays
- thumb-accessible controls

Avoid:
compressed desktop layouts.

---

# Landscape

- fullscreen route emphasis
- compact HUD
- hidden navigation

---

# Responsive Priority

Hide first:
- advanced analytics
- secondary charts
- advanced metrics

Preserve first:
- route visualization
- primary metrics
- controls
- elevation profile

====================================================================
9. MICROCOPY SYSTEM
====================================================================

Tone:
- calm
- intelligent
- reflective
- restrained

Avoid:
- hype
- gym clichés
- esports language
- manipulative retention copy

Good:
“Your pacing remained stable.”

Bad:
“You crushed this ride!”

---

# CTAs

Good:
- Start Ride
- Resume Ride
- Ride Again
- Connect Trainer

Avoid:
- Dominate
- Crush It
- Push Harder

---

# Ghost Messaging

Good:
“You are 12 seconds ahead.”

Avoid:
“You are winning!”

---

# Error Messaging

Good:
“Trainer connection interrupted.”

Avoid:
technical jargon.

====================================================================
10. ACCESSIBILITY
====================================================================

WCAG:
AA minimum

Ride metrics:
AAA preferred

---

# Typography

Primary metrics:
28–40px

Body:
14–18px

---

# Touch Targets

Minimum:
44px

Preferred:
48–56px

---

# Reduced Motion

Disable:
- cinematic drift
- large transitions
- staggered reveals

---

# Screen Reader Events

Announce:
- ride started
- ride paused
- trainer disconnected
- ride completed

---

# Fatigue-Aware UX

Rules:
- stable layouts
- predictable controls
- large metrics
- minimal interruptions

====================================================================
11. PERFORMANCE RULES
====================================================================

Target:
60fps

Prefer:
- transform
- opacity

Avoid:
- layout thrashing
- expensive blur animation
- unnecessary rerenders

Mobile:
reduce heavy effects.

====================================================================
12. VISUAL QA CHECKLIST
====================================================================

Global:
- calm?
- premium?
- immersive?
- technically refined?

Route Visualization:
- visually dominant?
- terrain readable?
- overlays restrained?

HUD:
- readable at glance?
- too many metrics?
- stable updates?

Ghost:
- atmospheric?
- subtle?
- non-competitive?

Motion:
- smooth?
- orientation-preserving?
- free of jitter?

Responsive:
- intentionally designed?
- mobile not compressed desktop?

Typography:
- readable during effort?
- hierarchy clear?

Analytics:
- insight-first?
- dashboard feel avoided?

Accessibility:
- touch accessible?
- reduced motion supported?
- keyboard accessible?

Final Emotional Test:
The product should feel like:

“An Apple-designed indoor cycling operating system for adults.”

NOT:

“A gamified cycling app.”