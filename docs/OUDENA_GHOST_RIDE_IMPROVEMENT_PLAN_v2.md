# OUDENA Ghost Ride Improvement Plan

## 1. Goal

Improve the ghost ride experience by correcting two main realism problems:

1. **Ghost stop problem**  
   Strava/FIT ghost rides often include waiting at traffic lights, crossings, junctions, or pauses. During replay, the ghost can stop while the current user continues riding. This feels unfair and breaks racing immersion.

2. **Curve realism problem**  
   The user can ride constantly indoors, while a real outdoor rider naturally slows down for curves, crossings, descents into turns, and technical sections. Without correction, the indoor rider can gain unrealistic progress in curves.

The target experience is:

> The ghost should behave like a cleaned real ride: no traffic-light waiting, no GPS jumps, no unnatural teleporting, but still preserving real riding character such as slower curves, climbs, descents, and acceleration patterns.

All ghost modifications shall be calculated **offline at route load/startup**, not during the live ride.

---

## 2. Core Design Decision

Use two separate correction layers:

```text
Layer 1: Ghost preprocessing at startup
- Clean GPS data
- Remove waiting/stopping time
- Rebuild moving-time timeline
- Smooth ghost speed
- Preserve real route geometry and realistic movement

Layer 2: Runtime user progress correction
- Apply route-based curve speed limits to the user's virtual progress
- Do not change trainer resistance in the MVP
- Keep user pedaling feeling smooth while route progress becomes realistic
```

This separation keeps the system understandable, testable, and user-friendly.

---

## 3. High-Level Architecture

```text
App startup / route loading
        |
        v
Load FIT route data
        |
        v
Extract raw samples
        |
        v
Clean GPS and sensor data
        |
        v
Detect pauses / waiting zones
        |
        v
Compress ghost timeline
        |
        v
Smooth speed and timestamps
        |
        v
Calculate curvature and curve speed limits
        |
        v
Store corrected route profile in local cache
        |
        v
Runtime ride engine uses preprocessed profile
```

---

## 4. Input Data Assumptions

The primary input is probably **FIT data**.

The importer should try to extract the following fields if available:

| Field | Required | Purpose |
|---|---:|---|
| Latitude | Yes | Route geometry |
| Longitude | Yes | Route geometry |
| Timestamp | Strongly recommended | Ghost replay and stop detection |
| Distance | Recommended | Progress calculation |
| Speed | Optional | Stop detection and smoothing |
| Altitude | Recommended | Gradient and downhill curve correction |
| Power | Optional | Future realism analysis |
| Cadence | Optional | Future realism analysis |
| Heart rate | Optional | Not needed for MVP |

If FIT does not provide speed or distance, calculate them from GPS coordinates and timestamps.

---

## 5. Output Data Model

Create a preprocessed route object that can be stored locally and reused.

Suggested structure:

```python
@dataclass
class RouteSample:
    index: int
    lat: float
    lon: float
    raw_time_s: float
    corrected_time_s: float
    raw_distance_m: float
    corrected_distance_m: float
    elevation_m: float | None
    raw_speed_mps: float | None
    corrected_speed_mps: float
    gradient: float | None
    curvature: float | None
    curve_radius_m: float | None
    curve_speed_limit_mps: float | None
    is_removed_stop_time: bool
    quality_flag: str | None
```

```python
@dataclass
class PreprocessedRoute:
    route_id: str
    source_file_hash: str
    preprocessing_version: str
    created_at: str
    samples: list[RouteSample]
    total_distance_m: float
    raw_duration_s: float
    corrected_duration_s: float
    removed_stop_time_s: float
    removed_stop_count: int
    warnings: list[str]
```

---

## 6. Startup Preprocessing Pipeline

### Step 1: Load route

At app startup or route selection:

1. Load FIT file.
2. Extract available messages.
3. Convert all samples into a normalized internal list.
4. Sort samples by timestamp.
5. Drop samples with invalid coordinates.

Acceptance criteria:

- Route loads without crashing when optional fields are missing.
- Invalid GPS coordinates are ignored.
- Duplicate timestamps are handled.

---

### Step 2: Normalize time and distance

Create normalized fields:

```text
raw_time_s = timestamp - first_timestamp
raw_distance_m = FIT distance if available, else cumulative haversine distance
```

Rules:

- Distance must always be monotonic.
- If FIT distance decreases, repair it using calculated GPS distance.
- If timestamps are missing, create a synthetic timeline only as fallback.

Recommended fallback sample interval:

```text
1 second per sample if no timestamps exist
```

But if timestamps are missing, ghost racing accuracy should be marked as degraded.

---

### Step 3: GPS cleaning

Goal: remove bad jumps without destroying real corners.

Detect suspicious points using:

```text
segment_distance_m / delta_time_s > 20 m/s
```

20 m/s = 72 km/h. This is already high for many cycling routes but avoids removing fast descents too aggressively.

Also detect points where:

```text
segment_distance_m > 80 m within 1-2 seconds
```

Treatment:

- Do not immediately delete large parts of the route.
- Mark suspicious samples with quality flags.
- Interpolate through single-point spikes.
- For longer bad sections, keep geometry but reduce confidence and avoid using them for stop or curve detection.

Suggested quality flags:

```text
OK
GPS_SPIKE
GPS_GAP
INTERPOLATED
LOW_CONFIDENCE
```

---

### Step 4: Interpolation and resampling

Create an internal working profile at a stable resolution.

Recommended offline preprocessing resolution:

```text
1 Hz route profile
```

Runtime can still run at 4 Hz or higher by interpolating from the preprocessed route profile.

Why 1 Hz is enough for preprocessing:

- FIT/GPS data is usually around 1 Hz.
- Stop detection does not need higher precision.
- Curve radius can be calculated from distance-windowed geometry, not from every raw point.
- It keeps startup preprocessing lightweight.

Runtime recommendation:

```text
4 Hz user progress update
```

---

## 7. Stop / Waiting Detection

### 7.1 Definition

A stop is not simply low speed. A stop is a period where the rider makes nearly no route progress.

Use hybrid detection:

```text
candidate_stop = speed < 1.0 km/h
              OR movement_distance < 3 m over a 5 s window
```

A stop is confirmed when:

```text
duration > 5 s
AND route progress is nearly zero
```

Recommended thresholds:

```python
STOP_MIN_DURATION_S = 5.0
STOP_SPEED_THRESHOLD_MPS = 0.28      # approx. 1 km/h
STOP_DISTANCE_WINDOW_M = 3.0
STOP_WINDOW_S = 5.0
MAX_PROGRESS_DURING_STOP_M = 5.0
```

---

### 7.2 What to remove

Remove waiting time only, not route geometry.

Remove:

- traffic-light waiting
- crossing waiting
- junction waiting
- manual short pause without progress
- long uphill standing sections only if there is no progress

Keep:

- slow climbing with progress
- technical cornering with progress
- slow riding through narrow paths
- short junction slowdowns where the rider continues moving
- real acceleration and deceleration patterns around curves

---

### 7.3 Stop detection algorithm

Pseudo-code:

```python
def detect_stops(samples):
    stop_candidates = []

    for each sliding window of STOP_WINDOW_S:
        duration = window.end_time - window.start_time
        distance_progress = window.end_distance - window.start_distance
        avg_speed = distance_progress / duration
        gps_movement = distance_between(window.first_point, window.last_point)

        is_candidate = (
            avg_speed < STOP_SPEED_THRESHOLD_MPS
            or gps_movement < STOP_DISTANCE_WINDOW_M
        )

        if is_candidate and distance_progress < MAX_PROGRESS_DURING_STOP_M:
            mark window as stop candidate

    merge adjacent candidate windows

    confirmed_stops = []
    for candidate in merged_candidates:
        if candidate.duration > STOP_MIN_DURATION_S:
            confirmed_stops.append(candidate)

    return confirmed_stops
```

---

## 8. Ghost Timeline Compression

### 8.1 Principle

Do not delete route points. Delete only waiting time.

Example:

```text
Raw timeline:
A at 120 s
stop for 20 s
B at 145 s

Corrected timeline:
A at 120 s
B at 125 s
```

The ghost still moves through the same route, but waiting time is removed.

---

### 8.2 Corrected timestamp calculation

For each sample:

```python
corrected_time_s = raw_time_s - cumulative_removed_stop_time_before_sample
```

For samples inside a stop region:

Option A, recommended for MVP:

```text
Collapse stop samples into a single representative sample at stop start.
```

Option B, more complex:

```text
Keep stop samples but assign almost identical corrected timestamps.
```

Use Option A for cleaner runtime interpolation.

---

### 8.3 Stop segment representation

Store metadata for debugging and future UI:

```python
@dataclass
class RemovedStopSegment:
    raw_start_time_s: float
    raw_end_time_s: float
    duration_s: float
    start_distance_m: float
    end_distance_m: float
    reason: str
```

Reasons:

```text
NO_PROGRESS
LOW_SPEED_NO_DISTANCE
GPS_STATIONARY
MANUAL_PAUSE_LIKELY
```

---

## 9. Speed Smoothing After Stop Removal

### 9.1 Problem

After removing waiting time, the ghost can appear to accelerate too strongly or move inconsistently around the removed stop.

### 9.2 Solution

Apply local smoothing around each removed stop.

Recommended smoothing window:

```python
SMOOTHING_BEFORE_STOP_S = 4.0
SMOOTHING_AFTER_STOP_S = 6.0
```

Smooth corrected speed using a moving median plus low-pass smoothing.

Suggested approach:

1. Calculate speed from corrected distance/time.
2. Apply rolling median to remove spikes.
3. Apply exponential smoothing or Savitzky-Golay style smoothing if available.
4. Recalculate corrected timestamps from smoothed speed if needed.

MVP recommendation:

```text
Smooth speed for display and interpolation, but keep corrected_time_s monotonic and stable.
```

---

### 9.3 Speed constraints

Clamp corrected speed to realistic values:

```python
MIN_MOVING_SPEED_MPS = 0.5      # 1.8 km/h
MAX_REASONABLE_SPEED_MPS = 25.0 # 90 km/h
```

If calculated speed exceeds the max due to GPS or timestamp problems:

- mark section as low confidence
- smooth across the section
- do not allow ghost teleporting

---

## 10. Curve Detection and Curve Speed Limits

### 10.1 Goal

Detect where a real rider would naturally slow down and use this profile at runtime to limit user route progress.

This should be invisible to the user in normal mode.

---

### 10.2 Route smoothing before curvature calculation

Raw GPS points are noisy. Never calculate curvature directly on unfiltered raw GPS.

Recommended preprocessing:

1. Resample route by distance, not by time.
2. Use points every 2-5 meters.
3. Apply light path smoothing.
4. Calculate curvature from a distance window.

Recommended values:

```python
CURVE_RESAMPLE_DISTANCE_M = 3.0
CURVE_LOOKAHEAD_WINDOW_M = 15.0
CURVE_SMOOTHING_WINDOW_M = 12.0
```

---

### 10.3 Radius calculation

For each route point, calculate local curve radius from three points:

```text
previous point, current point, next point
```

Use points separated by a fixed distance window, for example 10-15 m.

If the three points are nearly straight, radius is very large.

Simplified formula idea:

```text
curvature = heading_change / distance_window
radius = 1 / curvature
```

This is easier and robust enough for MVP.

---

### 10.4 Curve speed limit model

Start with a simple table-based model.

| Curve radius | Suggested max speed |
|---:|---:|
| < 10 m | 8-12 km/h |
| 10-25 m | 12-20 km/h |
| 25-60 m | 20-35 km/h |
| > 60 m | no strong limit |

Implementation default:

```python
def base_curve_speed_limit(radius_m):
    if radius_m is None:
        return None
    if radius_m < 10:
        return 3.0   # 10.8 km/h
    if radius_m < 25:
        return 5.0   # 18 km/h
    if radius_m < 60:
        return 8.0   # 28.8 km/h
    return None      # no curve cap
```

---

### 10.5 Downhill correction

On descents, sharp curves should limit progress more strongly.

Recommended simple correction:

```python
def apply_downhill_curve_correction(speed_limit_mps, gradient):
    if speed_limit_mps is None:
        return None
    if gradient is None:
        return speed_limit_mps

    # gradient is decimal, e.g. -0.06 = -6%
    if gradient < -0.08:
        return speed_limit_mps * 0.75
    if gradient < -0.05:
        return speed_limit_mps * 0.85
    if gradient < -0.03:
        return speed_limit_mps * 0.93

    return speed_limit_mps
```

---

### 10.6 Acceleration after curves

Do not instantly return to full speed after a curve.

Use a virtual acceleration limit:

```python
MAX_VIRTUAL_ACCEL_MPS2 = 1.0
MAX_VIRTUAL_DECEL_MPS2 = 1.5
```

This creates a natural slow-in / accelerate-out behavior.

---

## 11. Runtime User Progress Correction

### 11.1 MVP behavior

Do not alter trainer resistance for curve handling.

Runtime logic:

```python
physics_speed = calculate_from_power_trainer_gradient(...)
curve_limit = route_profile.curve_speed_limit_at(user_distance)

if curve_limit is not None:
    target_virtual_speed = min(physics_speed, curve_limit)
else:
    target_virtual_speed = physics_speed

virtual_speed = apply_accel_decel_smoothing(previous_virtual_speed, target_virtual_speed)
user_distance += virtual_speed * dt
```

This means:

- User can keep pedaling normally.
- Route progress slows in curves.
- Ghost comparison becomes fairer.
- No annoying artificial resistance spikes.

---

### 11.2 No UI warning in normal mode

Do not show messages like:

```text
Sharp curve ahead - speed limited
```

Reason:

- It breaks immersion.
- The rider cannot steer anyway.
- The system should feel natural, not punitive.

Optional developer overlay only:

```text
curve cap active: 24 km/h
radius: 34 m
confidence: high
```

---

## 12. Ghost Runtime Replay

At runtime, ghost position should be queried from the preprocessed corrected timeline.

```python
ghost_sample = route_profile.sample_at_corrected_time(ride_elapsed_time_s)
```

Alternative if race comparison should be distance-based:

```python
ghost_time_at_user_distance = route_profile.corrected_time_at_distance(user_distance_m)
time_gap_s = user_elapsed_time_s - ghost_time_at_user_distance
```

Recommended racing comparison:

```text
Use distance-based time gap.
```

Reason:

- It avoids visual confusion.
- It shows whether the user is ahead or behind at the same route position.
- It is more stable than comparing screen positions only.

---

## 13. Caching Strategy

Because preprocessing is done offline at startup, cache the corrected route profile.

Cache key:

```text
source_file_hash + preprocessing_version
```

If either changes, rebuild cache.

Suggested cache files:

```text
/routes/raw/{route_id}.fit
/routes/cache/{route_id}_{hash}_{version}.json
/routes/cache/{route_id}_{hash}_{version}.parquet   # optional later
```

For MVP, JSON is acceptable. For larger routes, use compressed JSON or parquet.

---

## 14. Configuration Defaults

Create a config file:

```python
@dataclass
class GhostPreprocessingConfig:
    preprocessing_version: str = "ghost_preprocessing_v1"

    resample_hz: float = 1.0

    stop_min_duration_s: float = 5.0
    stop_speed_threshold_mps: float = 0.28
    stop_distance_window_m: float = 3.0
    stop_window_s: float = 5.0
    max_progress_during_stop_m: float = 5.0

    gps_spike_speed_mps: float = 20.0
    gps_spike_distance_m: float = 80.0

    smoothing_before_stop_s: float = 4.0
    smoothing_after_stop_s: float = 6.0

    min_moving_speed_mps: float = 0.5
    max_reasonable_speed_mps: float = 25.0

    curve_resample_distance_m: float = 3.0
    curve_lookahead_window_m: float = 15.0
    curve_smoothing_window_m: float = 12.0

    max_virtual_accel_mps2: float = 1.0
    max_virtual_decel_mps2: float = 1.5
```

---

## 15. Edge Case Handling

### 15.1 Strava auto-pause already removed stops

If no stop segments are detected:

```text
Do nothing. Route is already moving-time-like.
```

Do not try to invent missing time.

---

### 15.2 Manual pause

Manual pauses without distance progress should be treated the same as traffic-light stops for MVP.

Reason:

- From the racing experience perspective, both are non-riding waiting time.

Future enhancement:

- Detect long manual breaks separately and ask whether to remove them.

---

### 15.3 GPS jumps

If GPS jumps create unrealistic speed:

- flag as GPS spike
- interpolate if short
- smooth if medium
- mark low confidence if long
- never allow ghost teleporting

---

### 15.4 Missing data

If data is missing:

| Missing field | Fallback |
|---|---|
| Speed | calculate from distance/time |
| Distance | calculate from GPS |
| Elevation | no gradient/downhill correction |
| Timestamp | synthetic timeline, degraded racing accuracy |
| Power | ignore for MVP |

---

### 15.5 Uphill slow sections

Do not remove slow uphill riding if there is progress.

Only remove if:

```text
progress over stop window is nearly zero
AND duration > 5 seconds
```

---

## 16. Test Scenarios

Create synthetic and real test routes.

### Test 1: Traffic light stop

Input:

```text
Rider moves, waits 20 seconds, continues.
```

Expected:

- stop detected
- 20 seconds removed
- ghost does not pause
- no visual jump

---

### Test 2: Slow uphill climb

Input:

```text
Rider climbs slowly at 4-6 km/h for several minutes.
```

Expected:

- no stop removed
- slow movement preserved

---

### Test 3: Sharp curve

Input:

```text
Route contains 90-degree turn or hairpin.
```

Expected:

- curve radius detected
- curve speed limit generated
- user progress is capped in this area

---

### Test 4: GPS spike

Input:

```text
One GPS point jumps 100 m away and returns.
```

Expected:

- spike detected
- point interpolated or ignored
- no ghost teleporting

---

### Test 5: Strava auto-pause route

Input:

```text
Route already has no waiting time.
```

Expected:

- no false stop removal
- corrected duration almost equals raw duration

---

## 17. Implementation Work Packages

### WP1: FIT importer hardening

Tasks:

- Extract lat/lon/time/distance/speed/elevation if available.
- Add fallback distance calculation.
- Add fallback speed calculation.
- Normalize all samples into one internal structure.

Done when:

- At least 3 real FIT files can be loaded.
- Missing optional fields do not crash the app.

---

### WP2: GPS cleaning

Tasks:

- Detect GPS spikes.
- Mark bad samples with quality flags.
- Interpolate short spikes.
- Keep a warning list for problematic files.

Done when:

- Single-point GPS jumps no longer create unrealistic ghost movement.

---

### WP3: Stop detection

Tasks:

- Implement sliding-window stop detection.
- Merge adjacent stop windows.
- Confirm only stops longer than 5 seconds.
- Store removed stop metadata.

Done when:

- Traffic-light stops are detected.
- Slow climbs are not removed.

---

### WP4: Ghost timeline compression

Tasks:

- Calculate corrected_time_s.
- Collapse stop samples.
- Ensure corrected timestamps are monotonic.
- Ensure corrected distance remains monotonic.

Done when:

- Ghost no longer waits at traffic lights.
- Ghost movement remains continuous.

---

### WP5: Ghost speed smoothing

Tasks:

- Calculate corrected speed.
- Smooth speed around removed stops.
- Clamp impossible speed spikes.
- Add low-confidence flags where needed.

Done when:

- Ghost does not jump or accelerate unnaturally after removed stops.

---

### WP6: Curve detection

Tasks:

- Resample route by distance.
- Smooth route geometry.
- Calculate heading change and radius.
- Store curve radius per route distance.

Done when:

- Sharp turns receive small radius values.
- Straight roads receive no meaningful cap.

---

### WP7: Curve speed limit profile

Tasks:

- Implement radius-based speed limit table.
- Add downhill correction if elevation exists.
- Smooth speed limits along the route.
- Store curve_speed_limit_mps per sample.

Done when:

- Route profile includes realistic curve speed caps.

---

### WP8: Runtime progress integration

Tasks:

- Query curve speed limit by user distance.
- Cap virtual speed with curve limit.
- Apply acceleration/deceleration smoothing.
- Keep trainer resistance unchanged for MVP.

Done when:

- User progress slows naturally in sharp curves.
- Pedaling feel remains smooth.

---

### WP9: Ghost/time-gap integration

Tasks:

- Query ghost position by corrected time.
- Calculate user-vs-ghost time gap by distance.
- Ensure map display uses corrected ghost profile.

Done when:

- Time gap remains stable.
- Ghost position looks continuous.
- Ghost comparison feels fairer.

---

### WP10: Cache and startup integration

Tasks:

- Hash source FIT file.
- Store preprocessed route profile.
- Rebuild only when file hash or preprocessing version changes.
- Load cached profile at startup.

Done when:

- Routes do not need to be reprocessed every time unless changed.

---

### WP11: Developer diagnostics

Tasks:

- Add optional debug overlay or log output.
- Show detected stops.
- Show removed stop time.
- Show current curve radius and curve speed cap.
- Show quality warnings.

Done when:

- Developer can understand why ghost or user progress behaves a certain way.

---

## 18. MVP Implementation Order

Recommended order:

```text
1. FIT importer normalization
2. Distance/time normalization
3. Stop detection
4. Timeline compression
5. Ghost smoothing
6. Cache preprocessed route
7. Runtime ghost replay from corrected timeline
8. Curve detection
9. Curve speed limit profile
10. Runtime user progress cap
11. Developer diagnostics
```

Do not start with curve realism before stop removal works. The ghost stop issue is more visible and more damaging to the user experience.

---

## 19. Acceptance Criteria for the Whole Initiative

The implementation is successful when:

- Ghost does not stop at traffic lights or crossings if no real route progress happened.
- Ghost does not jump after removed stops.
- Slow uphill riding is preserved.
- Bad GPS jumps are filtered or smoothed.
- User progress is limited in sharp curves.
- Trainer resistance remains smooth and predictable.
- Time gap calculation remains stable.
- All ghost corrections are calculated offline at route startup/load.
- Runtime ride loop only reads precomputed route profile values.

---

## 20. Important UX Rule

The rider should not feel punished by the correction system.

Therefore:

```text
Do not show curve warnings in normal mode.
Do not suddenly change trainer resistance for curve handling in the MVP.
Do not visually expose stop-removal unless in developer/debug mode.
Make the ride simply feel more natural and fair.
```

---

## 21. Future Enhancements

After the MVP works, consider:

1. User-selectable realism strength internally, not necessarily exposed in UI.
2. Better physics-based curve model using lateral acceleration.
3. Skill profiles for cornering performance.
4. Separate detection of manual pauses vs traffic-light stops.
5. ML-based stop classification from many rides.
6. Surface-type speed correction if route metadata exists.
7. Better descent braking model.
8. Optional race mode calibration based on user ability.

---

## 22. Summary

The best solution is to preprocess each ghost route at startup into a corrected, moving-time-based route profile. Waiting periods are removed from the ghost timeline without deleting the route geometry. Speed is smoothed around removed stops to avoid jumps. In parallel, the route is analyzed for curvature, and curve speed limits are precomputed.

During the live ride, the app should not modify the ghost logic heavily. It should simply read the corrected ghost profile and apply precomputed curve speed caps to the user's virtual progress. This creates a fairer, more realistic race experience while keeping the trainer feel smooth and predictable.


## Curvature / Radius Filtering Requirement

The calculated curve radius or curvature MUST NOT be used directly from raw GPS geometry because this creates unstable and unrealistic speed oscillations caused by GPS noise, point density variance, and micro-direction changes.

A smoothing/filtering stage is mandatory before deriving curve speed limits.

### Required Filtering Strategy

The implementation must:

- Smooth route geometry before curvature calculation
- Smooth curvature/radius values after calculation
- Avoid rapid alternating speed caps
- Create gradual transitions into and out of curves

### Recommended Multi-Stage Pipeline

```text
Raw GPS
→ geometry smoothing
→ curvature/radius calculation
→ curvature smoothing
→ speed cap generation
→ temporal smoothing
→ runtime interpolation
```

### Geometry Smoothing

Before radius calculation:

- Apply moving average or spline smoothing to coordinates
- Ignore micro-zig-zag GPS movement
- Use a configurable smoothing window

Recommended:

```text
window size:
5–15 route points
```

### Curvature Smoothing

After radius calculation:

- Apply low-pass filtering to curvature values
- Prevent single-point spikes
- Merge nearby curve segments

Recommended techniques:

- exponential moving average
- Savitzky-Golay filter
- spline interpolation
- weighted moving average

### Speed Transition Smoothing

The resulting curve speed limit must also be smoothed.

Bad behavior:

```text
40 km/h → 18 km/h → 37 km/h → 15 km/h
```

Desired behavior:

```text
40 km/h → 34 → 29 → 24 → 20
```

### Runtime Requirements

At runtime:

- Interpolate speed caps continuously
- Never apply instantaneous speed reductions
- Use acceleration/deceleration ramps
- Use predictive look-ahead for approaching curves

Recommended:

```text
look-ahead distance:
20–80 m depending on current speed
```

### Important UX Goal

The user must never feel:

- artificial braking
- oscillating speed
- jittering movement
- inconsistent resistance behavior

The curve handling must feel like natural outdoor riding physics.
