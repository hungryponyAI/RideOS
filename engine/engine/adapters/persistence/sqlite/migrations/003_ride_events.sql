-- Phase 5: append-only event log per ride
CREATE TABLE IF NOT EXISTS ride_events (
    ride_id    TEXT NOT NULL REFERENCES rides(id),
    seq        INTEGER NOT NULL,
    t_ms       INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload    TEXT NOT NULL,
    PRIMARY KEY (ride_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_ride_events_type ON ride_events(ride_id, event_type);
