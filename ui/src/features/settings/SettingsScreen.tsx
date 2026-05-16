import { useState, useCallback, useEffect } from "react";
import { useTheme } from "../../app/providers/ThemeProvider";
import { useAthleteSettings, type AthleteSettings } from "./hooks/useAthleteSettings";
import { useAppSettings } from "./hooks/useAppSettings";
import { useDeviceStatus } from "./hooks/useDeviceStatus";
import { useStravaStatus } from "../strava/hooks/useStravaStatus";
import { StravaConnectModal, type StravaModalStep } from "../strava/StravaConnectModal";
import { useWS } from "../../shared/ws/useWS";

interface Props {
  onReopenOnboarding?: () => void;
}

// ── primitives ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
      {children}
    </span>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-b-0">
      {children}
    </div>
  );
}

function RowLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-[var(--text)]">{children}</span>
      {sub && <span className="text-[9px] font-medium text-[var(--text-muted)]">{sub}</span>}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-150 cursor-pointer shrink-0 ${checked ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-150 ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

function SegmentControl<T extends string>({ options, value, onChange }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-[var(--border)] overflow-hidden shrink-0">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-[10px] font-medium cursor-pointer transition-colors duration-150 ${opt.value === value ? "bg-[var(--accent)] text-white" : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]"}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function NumberField({ label, unit, value, min, max, onChange }: { label: string; unit: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
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
    <Row>
      <RowLabel>{label}</RowLabel>
      <div className="flex items-center gap-2">
        <input
          type="number" inputMode="numeric" min={min} max={max} step={1} value={raw}
          onChange={e => setRaw(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); }}
          className="w-16 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-data font-bold text-sm tabular-nums px-2 py-1 text-right focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-[10px] font-medium text-[var(--text-muted)] w-5 shrink-0">{unit}</span>
      </div>
    </Row>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 overflow-hidden">
      {children}
    </div>
  );
}

function CollapsibleSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col rounded-xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between px-4 py-3 text-left cursor-pointer group"
        aria-expanded={open}
      >
        <SectionLabel>{label}</SectionLabel>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          aria-hidden="true"
          className={`text-[var(--text-muted)] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="px-4 pb-2">{children}</div>}
    </div>
  );
}

function DisabledRow({ label, sub }: { label: string; sub?: string }) {
  return (
    <Row>
      <RowLabel sub={sub}>{label}</RowLabel>
      <span className="text-[9px] font-medium text-[var(--text-muted)] shrink-0">Noch nicht unterstützt</span>
    </Row>
  );
}

function StravaIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

// ── main screen ──────────────────────────────────────────────────────────────

export function SettingsScreen({ onReopenOnboarding }: Props) {
  const { isDark, toggleTheme } = useTheme();
  const { settings, updateSetting } = useAthleteSettings();
  const { prefs, updatePref } = useAppSettings();
  const { kickrConnected, clickConnected } = useDeviceStatus();
  const { sendMessage } = useWS();
  const { stravaStatus, stravaAuthUrl, stravaError, clearStravaAuthUrl, clearStravaError } = useStravaStatus();

  const [showStravaModal, setShowStravaModal] = useState(false);
  const [modalStep, setModalStep] = useState<StravaModalStep>("idle");
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (stravaAuthUrl && showStravaModal) {
      setModalStep("enter_code");
      window.open(stravaAuthUrl, "_blank");
      clearStravaAuthUrl();
    }
  }, [stravaAuthUrl, showStravaModal, clearStravaAuthUrl]);

  useEffect(() => {
    if (stravaStatus?.connected && modalStep === "connecting") {
      setShowStravaModal(false);
      setModalStep("idle");
    }
  }, [stravaStatus, modalStep]);

  useEffect(() => {
    if (stravaError && showStravaModal) {
      setModalError(stravaError);
      clearStravaError();
    }
  }, [stravaError, showStravaModal, clearStravaError]);

  const handleAthleteChange = useCallback((key: keyof AthleteSettings, value: number) => {
    updateSetting(key, value);
    const next = { ...settings, [key]: value };
    sendMessage({ type: "athlete_settings", ...next });
  }, [updateSetting, settings, sendMessage]);

  const isStravaConnected = stravaStatus?.connected ?? false;
  const isStravaSyncing = stravaStatus?.syncing ?? false;

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)]">
      <div className="max-w-xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Athlet */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Athlet</SectionLabel>
          <Section>
            <NumberField label="Gewicht" unit="kg" value={settings.weight_kg} min={30} max={200} onChange={v => handleAthleteChange("weight_kg", v)} />
            <NumberField label="Körpergröße" unit="cm" value={settings.height_cm} min={100} max={250} onChange={v => handleAthleteChange("height_cm", v)} />
            <NumberField label="FTP" unit="W" value={settings.ftp_w} min={50} max={600} onChange={v => handleAthleteChange("ftp_w", v)} />
          </Section>
        </div>

        {/* Fahrt */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Fahrt</SectionLabel>
          <Section>
            <Row>
              <RowLabel sub="Ghost-Fahrer wird beim Start aktiviert">Ghost standardmäßig aktiv</RowLabel>
              <Toggle checked={prefs.ghost_default} onChange={v => updatePref("ghost_default", v)} label="Ghost standardmäßig aktiv" />
            </Row>
            <Row>
              <RowLabel sub="Kurze Aufwärmphase vor der Fahrt">Aufwärmen aktiviert</RowLabel>
              <Toggle checked={prefs.warmup_enabled} onChange={v => updatePref("warmup_enabled", v)} label="Aufwärmen aktiviert" />
            </Row>
          </Section>
        </div>

        {/* Darstellung */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Darstellung</SectionLabel>
          <Section>
            <Row>
              <RowLabel>Design</RowLabel>
              <SegmentControl
                value={isDark ? "dark" : "light"}
                onChange={v => { if ((v === "dark") !== isDark) toggleTheme(); }}
                options={[{ label: "Hell", value: "light" }, { label: "Dunkel", value: "dark" }]}
              />
            </Row>
            <Row>
              <RowLabel>Einheiten</RowLabel>
              <SegmentControl
                value={prefs.metric_unit}
                onChange={v => updatePref("metric_unit", v)}
                options={[{ label: "Metrisch", value: "metric" }, { label: "Imperial", value: "imperial" }]}
              />
            </Row>
            <Row>
              <RowLabel sub="Kartenansicht während der Fahrt">Kamera</RowLabel>
              <SegmentControl
                value={prefs.camera_default}
                onChange={v => updatePref("camera_default", v)}
                options={[{ label: "Folgen", value: "follow" }, { label: "Übersicht", value: "overview" }]}
              />
            </Row>
          </Section>
        </div>

        {/* Integrationen */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Integrationen</SectionLabel>
          <Section>
            <Row>
              <RowLabel sub={isStravaConnected ? (stravaStatus?.athleteName ?? undefined) : undefined}>
                <span className="flex items-center gap-1.5">
                  <span className="text-[#FC4C02]"><StravaIcon size={12} /></span>
                  Strava
                </span>
              </RowLabel>
              {isStravaConnected ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => sendMessage({ type: "strava_sync" })}
                    disabled={isStravaSyncing}
                    className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] rounded-lg px-3 py-1.5 cursor-pointer disabled:opacity-40 transition-colors duration-150"
                  >
                    {isStravaSyncing ? "Synchronisiere…" : "Sync"}
                  </button>
                  <button
                    type="button"
                    onClick={() => sendMessage({ type: "strava_disconnect" })}
                    className="text-[10px] font-medium text-[var(--critical)] hover:opacity-80 border border-[var(--critical)] rounded-lg px-3 py-1.5 cursor-pointer transition-colors duration-150"
                  >
                    Trennen
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setShowStravaModal(true); setModalStep("idle"); setModalError(null); }}
                  className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)] hover:text-[#FC4C02] border border-[var(--border)] hover:border-[#FC4C02] rounded-lg px-3 py-1.5 cursor-pointer transition-colors duration-150 shrink-0"
                >
                  Verbinden
                </button>
              )}
            </Row>
          </Section>
        </div>

        {/* Trainer */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Trainer</SectionLabel>
          <Section>
            <DisabledRow label="Schwierigkeitsstufe" sub="Passt die simulierte Steigung an" />
            <DisabledRow label="Widerstandsmodus" sub="ERG / Simulation / Resistenz" />
          </Section>
        </div>

        {/* Erweitert (collapsed) */}
        <CollapsibleSection label="Erweitert">
          <div className="flex flex-col">
            {onReopenOnboarding && (
              <Row>
                <RowLabel>Einführung</RowLabel>
                <button
                  type="button"
                  onClick={onReopenOnboarding}
                  className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] rounded-lg px-3 py-1.5 cursor-pointer transition-colors duration-150 shrink-0"
                >
                  Erneut starten
                </button>
              </Row>
            )}
          </div>
        </CollapsibleSection>

      </div>

      {showStravaModal && (
        <StravaConnectModal
          step={modalStep}
          authUrl={stravaAuthUrl}
          error={modalError}
          onClose={() => { setShowStravaModal(false); setModalStep("idle"); setModalError(null); }}
          onRequestUrl={() => { setModalStep("waiting_url"); sendMessage({ type: "strava_get_auth_url" }); }}
          onSubmitCode={code => { setModalStep("connecting"); setModalError(null); sendMessage({ type: "strava_submit_code", code }); }}
        />
      )}
    </div>
  );
}
