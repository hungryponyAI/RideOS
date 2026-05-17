import { useEffect } from "react";
import { OudenaLogo } from "../../shared/ui/OudenaLogo";
import { useMotionMode } from "../../shared/motion/useMotionMode";

export function StartupIntro({
  onComplete,
  showWelcomeText = true,
}: {
  onComplete: () => void;
  showWelcomeText?: boolean;
}) {
  const { effectiveMode, reducedMotion } = useMotionMode();

  useEffect(() => {
    const duration = reducedMotion
      ? 450
      : showWelcomeText
        ? effectiveMode === "cinematic" ? 2200 : 1000
        : effectiveMode === "cinematic" ? 1050 : 620;
    const timer = window.setTimeout(onComplete, duration);
    return () => window.clearTimeout(timer);
  }, [effectiveMode, reducedMotion, showWelcomeText, onComplete]);

  const logoAnimation = reducedMotion
    ? ""
    : effectiveMode === "cinematic"
      ? "animate-[oudena-intro-logo_900ms_var(--ease-oudena)_both]"
      : "animate-[oudena-fade-in_260ms_ease-out_both]";
  const textAnimation = reducedMotion
    ? ""
    : effectiveMode === "cinematic"
      ? "animate-[oudena-intro-text_900ms_var(--ease-oudena)_520ms_both]"
      : "animate-[oudena-fade-in_260ms_ease-out_180ms_both]";

  return (
    <div
      data-testid="startup-intro"
      className="fixed inset-0 z-[4000] flex flex-col items-center justify-center bg-[var(--bg)] px-6 text-center"
    >
      <div className={`flex flex-col items-center gap-7 ${reducedMotion ? "opacity-100" : ""}`}>
        <div className={logoAnimation}>
          <OudenaLogo variant="mark" height={132} />
        </div>
        {showWelcomeText && (
          <p className={`text-lg sm:text-2xl font-medium tracking-tight text-[var(--text)] ${textAnimation}`}>
            Willkommen bei OUDENA
          </p>
        )}
      </div>
    </div>
  );
}
