export function DevicesScreen() {
  return (
    <div data-testid="devices-screen" className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--bg)]">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-subtle)]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6.5 6.5 17.5 17.5"/>
        <path d="M12 2L8.5 5.5 12 9l7-7-3 0 0-3"/>
        <path d="M12 22l-3.5-3.5L12 15l7 7-3 0 0-3"/>
      </svg>
      <span className="text-xs font-medium text-[var(--text-muted)] tracking-wider uppercase">Gerät</span>
      <p className="text-xs text-[var(--text-subtle)] text-center max-w-[240px]">Trainer-Verbindung und Geräteverwaltung kommen hier.</p>
    </div>
  );
}
