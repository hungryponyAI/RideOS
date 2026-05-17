import { useMemo, useState } from "react";
import { RouteProfileIcon } from "./RouteProfileIcon";
import { MAX_PROFILES } from "./types";

const ICON_SEEDS = ["ascent", "switchback", "ridge"];

function errorCopy(error: string | null): string | null {
  if (error === null) return null;
  if (error === "profile_name_required") return "Bitte gib einen Namen ein.";
  if (error === "profile_name_duplicate") return "Dieses Profil gibt es schon.";
  if (error === "profile_limit_reached") return `Maximal ${MAX_PROFILES} Profile sind möglich.`;
  return "Profil konnte nicht erstellt werden.";
}

export function ProfileCreateModal({
  onCreate,
  onClose,
}: {
  onCreate: (displayName: string, iconSeed: string) => void;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [selectedSeed, setSelectedSeed] = useState(ICON_SEEDS[0]);
  const [error, setError] = useState<string | null>(null);
  const previewSeed = useMemo(
    () => `${selectedSeed}-${displayName.trim() || "oudena"}`,
    [selectedSeed, displayName],
  );

  const handleSubmit = () => {
    try {
      onCreate(displayName, previewSeed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Profil erstellen"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-elevated overflow-hidden animate-[oudena-screen-in_350ms_var(--ease-oudena)_both] motion-reduce:animate-none">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">Profil erstellen</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Profil erstellen schließen"
            className="min-w-[44px] min-h-[44px] -mr-3 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          <div className="flex justify-center">
            <RouteProfileIcon seed={previewSeed} selected size={116} />
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Name</span>
            <input
              value={displayName}
              onChange={event => {
                setDisplayName(event.target.value);
                setError(null);
              }}
              autoFocus
              maxLength={24}
              className="min-h-[44px] rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-medium text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="Dein Name"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Route</span>
            <div className="grid grid-cols-3 gap-2">
              {ICON_SEEDS.map(seed => {
                const isSelected = selectedSeed === seed;
                return (
                  <button
                    key={seed}
                    type="button"
                    onClick={() => setSelectedSeed(seed)}
                    aria-label={`Routenicon ${seed}`}
                    aria-pressed={isSelected}
                    className={`flex min-h-[68px] items-center justify-center rounded-xl border transition-colors duration-150 cursor-pointer ${
                      isSelected
                        ? "border-[var(--accent)] bg-[rgba(116,175,203,0.10)]"
                        : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]"
                    }`}
                  >
                    <RouteProfileIcon seed={seed} selected={isSelected} size={54} />
                  </button>
                );
              })}
            </div>
          </div>

          {errorCopy(error) && (
            <p className="text-xs text-[var(--critical)]" role="alert">
              {errorCopy(error)}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl px-4 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="min-h-[44px] rounded-xl bg-[var(--accent)] px-5 text-xs font-semibold text-white hover:opacity-90 transition-opacity duration-150 cursor-pointer"
            >
              Profil anlegen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
