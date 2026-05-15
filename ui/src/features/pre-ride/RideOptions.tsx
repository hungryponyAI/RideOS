import { useState } from "react";

export interface RideConfig {
  ghost: boolean;
  reverse: boolean;
  cutoutStartM: number | null;
  cutoutEndM: number | null;
  laps: number;
  warmup: boolean;
  cooldown: boolean;
  ergMode: boolean;
  physicsMode: boolean;
}

interface Props {
  config: RideConfig;
  totalDistM: number;
  hasStravaOrBestTime: boolean;
  onChange: (next: RideConfig) => void;
}

function Toggle({
  label, sublabel, checked, disabled, onChange,
}: {
  label: string; sublabel?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`flex items-center gap-2.5 px-3 py-2.5 border rounded-lg min-h-[44px] w-full text-left transition-colors duration-tap cursor-pointer ${
        disabled
          ? "border-[var(--border)] opacity-30 cursor-not-allowed"
          : checked
          ? "border-[var(--accent)] bg-[var(--surface)]"
          : "border-[var(--border)] bg-transparent hover:border-[var(--text-muted)]"
      }`}
    >
      <div className={`w-3 h-3 rounded-full border-2 shrink-0 transition-colors duration-tap ${
        checked && !disabled ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--text-subtle)] bg-transparent"
      }`} />
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-medium text-[var(--text)] leading-none">{label}</span>
        {sublabel && <span className="text-[10px] text-[var(--text-muted)] leading-tight mt-0.5">{sublabel}</span>}
      </div>
    </button>
  );
}

function LapStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 border border-[var(--border)] rounded-lg min-h-[44px]">
      <span className="text-xs font-medium text-[var(--text)]">Runden</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Runden verringern"
          onClick={() => onChange(Math.max(1, value - 1))}
          className="w-7 h-7 flex items-center justify-center border border-[var(--border)] rounded text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer transition-colors duration-tap text-sm leading-none"
        >−</button>
        <span className="text-sm font-medium tabular-nums text-[var(--text)] w-5 text-center">{value}</span>
        <button
          type="button"
          aria-label="Runden erhöhen"
          onClick={() => onChange(Math.min(20, value + 1))}
          className="w-7 h-7 flex items-center justify-center border border-[var(--border)] rounded text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer transition-colors duration-tap text-sm leading-none"
        >+</button>
      </div>
    </div>
  );
}

export function RideOptions({ config, hasStravaOrBestTime, onChange }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const ghostDisabled = config.reverse || config.ergMode;
  const set = (patch: Partial<RideConfig>) => onChange({ ...config, ...patch });

  return (
    <div className="flex flex-col gap-2">
      <Toggle
        label="Ghost Rider"
        sublabel={hasStravaOrBestTime ? "Strava / Schätzung" : "Schätzung"}
        checked={config.ghost}
        disabled={ghostDisabled}
        onChange={v => set({ ghost: ghostDisabled ? false : v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Toggle label="Warm-Up" sublabel="2 min · 90 W" checked={config.warmup} onChange={v => set({ warmup: v })} />
        <Toggle label="Cool-Down" sublabel="2 min · 90 W" checked={config.cooldown} onChange={v => set({ cooldown: v })} />
      </div>
      <LapStepper value={config.laps} onChange={v => set({ laps: v })} />

      <button
        type="button"
        onClick={() => setShowAdvanced(s => !s)}
        className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-subtle)] hover:text-[var(--text-muted)] transition-colors duration-tap cursor-pointer py-1 self-start"
      >
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className={`transition-transform duration-panel ease-oudena ${showAdvanced ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {showAdvanced ? "Weniger Optionen" : "Erweiterte Optionen"}
      </button>

      <div className={`flex flex-col gap-2 overflow-hidden transition-[max-height,opacity] duration-panel ease-oudena ${
        showAdvanced ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
      }`}>
        <Toggle label="Rückwärts" checked={config.reverse} onChange={v => set({ reverse: v, ghost: v ? false : config.ghost })} />
        <Toggle label="ERG Mode" sublabel="Fixe Watt nach Profil + FTP" checked={config.ergMode} onChange={v => set({ ergMode: v, ghost: v ? false : config.ghost })} />
        <Toggle label="Physics" sublabel="Power-basierter Fortschritt" checked={config.physicsMode} onChange={v => set({ physicsMode: v })} />
        <Toggle label="Trainer-Schwierigkeit" sublabel="Bald verfügbar" checked={false} disabled onChange={() => {}} />
        <Toggle label="Tempo-Ziel" sublabel="Bald verfügbar" checked={false} disabled onChange={() => {}} />
      </div>
    </div>
  );
}
