# Software & Data Architecture

## 1. Goal

Build a commercial iOS/Android app based on an existing web app with frontend and backend, using a **local-first architecture** to reduce cloud cost, backend complexity, latency, and vendor dependency.

The app should support indoor cycling with Wahoo KICKR Core / Zwift Cog-style use cases, route-based resistance control, local ride execution, route libraries, Strava route import, and optional cloud sync.

## 2. Core Architecture Principle

```text
The device stores and processes heavy user-specific data.
The cloud stores identity, app-owned content, lightweight indexes, entitlements, and optional backups.
```

This means:

- The ride engine runs locally on the user device.
- Strava-imported routes are downloaded to the user device.
- Official app routes are hosted centrally and downloaded on demand.
- Ride sessions are recorded locally first.
- Cloud sync is optional and lightweight by default.
- Supabase is used as the main backend platform.

## 3. High-Level Architecture

```text
iOS / Android App
└── Capacitor Container
    ├── Existing Web Frontend
    ├── Local Ride Engine
    ├── BLE / Trainer Communication
    ├── Local Route Library
    ├── Local SQLite Database
    ├── Local File Storage
    └── Sync Module

Supabase
├── Auth
├── Postgres Database
├── Storage
├── Edge Functions
├── Realtime / Sync Metadata
└── App Configuration

External Services
├── Strava API
├── Map Provider
├── Apple App Store
└── Google Play Store
```

## 4. Main Components

### 4.1 Capacitor App

The Capacitor app contains the mobile frontend and the local execution logic.

Responsibilities:

- Render the user interface.
- Execute ride sessions locally.
- Communicate with the Wahoo trainer via BLE.
- Calculate route position, gradient, and target resistance.
- Store routes and rides locally.
- Import Strava routes to local storage.
- Download official app routes from Supabase.
- Sync lightweight metadata with Supabase.
- Support offline ride execution.

### 4.2 Local Ride Engine

The ride engine should be implemented as a modular TypeScript package that can run inside the app and optionally be reused later on the backend for validation, simulation, or replay.

Suggested modules:

```text
/src/engine
├── routeEngine.ts
├── gradientEngine.ts
├── resistanceEngine.ts
├── trainerControlEngine.ts
├── rideSimulationEngine.ts
├── physicsModel.ts
├── smoothing.ts
└── types.ts
```

Responsibilities:

- Parse route geometry and elevation profile.
- Determine current virtual position.
- Calculate current gradient.
- Smooth noisy elevation/gradient data.
- Convert gradient into target resistance.
- Send trainer control commands.
- Record ride samples locally.

### 4.3 Local Storage Layer

Use local storage for all heavy and frequently accessed data.

Recommended stack:

```text
Local database: SQLite
Local file storage: Capacitor Filesystem
Optional cache: IndexedDB / browser cache for frontend assets
```

Local data examples:

- Downloaded official routes.
- Strava-imported routes.
- User-created routes.
- GPX / FIT / TCX / JSON route files.
- Route points and elevation profiles.
- Ride sessions.
- Ride samples.
- Device settings.
- Cached app configuration.
- Sync state.

### 4.4 Supabase Backend

Supabase is the central backend platform, but should not become the storage location for all heavy user data.

Supabase responsibilities:

- User authentication.
- User profile management.
- Official route catalog.
- Official route file hosting.
- Subscription / entitlement state.
- Lightweight sync index.
- App settings and feature flags.
- Optional ride summaries.
- Optional user backup metadata.
- Edge Functions for secure server-side operations.

### 4.5 Strava Integration

Strava should be used as a route source, not as a permanent cloud mirror.

Recommended flow:

```text
User connects Strava
→ Supabase Edge Function handles OAuth/token flow
→ App requests user's routes
→ Selected routes are downloaded to the device
→ Full route data is stored locally
→ Supabase stores only lightweight reference metadata
```

Supabase should store:

- Strava connection state.
- Encrypted/managed token data if required.
- Strava route IDs.
- Import timestamp.
- Route name.
- Distance.
- Elevation gain.
- Local file hash.
- Last known Strava modification date.

The local device should store:

- Full route geometry.
- Elevation profile.
- Parsed route points.
- GPX/FIT/TCX source file if needed.

## 5. Data Ownership Split

| Data Type | Primary Location | Cloud Sync | Notes |
|---|---:|---:|---|
| User account | Supabase | Yes | Required for login |
| User profile | Supabase | Yes | Lightweight |
| App settings | Supabase + local cache | Yes | Enables multi-device consistency |
| Device settings | Local device | Optional | Trainer-specific settings stay local |
| Official route metadata | Supabase Postgres | Yes | Catalog/search data |
| Official route files | Supabase Storage | Download only | Server keeps master version |
| Downloaded official routes | Local device | Optional metadata | Used offline |
| Strava route metadata | Supabase + local | Optional | Lightweight index only |
| Full Strava route data | Local device | No by default | Reduces cost and legal/storage complexity |
| Ride session summary | Local + optional Supabase | Optional | Useful for dashboard/backup |
| Full ride samples | Local device | No by default | Heavy time-series data |
| Raw FIT files | Local device | Optional export | Avoid default cloud storage |
| Map tiles/cache | Local cache | No | Depends on map provider terms |
| Subscription state | Supabase / store validation | Yes | Source of truth may depend on payment setup |

## 6. Suggested Local SQLite Schema

### 6.1 routes

```sql
CREATE TABLE routes (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL, -- app, strava, user_import, manual
  external_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  distance_m REAL,
  elevation_gain_m REAL,
  duration_estimate_s INTEGER,
  route_file_path TEXT,
  thumbnail_path TEXT,
  local_hash TEXT,
  is_downloaded INTEGER DEFAULT 1,
  is_favorite INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_synced_at TEXT
);
```

### 6.2 route_points

```sql
CREATE TABLE route_points (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  sequence_index INTEGER NOT NULL,
  lat REAL,
  lon REAL,
  distance_m REAL NOT NULL,
  elevation_m REAL,
  gradient REAL,
  smoothed_gradient REAL,
  FOREIGN KEY(route_id) REFERENCES routes(id)
);
```

### 6.3 rides

```sql
CREATE TABLE rides (
  id TEXT PRIMARY KEY,
  route_id TEXT,
  title TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_s INTEGER,
  distance_m REAL,
  elevation_gain_m REAL,
  avg_power_w REAL,
  max_power_w REAL,
  avg_cadence_rpm REAL,
  avg_hr_bpm REAL,
  calories_kcal REAL,
  sync_status TEXT DEFAULT 'local_only',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(route_id) REFERENCES routes(id)
);
```

### 6.4 ride_samples

```sql
CREATE TABLE ride_samples (
  id TEXT PRIMARY KEY,
  ride_id TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  distance_m REAL,
  speed_mps REAL,
  power_w REAL,
  cadence_rpm REAL,
  heart_rate_bpm REAL,
  gradient REAL,
  target_resistance REAL,
  trainer_resistance REAL,
  FOREIGN KEY(ride_id) REFERENCES rides(id)
);
```

### 6.5 sync_state

```sql
CREATE TABLE sync_state (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_hash TEXT,
  remote_hash TEXT,
  sync_status TEXT NOT NULL,
  last_local_change_at TEXT,
  last_remote_change_at TEXT,
  last_synced_at TEXT,
  PRIMARY KEY(entity_type, entity_id)
);
```

## 7. Suggested Supabase Schema

### 7.1 profiles

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.2 official_routes

```sql
CREATE TABLE official_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  distance_m REAL,
  elevation_gain_m REAL,
  difficulty TEXT,
  region TEXT,
  country TEXT,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  version INTEGER DEFAULT 1,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.3 user_route_index

```sql
CREATE TABLE user_route_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  route_source TEXT NOT NULL,
  route_local_id TEXT,
  external_id TEXT,
  title TEXT,
  distance_m REAL,
  elevation_gain_m REAL,
  local_hash TEXT,
  last_known_external_update TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.4 user_ride_summary

```sql
CREATE TABLE user_ride_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  local_ride_id TEXT NOT NULL,
  route_title TEXT,
  started_at TIMESTAMPTZ,
  duration_s INTEGER,
  distance_m REAL,
  elevation_gain_m REAL,
  avg_power_w REAL,
  max_power_w REAL,
  avg_cadence_rpm REAL,
  avg_hr_bpm REAL,
  local_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.5 subscriptions

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  store TEXT NOT NULL, -- apple, google, web
  product_id TEXT NOT NULL,
  status TEXT NOT NULL,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.6 app_config

```sql
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## 8. Sync Concept

### 8.1 Sync Modes

Recommended sync modes:

```text
local_only      Data exists only on this device
metadata_sync   Only lightweight metadata is synced
summary_sync    Ride summary is synced, samples stay local
backup_sync     Full user backup is enabled by user
cloud_master    Server is source of truth, e.g. official routes
```

### 8.2 Sync Rules

Default rules:

- Official route catalog: cloud master.
- Downloaded official route file: local cached copy.
- Strava routes: local master after import.
- User-created routes: local master, optional metadata sync.
- Ride sessions: local master, optional summary sync.
- Full ride samples: local only by default.
- App settings: cloud + local cache.
- Device settings: local only.

### 8.3 Conflict Strategy

For MVP:

- Prefer local changes for user-owned data.
- Prefer cloud version for official app routes.
- Use `updated_at`, `local_hash`, and `remote_hash` for conflict detection.
- If conflict cannot be resolved automatically, duplicate the local item instead of overwriting.

Example:

```text
Route edited on Device A and Device B
→ detect hash mismatch
→ keep both versions
→ show user: "Two versions found"
```

## 9. Key User Flows

### 9.1 Download Official App Route

```text
User opens App Routes
→ App loads route catalog metadata from Supabase
→ User selects route
→ App downloads route file from Supabase Storage
→ App parses route locally
→ App stores route + route points in SQLite
→ Route becomes available offline
```

### 9.2 Import Strava Route

```text
User connects Strava
→ OAuth handled through Supabase Edge Function
→ App fetches available Strava routes
→ User selects route
→ Full route is downloaded to device
→ App parses and stores route locally
→ Supabase stores only lightweight route index metadata
```

### 9.3 Start Ride

```text
User selects downloaded route
→ App connects to Wahoo trainer via BLE
→ Ride engine starts locally
→ Position, gradient, and resistance are calculated locally
→ Trainer commands are sent locally
→ Ride samples are written to local SQLite
→ No server dependency during ride
```

### 9.4 Finish Ride

```text
User ends ride
→ App stores full ride locally
→ App calculates ride summary
→ User may choose sync/backup/export
→ Supabase receives only summary by default
```

## 10. Offline Strategy

The app should be usable without internet during a ride.

Offline-capable:

- Start downloaded routes.
- Ride engine.
- BLE trainer control.
- Local ride recording.
- Local route library.
- Local settings.

Requires internet:

- Login on new device.
- Download app routes.
- Import from Strava.
- Sync metadata.
- Restore backup.
- Validate subscription if cache expired.

## 11. Security & Privacy Concept

### 11.1 Sensitive Data Minimization

To reduce privacy risk and backend cost:

- Do not upload full route data from Strava by default.
- Do not upload raw ride samples by default.
- Store only metadata needed for sync and UX.
- Let users delete local and cloud data.
- Keep Strava tokens server-side where possible.

### 11.2 Supabase RLS

All user-specific Supabase tables should use Row Level Security.

Basic rule:

```text
Users can only read/write rows where user_id = auth.uid().
```

Official app routes are read-only for normal users.

## 12. App Store / Play Store Considerations

The app should not feel like a simple WebView wrapper.

Recommended native/mobile features:

- Native app icon and splash screen.
- BLE trainer integration.
- Offline ride mode.
- Native-feeling navigation.
- Local notifications if needed.
- Proper loading, error, and empty states.
- Account deletion flow.
- Privacy policy.
- Terms and conditions.
- Store-compliant payment handling.

## 13. Vendor-Minimized Setup

### MVP Vendor Setup

```text
1. Supabase
2. Apple App Store / Google Play Store
3. Map provider
4. Strava API
```

### Optional Later

```text
5. RevenueCat for subscription management
6. Sentry for crash/error monitoring
7. Separate worker service for heavy analysis
```

## 14. Suggested Repository Structure

```text
app/
├── src/
│   ├── app/
│   ├── components/
│   ├── pages/
│   ├── engine/
│   ├── ble/
│   ├── storage/
│   ├── sync/
│   ├── strava/
│   ├── maps/
│   ├── supabase/
│   └── types/
│
├── capacitor.config.ts
├── package.json
└── supabase/
    ├── functions/
    ├── migrations/
    └── seed.sql
```

## 15. Open Architecture Questions

These questions should be answered before final implementation.

### 15.1 Product Scope

1. Is the MVP primarily for personal use, beta users, or direct App Store launch?
2. Is the core value route-based trainer resistance, route visualization, Strava import, or official app routes?
3. Should users be able to create their own routes inside the app?
4. Should the app work fully without login, or is login mandatory?
5. Should users be able to use the app across multiple devices with the same account?

### 15.2 Route Data

6. Which route formats must be supported first: GPX, FIT, TCX, JSON, Strava API routes?
7. Should imported Strava routes be editable locally?
8. Should Strava routes automatically refresh or only refresh manually?
9. Should full Strava route data ever be backed up to Supabase?
10. Should official app routes be free, paid, or partly premium?

### 15.3 Ride Data

11. Should full ride samples stay local forever by default?
12. Should users be able to opt into cloud backup of full ride data?
13. Should users be able to export rides as FIT/GPX/TCX?
14. Should completed rides be uploaded back to Strava?
15. Which ride metrics are required for MVP: power, cadence, heart rate, speed, distance, elevation, calories, TSS, IF, FTP?

### 15.4 Trainer / Hardware

16. Which trainer devices must be supported in MVP?
17. Is Wahoo KICKR Core the only initial target?
18. Should Bluetooth FTMS be used as generic interface?
19. Should proprietary Wahoo control be supported?
20. Should Zwift Click / Cog control be included in MVP or later?

### 15.5 Maps & Visualization

21. Which map provider should be used: existing Mapbox, MapLibre, OSM-based provider, or another option?
22. Should route map tiles be cached offline?
23. Does the app need 3D terrain or only route polyline + elevation profile?
24. Should the TV-cycling-style overlay be part of MVP?
25. Should the user be able to ride without map display, using only gradient/resistance view?

### 15.6 Sync & Cloud

26. Should cloud sync be automatic or manual?
27. Should sync happen only on Wi-Fi?
28. How many devices per user should be supported?
29. Should conflict resolution be automatic or visible to the user?
30. Should deleting a route locally also delete its cloud metadata?

### 15.7 Monetization

31. Will the app be free, one-time paid, freemium, or subscription-based?
32. Which features are premium?
33. Should subscriptions be handled directly through Apple/Google first?
34. Is RevenueCat acceptable later, or should it be avoided to minimize vendors?
35. Should official routes be sold individually or included in a subscription?

### 15.8 Privacy / Legal

36. Should users be able to use the app anonymously/local-only?
37. Which personal data should be stored in Supabase?
38. Should users be able to delete all cloud data from inside the app?
39. Should location/route data be treated as sensitive and kept local by default?
40. Are there any corporate, GDPR, or data residency constraints?

### 15.9 Technical Stack

41. What is the current frontend stack: React, Vue, Angular, Svelte, plain JS?
42. What is the current backend stack?
43. Is the existing code TypeScript or JavaScript?
44. Is there already a database?
45. Is the existing backend still needed if Supabase is introduced?

## 16. Recommended MVP Decisions

Unless decided otherwise, the recommended MVP defaults are:

```text
App framework: Capacitor
Frontend: existing web frontend
Backend: Supabase only
Auth: Supabase Auth
Database: Supabase Postgres + local SQLite
Files: Supabase Storage + local Capacitor Filesystem
Ride engine: local TypeScript module
Route storage: local-first
Strava routes: stored locally, metadata synced only
Official routes: hosted in Supabase, downloaded locally
Ride samples: local only
Ride summaries: optional Supabase sync
Payments: postpone or use Apple/Google native purchases
Maps: keep existing provider for MVP
```

## 17. Next Implementation Steps

1. Confirm open architecture questions.
2. Define MVP feature boundaries.
3. Decide local database schema.
4. Decide Supabase schema and RLS policies.
5. Extract ride engine into modular local package.
6. Add local route storage and route import pipeline.
7. Add official route catalog from Supabase.
8. Add Strava import flow.
9. Add ride recording and summary generation.
10. Add optional metadata sync.
11. Package frontend with Capacitor.
12. Validate iOS/Android BLE behavior.
13. Prepare App Store / Play Store compliance items.

