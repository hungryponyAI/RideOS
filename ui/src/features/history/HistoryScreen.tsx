import { useState } from "react";
import { useRideHistory, type RideEntry } from "./useRideHistory";

function formatTime(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTime24(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        className="text-[var(--text-subtle)]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <p className="text-xs text-[var(--text-subtle)] max-w-[200px] leading-relaxed">
        Deine Fahrten erscheinen hier nach dem ersten Ritt.
      </p>
    </div>
  );
}

interface RideCardProps {
  ride: RideEntry;
  onClick: () => void;
}

function RideCard({ ride, onClick }: RideCardProps) {
  return (
    <button
      type="button"
      data-testid="ride-card"
      onClick={onClick}
      className="w-full text-left flex flex-col gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 hover:border-[var(--accent)] transition-colors duration-150 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium text-[var(--text)] truncate">
            {ride.route_name ?? "Freie Fahrt"}
          </span>
          <span className="text-[10px] text-[var(--text-subtle)]">
            {formatDate(ride.started_at)} · {formatTime24(ride.started_at)}
          </span>
        </div>
        <span
          className={`shrink-0 text-[9px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${
            ride.completed
              ? "border-[var(--success)] text-[var(--success)]"
              : "border-[var(--text-subtle)] text-[var(--text-subtle)]"
          }`}
        >
          {ride.completed ? "Abgeschlossen" : "Abgebrochen"}
        </span>
      </div>

      <div className="flex gap-4 flex-wrap">
        {ride.duration_s != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-data font-bold tabular-nums text-[var(--text)]">
              {formatTime(ride.duration_s)}
            </span>
            <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Dauer</span>
          </div>
        )}
        {ride.distance_m != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-data font-bold tabular-nums text-[var(--text)]">
              {formatDistance(ride.distance_m)}
            </span>
            <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Distanz</span>
          </div>
        )}
        {ride.avg_power_w != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-data font-bold tabular-nums text-[var(--text)]">
              {Math.round(ride.avg_power_w)} W
            </span>
            <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Ø Watt</span>
          </div>
        )}
      </div>
    </button>
  );
}

interface RideDetailProps {
  ride: RideEntry;
  onBack: () => void;
}

function RideDetail({ ride, onBack }: RideDetailProps) {
  return (
    <div data-testid="ride-detail" className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
        <button
          type="button"
          data-testid="back-button"
          onClick={onBack}
          aria-label="Zurück zur Übersicht"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium text-[var(--text)] truncate">
            {ride.route_name ?? "Freie Fahrt"}
          </span>
          <span className="text-[10px] text-[var(--text-subtle)]">
            {formatDate(ride.started_at)} · {formatTime24(ride.started_at)}
          </span>
        </div>
        <span
          className={`ml-auto shrink-0 text-[9px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${
            ride.completed
              ? "border-[var(--success)] text-[var(--success)]"
              : "border-[var(--text-subtle)] text-[var(--text-subtle)]"
          }`}
        >
          {ride.completed ? "Abgeschlossen" : "Abgebrochen"}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-4 px-4 py-6 max-w-[440px] mx-auto">
          <div className="grid grid-cols-2 gap-3">
            {ride.duration_s != null && (
              <div className="flex flex-col gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
                <span className="text-[20px] font-data font-bold tabular-nums text-[var(--text)]">
                  {formatTime(ride.duration_s)}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Fahrzeit</span>
              </div>
            )}
            {ride.distance_m != null && (
              <div className="flex flex-col gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
                <span className="text-[20px] font-data font-bold tabular-nums text-[var(--text)]">
                  {formatDistance(ride.distance_m)}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Distanz</span>
              </div>
            )}
            {ride.avg_power_w != null && (
              <div className="flex flex-col gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
                <span className="text-[20px] font-data font-bold tabular-nums text-[var(--text)]">
                  {Math.round(ride.avg_power_w)} W
                </span>
                <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Ø Watt</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HistoryScreen() {
  const { rides, loading } = useRideHistory();
  const [selectedRide, setSelectedRide] = useState<RideEntry | null>(null);

  if (selectedRide) {
    return (
      <div data-testid="history-screen" className="w-full h-full flex flex-col bg-[var(--bg)]">
        <RideDetail ride={selectedRide} onBack={() => setSelectedRide(null)} />
      </div>
    );
  }

  return (
    <div data-testid="history-screen" className="w-full h-full flex flex-col bg-[var(--bg)]">
      <div className="shrink-0 px-4 py-3 border-b border-[var(--border)]">
        <span className="text-xs font-medium text-[var(--text-muted)] tracking-wider uppercase">Verlauf</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <span className="text-xs text-[var(--text-subtle)]">Lade Fahrten…</span>
          </div>
        )}
        {!loading && rides.length === 0 && <EmptyState />}
        {!loading && rides.length > 0 && (
          <div data-testid="ride-list" className="flex flex-col gap-2 px-4 py-4">
            {rides.map((ride) => (
              <RideCard key={ride.id} ride={ride} onClick={() => setSelectedRide(ride)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
