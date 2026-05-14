import { useState, useRef, useEffect } from "react";

function extractCode(input: string): string {
  const match = input.match(/[?&]code=([^&\s]+)/);
  return match ? match[1] : input.trim();
}

function StravaIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

export type StravaModalStep = "idle" | "waiting_url" | "enter_code" | "connecting";

interface Props {
  step: StravaModalStep;
  authUrl: string | null;
  error: string | null;
  onClose: () => void;
  onRequestUrl: () => void;
  onSubmitCode: (code: string) => void;
}

export function StravaConnectModal({ step, authUrl, error, onClose, onRequestUrl, onSubmitCode }: Props) {
  const [codeInput, setCodeInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "enter_code") setTimeout(() => inputRef.current?.focus(), 50);
  }, [step]);

  const handleSubmit = () => {
    const code = extractCode(codeInput);
    if (code) onSubmitCode(code);
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[var(--bg)] border border-[var(--border)] w-[480px] max-w-[90vw] p-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#FC4C02]">
            <StravaIcon size={16} />
            <span className="font-condensed font-bold text-[13px] tracking-widest uppercase">Mit Strava verbinden</span>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer font-bold text-lg leading-none" aria-label="Schließen">×</button>
        </div>

        <div className={`flex flex-col gap-3 ${step === "enter_code" || step === "connecting" ? "opacity-50" : ""}`}>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#FC4C02] text-white font-condensed font-bold text-[10px] flex items-center justify-center">1</span>
            <div className="flex flex-col gap-2 flex-1">
              <span className="font-condensed font-bold text-[11px] tracking-wide text-[var(--text)] uppercase">Strava-Anmeldung öffnen</span>
              {step === "idle" && (
                <button type="button" onClick={onRequestUrl} className="self-start bg-[#FC4C02] text-white font-condensed font-bold text-[11px] tracking-widest uppercase px-4 py-2 cursor-pointer hover:bg-[#e04400] transition-colors">Strava öffnen →</button>
              )}
              {step === "waiting_url" && <span className="text-[10px] font-condensed text-[var(--text-muted)] tracking-wide">Wird geladen…</span>}
              {(step === "enter_code" || step === "connecting") && authUrl && (
                <button type="button" onClick={() => window.open(authUrl, "_blank")} className="self-start border border-[var(--border)] text-[var(--text-muted)] font-condensed font-bold text-[10px] tracking-widest uppercase px-3 py-1.5 cursor-pointer hover:border-[#FC4C02] hover:text-[#FC4C02] transition-colors">Nochmals öffnen</button>
              )}
            </div>
          </div>
        </div>

        <div className={`flex flex-col gap-3 ${step === "idle" || step === "waiting_url" ? "opacity-40 pointer-events-none" : ""}`}>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#FC4C02] text-white font-condensed font-bold text-[10px] flex items-center justify-center">2</span>
            <div className="flex flex-col gap-2 flex-1">
              <span className="font-condensed font-bold text-[11px] tracking-wide text-[var(--text)] uppercase">Code aus der URL einfügen</span>
              <p className="text-[10px] font-condensed text-[var(--text-muted)] leading-relaxed">Nach der Anmeldung erscheint der Code nach <code className="text-[var(--text)] bg-[var(--surface)] px-1">code=</code> in der URL.</p>
              <input ref={inputRef} type="text" placeholder="http://localhost/…?code=abc123 oder nur abc123"
                value={codeInput} onChange={e => setCodeInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
                className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] font-condensed text-[11px] px-3 py-2 focus:outline-none focus:border-[#FC4C02] placeholder:text-[var(--text-muted)]"
                disabled={step === "connecting"} />
            </div>
          </div>
        </div>

        {error && <div className="text-[10px] font-condensed font-bold text-[#E10600] tracking-wide border border-[#E10600] px-3 py-2">{error}</div>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="font-condensed font-bold text-[11px] tracking-widest uppercase text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer px-4 py-2">Abbrechen</button>
          <button type="button" onClick={handleSubmit} disabled={step !== "enter_code" || !codeInput.trim()}
            className="bg-[#FC4C02] text-white font-condensed font-bold text-[11px] tracking-widest uppercase px-6 py-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#e04400] transition-colors">
            {step === "connecting" ? "Verbinde…" : "Verbinden"}
          </button>
        </div>
      </div>
    </div>
  );
}
