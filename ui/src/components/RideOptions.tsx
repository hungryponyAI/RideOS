export interface RideConfig {
  ghost: boolean;
  reverse: boolean;
  cutoutStartM: number | null;
  cutoutEndM: number | null;
  laps: number;
  warmup: boolean;
  cooldown: boolean;
  ergMode: boolean;
}

interface Props {
  config: RideConfig;
  totalDistM: number;
  hasStravaOrBestTime: boolean;
  onChange: (next: RideConfig) => void;
}

function Toggle({
  label,
  sublabel,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`flex flex-col items-start px-3 py-2 border transition-colors duration-100 cursor-pointer min-w-0 ${
        disabled
          ? "border-[var(--border)] opacity-30 cursor-not-allowed"
          : checked
          ? "border-[#FFF200] bg-[var(--surface)]"
          : "border-[var(--border)] bg-transparent hover:border-[var(--text-muted)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 ${
            checked && !disabled
              ? "border-[#FFF200] bg-[#FFF200]"
              : "border-[var(--text-muted)] bg-transparent"
          }`}
        />
        <span className="text-[10px] font-condensed font-bold tracking-widest uppercase text-[var(--text)]">
          {label}
        </span>
      </div>
      {sublabel && (
        <span className="text-[9px] font-condensed text-[var(--text-muted)] tracking-wide ml-4.5 mt-0.5 leading-tight">
          {sublabel}
        </span>
      )}
    </button>
  );
}

function LapStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-start px-3 py-2 border border-[var(--border)] bg-transparent gap-1">
      <span className="text-[10px] font-condensed font-bold tracking-widest uppercase text-[var(--text)]">
        LAPS
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, value - 1))}
          className="w-5 h-5 flex items-center justify-center border border-[var(--border)] text-[var(--text-muted)] hover:border-[#FFF200] hover:text-[var(--text)] cursor-pointer text-sm leading-none transition-colors"
        >
          −
        </button>
        <span className="text-[13px] font-data font-bold tabular-nums text-[var(--text)] w-4 text-center">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(20, value + 1))}
          className="w-5 h-5 flex items-center justify-center border border-[var(--border)] text-[var(--text-muted)] hover:border-[#FFF200] hover:text-[var(--text)] cursor-pointer text-sm leading-none transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function RideOptions({ config, hasStravaOrBestTime, onChange }: Props) {
  const ghostDisabled = config.reverse || config.ergMode;
  const ergDisabled = false;

  const set = (patch: Partial<RideConfig>) => onChange({ ...config, ...patch });

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[9px] font-condensed font-bold tracking-[0.2em] uppercase text-[var(--label-accent)]">
        OPTIONEN
      </span>

      {/* Row 1: Ghost, Reverse, Erg */}
      <div className="flex flex-wrap gap-2">
        <Toggle
          label="Ghost Rider"
          sublabel={hasStravaOrBestTime ? "Strava / Schätzung" : "Schätzung"}
          checked={config.ghost}
          disabled={ghostDisabled}
          onChange={v => set({ ghost: ghostDisabled ? false : v })}
        />
        <Toggle
          label="Rückwärts"
          checked={config.reverse}
          onChange={v => set({ reverse: v, ghost: v ? false : config.ghost })}
        />
        <Toggle
          label="Erg Mode"
          sublabel="Fixe Watt nach Profil + FTP"
          checked={config.ergMode}
          disabled={ergDisabled}
          onChange={v => set({ ergMode: v, ghost: v ? false : config.ghost })}
        />
      </div>

      {/* Row 2: Warmup, Cooldown, Laps */}
      <div className="flex flex-wrap gap-2 items-start">
        <Toggle
          label="Warm-Up"
          sublabel="2 min @ 90 W"
          checked={config.warmup}
          onChange={v => set({ warmup: v })}
        />
        <Toggle
          label="Cool-Down"
          sublabel="2 min @ 90 W"
          checked={config.cooldown}
          onChange={v => set({ cooldown: v })}
        />
        <LapStepper value={config.laps} onChange={v => set({ laps: v })} />
      </div>
    </div>
  );
}
