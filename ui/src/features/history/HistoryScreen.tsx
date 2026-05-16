import { useState } from "react";
import { Trash2 } from "lucide-react";
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
  onDelete: () => void;
}

function RideCard({ ride, onClick, onDelete }: RideCardProps) {
  return (
    <div className="w-full min-w-0 bg-[var(--surface)] border border-[var(--border)] rounded-lg transition-colors duration-150 hover:border-[var(--accent)]">
      <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-1">
        <button
          type="button"
          data-testid="ride-card"
          onClick={onClick}
          className="min-w-0 text-left flex flex-col gap-3 px-4 py-3 cursor-pointer"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 max-[420px]:grid-cols-1">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium text-[var(--text)] truncate">
                {ride.route_name ?? "Freie Fahrt"}
              </span>
              <span className="text-[10px] text-[var(--text-subtle)]">
                {formatDate(ride.started_at)} · {formatTime24(ride.started_at)}
              </span>
            </div>
            <span
              className={`max-w-full justify-self-end whitespace-nowrap text-[9px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border leading-[1.35] max-[420px]:justify-self-start ${
                ride.completed
                  ? "border-[var(--success)] text-[var(--success)]"
                  : "border-[var(--text-subtle)] text-[var(--text-subtle)]"
              }`}
            >
              {ride.completed ? "Abgeschlossen" : "Abgebrochen"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 max-[420px]:grid-cols-2">
            {ride.duration_s != null && (
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="truncate text-[13px] font-data font-bold tabular-nums text-[var(--text)]">
                  {formatTime(ride.duration_s)}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Dauer</span>
              </div>
            )}
            {ride.distance_m != null && (
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="truncate text-[13px] font-data font-bold tabular-nums text-[var(--text)]">
                  {formatDistance(ride.distance_m)}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Distanz</span>
              </div>
            )}
            {ride.avg_power_w != null && (
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="truncate text-[13px] font-data font-bold tabular-nums text-[var(--text)]">
                  {Math.round(ride.avg_power_w)} W
                </span>
                <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Ø Watt</span>
              </div>
            )}
          </div>
        </button>

        <div className="flex items-start justify-end pr-2 pt-2">
          <button
            type="button"
            data-testid="delete-ride-button"
            aria-label="Fahrt löschen"
            title="Fahrt löschen"
            onClick={onDelete}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-subtle)] transition-colors hover:bg-[rgba(199,109,109,0.12)] hover:text-[var(--critical)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--critical)]"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface RideDetailProps {
  ride: RideEntry;
  onBack: () => void;
  onDelete: () => void;
}

function RideDetail({ ride, onBack, onDelete }: RideDetailProps) {
  return (
    <div data-testid="ride-detail" className="flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 border-b border-[var(--border)] max-[520px]:grid-cols-[auto_minmax(0,1fr)]">
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
          className={`whitespace-nowrap text-[9px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border leading-[1.35] max-[520px]:col-start-2 max-[520px]:justify-self-start ${
            ride.completed
              ? "border-[var(--success)] text-[var(--success)]"
              : "border-[var(--text-subtle)] text-[var(--text-subtle)]"
          }`}
        >
          {ride.completed ? "Abgeschlossen" : "Abgebrochen"}
        </span>
        <button
          type="button"
          data-testid="delete-ride-detail-button"
          aria-label="Fahrt löschen"
          title="Fahrt löschen"
          onClick={onDelete}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-subtle)] transition-colors hover:bg-[rgba(199,109,109,0.12)] hover:text-[var(--critical)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--critical)] max-[520px]:col-start-1"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>

      <div>
        <div className="flex flex-col gap-4 px-4 py-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {ride.duration_s != null && (
              <div className="min-w-0 flex flex-col gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3">
                <span className="truncate text-[20px] font-data font-bold tabular-nums text-[var(--text)]">
                  {formatTime(ride.duration_s)}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Fahrzeit</span>
              </div>
            )}
            {ride.distance_m != null && (
              <div className="min-w-0 flex flex-col gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3">
                <span className="truncate text-[20px] font-data font-bold tabular-nums text-[var(--text)]">
                  {formatDistance(ride.distance_m)}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Distanz</span>
              </div>
            )}
            {ride.avg_power_w != null && (
              <div className="min-w-0 flex flex-col gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3">
                <span className="truncate text-[20px] font-data font-bold tabular-nums text-[var(--text)]">
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

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  testId: string;
}

function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm, testId }: ConfirmDialogProps) {
  return (
    <div
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${testId}-title`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
        <h2 id={`${testId}-title`} className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-subtle)]">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            data-testid="delete-cancel-button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Abbrechen
          </button>
          <button
            type="button"
            data-testid="delete-confirm-button"
            onClick={onConfirm}
            className="rounded-lg border border-[var(--critical)] bg-[rgba(199,109,109,0.12)] px-3 py-2 text-xs font-semibold text-[var(--critical)] hover:bg-[var(--critical)] hover:text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RideHistorySection({ title = "Letzte Fahrten" }: { title?: string }) {
  const { rides, loading, deleteRide, deleteAllRides } = useRideHistory();
  const [selectedRide, setSelectedRide] = useState<RideEntry | null>(null);
  const [rideToDelete, setRideToDelete] = useState<RideEntry | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const confirmSingleDelete = () => {
    if (rideToDelete === null) return;
    deleteRide(rideToDelete.id);
    if (selectedRide?.id === rideToDelete.id) {
      setSelectedRide(null);
    }
    setRideToDelete(null);
  };

  const confirmAllDelete = () => {
    deleteAllRides();
    setSelectedRide(null);
    setConfirmDeleteAll(false);
  };

  if (selectedRide) {
    return (
      <section data-testid="ride-history-section" className="flex flex-col">
        <RideDetail
          ride={selectedRide}
          onBack={() => setSelectedRide(null)}
          onDelete={() => setRideToDelete(selectedRide)}
        />
        {rideToDelete && (
          <ConfirmDialog
            testId="delete-ride-dialog"
            title="Fahrt löschen?"
            message="Diese Fahrt und alle aufgezeichneten Daten dazu werden dauerhaft entfernt."
            confirmLabel="Löschen"
            onCancel={() => setRideToDelete(null)}
            onConfirm={confirmSingleDelete}
          />
        )}
      </section>
    );
  }

  return (
    <section data-testid="ride-history-section" className="min-w-0 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
        <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{title}</span>
        {!loading && rides.length > 0 && (
          <button
            type="button"
            data-testid="delete-all-rides-button"
            onClick={() => setConfirmDeleteAll(true)}
            className="flex min-h-9 items-center gap-2 rounded-lg border border-[var(--critical)] px-3 py-2 text-xs font-semibold text-[var(--critical)] transition-colors hover:bg-[rgba(199,109,109,0.12)]"
          >
            <Trash2 size={14} aria-hidden="true" />
            Alle löschen
          </button>
        )}
      </div>

      <div>
        {loading && (
          <div className="flex items-center justify-center py-10">
            <span className="text-xs text-[var(--text-subtle)]">Lade Fahrten…</span>
          </div>
        )}
        {!loading && rides.length === 0 && <EmptyState />}
        {!loading && rides.length > 0 && (
          <div data-testid="ride-list" className="flex flex-col gap-2">
            {rides.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                onClick={() => setSelectedRide(ride)}
                onDelete={() => setRideToDelete(ride)}
              />
            ))}
          </div>
        )}
      </div>
      {rideToDelete && (
        <ConfirmDialog
          testId="delete-ride-dialog"
          title="Fahrt löschen?"
          message="Diese Fahrt und alle aufgezeichneten Daten dazu werden dauerhaft entfernt."
          confirmLabel="Löschen"
          onCancel={() => setRideToDelete(null)}
          onConfirm={confirmSingleDelete}
        />
      )}
      {confirmDeleteAll && (
        <ConfirmDialog
          testId="delete-all-rides-dialog"
          title="Alle Fahrten löschen?"
          message="Damit wird der komplette Verlauf in Analyse entfernt. Routen bleiben erhalten."
          confirmLabel="Alle löschen"
          onCancel={() => setConfirmDeleteAll(false)}
          onConfirm={confirmAllDelete}
        />
      )}
    </section>
  );
}
