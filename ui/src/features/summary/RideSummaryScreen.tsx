interface Props {
  onReturnHome: () => void;
}

export function RideSummaryScreen({ onReturnHome }: Props) {
  return (
    <div data-testid="summary-screen" className="w-full h-full flex flex-col items-center justify-center gap-4 bg-[var(--bg)]">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--accent)]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <span className="text-xs font-medium text-[var(--text-muted)] tracking-wider uppercase">Fahrt beendet</span>
      <button
        type="button"
        onClick={onReturnHome}
        className="mt-2 text-xs border border-[var(--border)] text-[var(--text-muted)] rounded-lg px-4 py-2 hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors duration-150"
      >
        Zur Startseite
      </button>
    </div>
  );
}
