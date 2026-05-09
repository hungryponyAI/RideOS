-- Phase 3 initial schema: routes and strava_tokens
CREATE TABLE IF NOT EXISTS routes (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL DEFAULT '',
    source           TEXT NOT NULL DEFAULT 'gpx_upload',
    strava_id        TEXT,
    added_at         TEXT NOT NULL,
    total_dist_m     REAL NOT NULL,
    elevation_gain_m REAL NOT NULL DEFAULT 0,
    elevation_loss_m REAL NOT NULL DEFAULT 0,
    best_time_s      REAL,
    ride_count       INTEGER NOT NULL DEFAULT 0,
    gpx_blob         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strava_tokens (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    access_token_enc    BLOB NOT NULL,
    refresh_token_enc   BLOB NOT NULL,
    expires_at          INTEGER NOT NULL,
    athlete_id          TEXT,
    athlete_name        TEXT,
    scopes              TEXT
);
