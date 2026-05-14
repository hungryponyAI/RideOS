import { useEffect, useState, useCallback } from "react";
import { useWS } from "../../shared/ws/useWS";
import { useDeviceStatus } from "./hooks/useDeviceStatus";
import { useAthleteSettings, type AthleteSettings } from "./hooks/useAthleteSettings";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onReopenOnboarding?: () => void;
}

function DeviceRow({ label, connected, searching }: { label: string; connected: boolean; searching?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[11px] font-medium text-[var(--text)]">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-[var(--success)] animate-pulse" : searching ? "bg-[var(--warning)] animate-pulse" : "bg-[var(--critical)]"}`} />
        <span className={`text-[9px] font-medium ${connected ? "text-[var(--success)]" : searching ? "text-[var(--warning)]" : "text-[var(--text-subtle)]"}`}>
          {connected ? "Verbunden" : searching ? "Suche…" : "Getrennt"}
        </span>
      </div>
    </div>
  );
}

function NumberInput({ label, unit, value, min, max, onChange }: { label: string; unit: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => { setRaw(String(value)); }, [value]);

  const commit = useCallback(() => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) { setRaw(String(value)); return; }
    const clamped = Math.min(max, Math.max(min, n));
    onChange(clamped);
    setRaw(String(clamped));
  }, [raw, value, min, max, onChange]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-medium text-[var(--text-muted)]">{label}</span>
      <div className="flex items-center gap-2">
        <input type="number" inputMode="numeric" min={min} max={max} step={1} value={raw}
          onChange={e => setRaw(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); }}
          className="flex-1 min-w-0 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-data font-bold text-[22px] tabular-nums px-3 py-1.5 text-right focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
        <span className="text-[11px] font-medium text-[var(--text-muted)] w-6 shrink-0 text-left">{unit}</span>
      </div>
    </div>
  );
}

export function SettingsPanel({ isOpen, onClose, onReopenOnboarding }: Props) {
  const { sendMessage, status } = useWS();
  const { clickConnected, kickrConnected } = useDeviceStatus();
  const { settings, updateSetting } = useAthleteSettings();

  const handleChange = useCallback((key: keyof AthleteSettings, value: number) => {
    updateSetting(key, value);
    const next = { ...settings, [key]: value };
    sendMessage({ type: "athlete_settings", ...next });
  }, [updateSetting, settings, sendMessage]);

  useEffect(() => {
    if (isOpen) sendMessage({ type: "athlete_settings", ...settings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const wsSearching = status === "connecting" || status === "reconnecting";

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/60 z-[2500]" onClick={onClose} aria-hidden="true" />}
      <div role="dialog" aria-label="Einstellungen" aria-modal="true"
        className={`fixed top-0 right-0 bottom-0 w-[280px] bg-[var(--surface)] border-l border-[var(--border)] z-[3000] flex flex-col transition-transform duration-200 ease-out motion-reduce:transition-none ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] shrink-0">
          <span className="text-[11px] font-medium text-[var(--text)]">Einstellungen</span>
          <button type="button" onClick={onClose} aria-label="Einstellungen schließen"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer -mr-3 rounded transition-colors duration-150">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <span className="text-[9px] font-medium text-[var(--text-muted)]">Athlet</span>
            <NumberInput label="Gewicht" unit="kg" value={settings.weight_kg} min={30} max={200} onChange={v => handleChange("weight_kg", v)} />
            <NumberInput label="Körpergröße" unit="cm" value={settings.height_cm} min={100} max={250} onChange={v => handleChange("height_cm", v)} />
            <NumberInput label="FTP" unit="W" value={settings.ftp_w} min={50} max={600} onChange={v => handleChange("ftp_w", v)} />
          </div>
          <div className="border-t border-[var(--border)]" />
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-medium text-[var(--text-muted)] mb-2">Geräte</span>
            <DeviceRow label="Wahoo KICKR Core" connected={kickrConnected} searching={!kickrConnected && (wsSearching || status === "connected")} />
            <div className="border-t border-[var(--border)]" />
            <DeviceRow label="Zwift Click" connected={clickConnected} searching={!clickConnected} />
          </div>

          {onReopenOnboarding && (
            <>
              <div className="border-t border-[var(--border)]" />
              <button
                type="button"
                onClick={() => { onReopenOnboarding(); onClose(); }}
                className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-150 text-left py-1 cursor-pointer"
              >
                Einführung erneut starten
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
