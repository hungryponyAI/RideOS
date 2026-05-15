import type { MapViewMode } from "./MiniMap";

interface Props {
  isPaused: boolean;
  visible: boolean;
  onTogglePause: () => void;
  onEndRide: () => void;
  onShiftGear: (dir: "up" | "down") => void;
  onCycleCamera: () => void;
  viewMode: MapViewMode;
}

export function RideControls({ isPaused, visible, onTogglePause, onEndRide, onShiftGear, onCycleCamera, viewMode }: Props) {
  const show = visible || isPaused;
  const cameraLabel = viewMode === "chase" ? "Chase" : viewMode === "follow" ? "Follow" : "Übersicht";

  return (
    <>
      {isPaused && (
        <div className="absolute inset-0 z-[1500] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto flex flex-col items-center gap-3">
            <button
              type="button"
              data-testid="resume-button"
              onClick={onTogglePause}
              aria-label="Fahrt fortsetzen"
              className="w-[72px] h-[72px] rounded-full bg-[var(--surface)] border border-[var(--accent)] shadow-elevated flex items-center justify-center text-[var(--text)] cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-soft)]"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
            <span className="text-[11px] font-medium text-[var(--text-muted)]">Fortsetzen</span>
            <button
              type="button"
              data-testid="end-ride-paused"
              onClick={onEndRide}
              aria-label="Fahrt beenden"
              className="mt-1 min-h-[44px] px-5 rounded-xl border border-[var(--border)] text-[11px] font-medium text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer"
            >
              Beenden
            </button>
          </div>
        </div>
      )}

      <div
        data-testid="ride-control-strip"
        className={`absolute bottom-[160px] right-4 z-20 flex flex-col gap-1.5 items-end transition-opacity duration-300 motion-reduce:transition-none ${show ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <div className="flex gap-0.5 bg-[var(--surface-soft)] backdrop-blur-md border border-[var(--border)] rounded-xl px-1 py-1 shadow-soft">
          <button
            type="button"
            data-testid="gear-down"
            onClick={() => onShiftGear("down")}
            aria-label="Gang runter"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors duration-150 cursor-pointer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="18 15 12 21 6 15" />
              <line x1="12" y1="3" x2="12" y2="21" />
            </svg>
          </button>
          <button
            type="button"
            data-testid="gear-up"
            onClick={() => onShiftGear("up")}
            aria-label="Gang rauf"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors duration-150 cursor-pointer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="18 9 12 3 6 9" />
              <line x1="12" y1="21" x2="12" y2="3" />
            </svg>
          </button>
          <div className="w-px bg-[var(--border)] mx-1 self-stretch" />
          <button
            type="button"
            data-testid="camera-mode-button"
            onClick={onCycleCamera}
            aria-label={`Kameraansicht: ${cameraLabel}`}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors duration-150 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
        </div>

        {!isPaused && (
          <div className="flex gap-1">
            <button
              type="button"
              data-testid="pause-button"
              onClick={onTogglePause}
              aria-label="Fahrt pausieren"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-[var(--surface-soft)] backdrop-blur-md border border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer shadow-soft"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              data-testid="end-ride-button"
              onClick={onEndRide}
              aria-label="Fahrt beenden"
              className="min-w-[44px] min-h-[44px] px-3 flex items-center gap-1.5 bg-[var(--surface-soft)] backdrop-blur-md border border-[var(--border)] rounded-xl text-[11px] font-medium text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer shadow-soft"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              Beenden
            </button>
          </div>
        )}
      </div>
    </>
  );
}
