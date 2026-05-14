export function HistoryScreen() {
  return (
    <div data-testid="history-screen" className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--bg)]">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-subtle)]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <span className="text-xs font-medium text-[var(--text-muted)] tracking-wider uppercase">Verlauf</span>
      <p className="text-xs text-[var(--text-subtle)] text-center max-w-[240px]">Deine Fahrten erscheinen hier nach dem ersten Ritt.</p>
    </div>
  );
}
