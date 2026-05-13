-- Phase 5: ride session records
CREATE TABLE IF NOT EXISTS rides (
    id          TEXT PRIMARY KEY,
    route_id    TEXT,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    duration_s  REAL,
    distance_m  REAL,
    avg_power_w REAL,
    max_power_w REAL,
    laps        INTEGER NOT NULL DEFAULT 1,
    warmup_s    INTEGER NOT NULL DEFAULT 0,
    cooldown_s  INTEGER NOT NULL DEFAULT 0,
    erg_mode    INTEGER NOT NULL DEFAULT 0,
    uploaded_to_strava_id TEXT
);
