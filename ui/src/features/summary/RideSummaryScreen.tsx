import type { RideSummaryData } from "../ride/RideScreen";

function formatTime(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

interface Props {
  summaryData: RideSummaryData | null;
  onReturnHome: () => void;
}

export function RideSummaryScreen({ summaryData, onReturnHome }: Props) {
  const isCompleted = summaryData?.reason === "completed";

  return (
    <div data-testid="summary-screen" className="w-full h-full flex flex-col items-center justify-center gap-5 bg-[var(--bg)] px-6">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--accent)]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {isCompleted ? (
          <>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </>
        ) : (
          <rect x="3" y="3" width="18" height="18" rx="2" />
        )}
      </svg>

      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-medium text-[var(--text-muted)] tracking-wider uppercase">
          {isCompleted ? "Strecke abgeschlossen" : "Fahrt beendet"}
        </span>
        {summaryData?.elapsed_s != null && (
          <span className="text-[28px] font-data font-bold tabular-nums text-[var(--text)]">
            {formatTime(summaryData.elapsed_s)}
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 w-full max-w-[200px]">
        <button
          type="button"
          onClick={onReturnHome}
          className="w-full min-h-[44px] text-xs border border-[var(--border)] text-[var(--text-muted)] rounded-xl px-4 py-2 hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer"
        >
          Zur Startseite
        </button>
      </div>
    </div>
  );
}
