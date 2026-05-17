import { useState } from "react";
import { OudenaLogo } from "../../shared/ui/OudenaLogo";
import { useMotionMode } from "../../shared/motion/useMotionMode";
import { ProfileCreateModal } from "./ProfileCreateModal";
import { RouteProfileIcon } from "./RouteProfileIcon";
import { useProfileContext } from "./useProfileContext";

export function ProfileSelectionScreen({ onProfileSelected }: { onProfileSelected: () => void }) {
  const { profiles, canCreateProfile, createProfile, selectProfile } = useProfileContext();
  const { effectiveMode, reducedMotion } = useMotionMode();
  const [creating, setCreating] = useState(false);

  const handleSelect = (profileId: string) => {
    selectProfile(profileId);
    onProfileSelected();
  };

  const handleCreate = (displayName: string, iconSeed: string) => {
    createProfile({ displayName, iconSeed });
    setCreating(false);
    onProfileSelected();
  };

  const animateTiles = !reducedMotion && effectiveMode === "cinematic";

  return (
    <div
      data-testid="profile-selection-screen"
      className="w-full h-screen overflow-y-auto bg-[var(--bg)] text-[var(--text)] flex flex-col"
    >
      <header className="shrink-0 flex items-center justify-center px-6 pt-10 pb-5">
        <OudenaLogo height={42} />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 pb-14">
        <div className="w-full max-w-3xl flex flex-col items-center gap-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[var(--text)]">
              Wer fährt?
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Wähle dein Profil und starte in deine OUDENA Umgebung.
            </p>
          </div>

          <div className="flex flex-wrap items-start justify-center gap-5 sm:gap-7">
            {profiles.map((profile, index) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => handleSelect(profile.id)}
                className={`group flex w-[132px] flex-col items-center gap-3 text-center cursor-pointer transition-[transform,opacity] duration-300 ease-oudena hover:-translate-y-1 focus-visible:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                  animateTiles ? "animate-[oudena-profile-in_520ms_var(--ease-oudena)_both]" : ""
                }`}
                style={animateTiles ? { animationDelay: `${160 + index * 70}ms` } : undefined}
              >
                <span className="rounded-[28px] transition-transform duration-300 ease-oudena group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                  <RouteProfileIcon seed={profile.iconSeed} size={124} />
                </span>
                <span className="max-w-[132px] truncate text-sm font-medium text-[var(--text-muted)] transition-colors duration-150 group-hover:text-[var(--text)]">
                  {profile.displayName}
                </span>
              </button>
            ))}

            {canCreateProfile && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className={`group flex w-[132px] flex-col items-center gap-3 text-center cursor-pointer transition-[transform,opacity] duration-300 ease-oudena hover:-translate-y-1 focus-visible:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                  animateTiles ? "animate-[oudena-profile-in_520ms_var(--ease-oudena)_both]" : ""
                }`}
                style={animateTiles ? { animationDelay: `${160 + profiles.length * 70}ms` } : undefined}
              >
                <span className="flex h-[124px] w-[124px] items-center justify-center rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)] transition-colors duration-150 group-hover:border-[var(--accent)] group-hover:text-[var(--accent)]">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </span>
                <span className="text-sm font-medium text-[var(--text-muted)] transition-colors duration-150 group-hover:text-[var(--text)]">
                  Profil hinzufügen
                </span>
              </button>
            )}
          </div>
        </div>
      </main>

      {creating && (
        <ProfileCreateModal
          onCreate={handleCreate}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
