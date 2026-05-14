import { useEffect, useState, useCallback } from "react";
import { useWS } from "../../shared/ws/useWS";
import { useDeviceStatus } from "./hooks/useDeviceStatus";
import { useAthleteSettings, type AthleteSettings } from "./hooks/useAthleteSettings";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function DeviceRow({ label, connected, searching }: { label: string; connected: boolean; searching?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[11px] font-condensed font-bold uppercase tracking-widest text-[var(--text)]">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-[#22C55E] animate-pulse" : searching ? "bg-[#FFF200] animate-pulse" : "bg-[#E10600]"}`} />
        <span className={`text-[9px] font-condensed font-bold uppercase tracking-widest ${connected ? "text-[#22C55E]" : searching ? "text-[#FFF200]" : "text-[#666666]"}`}>
          {connected ? "VERBUNDEN" : searching ? "SUCHE…" : "GETRENNT"}
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
      <span className="text-[9px] font-condensed font-bold tracking-widest uppercase text-[var(--text-muted)]">{label}</span>
      <div className="flex items-center gap-2">
        <input type="number" inputMode="numeric" min={min} max={max} step={1} value={raw}
          onChange={e => setRaw(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); }}
          className="flex-1 min-w-0 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] font-data font-bold text-[22px] tabular-nums px-3 py-1.5 text-right focus:outline-none focus:border-[#FFF200] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
        <span className="text-[11px] font-condensed font-bold uppercase text-[var(--text-muted)] w-6 shrink-0 text-left">{unit}</span>
      </div>
    </div>
  );
}

export function SettingsPanel({ isOpen, onClose }: Props) {
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <span className="text-[11px] font-condensed font-bold tracking-widest uppercase text-[var(--text)]">EINSTELLUNGEN</span>
          <button type="button" onClick={onClose} aria-label="Einstellungen schließen" className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <span className="text-[9px] font-condensed font-bold tracking-[0.2em] uppercase text-[var(--label-accent)]">ATHLET</span>
            <NumberInput label="GEWICHT" unit="KG" value={settings.weight_kg} min={30} max={200} onChange={v => handleChange("weight_kg", v)} />
            <NumberInput label="KÖRPERGRÖSSE" unit="CM" value={settings.height_cm} min={100} max={250} onChange={v => handleChange("height_cm", v)} />
            <NumberInput label="FTP" unit="W" value={settings.ftp_w} min={50} max={600} onChange={v => handleChange("ftp_w", v)} />
          </div>
          <div className="border-t border-[var(--border)]" />
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-condensed font-bold tracking-[0.2em] uppercase text-[var(--label-accent)] mb-2">GERÄTE</span>
            <DeviceRow label="WAHOO KICKR CORE" connected={kickrConnected} searching={!kickrConnected && (wsSearching || status === "connected")} />
            <div className="border-t border-[var(--border)]" />
            <DeviceRow label="ZWIFT CLICK" connected={clickConnected} searching={!clickConnected} />
          </div>
        </div>
      </div>
    </>
  );
}
