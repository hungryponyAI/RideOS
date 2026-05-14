import type { AppView } from './types';

interface Props {
  current: AppView;
  onNavigate: (view: AppView) => void;
  onSettingsOpen: () => void;
}

const NAV_ITEMS = [
  {
    view: 'home' as AppView,
    label: 'Startseite',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    view: 'history' as AppView,
    label: 'Verlauf',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    view: 'analytics' as AppView,
    label: 'Analyse',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
  {
    view: 'devices' as AppView,
    label: 'Gerät',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6.5 6.5 17.5 17.5"/>
        <path d="M12 2L8.5 5.5 12 9l7-7-3 0 0-3"/>
        <path d="M12 22l-3.5-3.5L12 15l7 7-3 0 0-3"/>
      </svg>
    ),
  },
] as const;

export function AppNav({ current, onNavigate, onSettingsOpen }: Props) {
  return (
    <nav
      aria-label="Hauptnavigation"
      className="shrink-0 flex items-stretch border-t border-[var(--border)] bg-[var(--surface)]"
      style={{ height: 56 }}
    >
      {NAV_ITEMS.map(({ view, label, icon }) => {
        const isActive = current === view || (view === 'home' && current === 'routes');
        return (
          <button
            key={view}
            type="button"
            onClick={() => onNavigate(view)}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-wider uppercase transition-colors duration-150 cursor-pointer min-h-[44px]
              ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
          >
            {icon}
            <span className="hidden sm:block">{label}</span>
          </button>
        );
      })}

      {/* Settings — opens drawer instead of a dedicated screen in Phase 1 */}
      <button
        type="button"
        onClick={onSettingsOpen}
        aria-label="Einstellungen"
        className="flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-wider uppercase transition-colors duration-150 cursor-pointer min-h-[44px] text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span className="hidden sm:block">Einstellungen</span>
      </button>
    </nav>
  );
}
