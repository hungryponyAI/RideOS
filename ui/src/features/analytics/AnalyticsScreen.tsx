export function AnalyticsScreen() {
  return (
    <div data-testid="analytics-screen" className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--bg)]">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-subtle)]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
      <span className="text-xs font-medium text-[var(--text-muted)] tracking-wider uppercase">Analyse</span>
      <p className="text-xs text-[var(--text-subtle)] text-center max-w-[240px]">Auswertungen und Trends erscheinen hier nach mehreren Fahrten.</p>
    </div>
  );
}
