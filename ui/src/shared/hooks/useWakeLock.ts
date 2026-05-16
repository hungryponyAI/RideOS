import { useEffect, useState } from "react";

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
  removeEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

export interface WakeLockState {
  active: boolean;
  warning: string | null;
}

export function useWakeLock(enabled: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>({ active: false, warning: null });

  useEffect(() => {
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const release = async () => {
      const current = sentinel;
      sentinel = null;
      if (!cancelled) setState({ active: false, warning: null });
      if (!current) return;
      try {
        await current.release();
      } catch (error) {
        console.warn("[RideOS] Wake lock release failed", error);
      }
    };

    const request = async () => {
      if (!enabled || cancelled) return;
      if (document.visibilityState !== "visible") return;

      const wakeLock = (navigator as WakeLockNavigator).wakeLock;
      if (!wakeLock) {
        setState({
          active: false,
          warning: "Ruhestand kann in dieser Umgebung nicht automatisch verhindert werden.",
        });
        return;
      }

      try {
        sentinel = await wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          sentinel = null;
          return;
        }
        sentinel.addEventListener("release", handleRelease);
        setState({ active: true, warning: null });
      } catch (error) {
        console.warn("[RideOS] Wake lock request failed", error);
        setState({
          active: false,
          warning: "Ruhestand konnte nicht verhindert werden. Bitte Energieeinstellungen prüfen.",
        });
      }
    };

    const handleRelease = () => {
      sentinel?.removeEventListener("release", handleRelease);
      sentinel = null;
      setState((current) => ({ ...current, active: false }));
      void request();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void request();
      }
    };

    if (enabled) {
      void request();
      document.addEventListener("visibilitychange", handleVisibilityChange);
    } else {
      void release();
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (sentinel) sentinel.removeEventListener("release", handleRelease);
      void release();
    };
  }, [enabled]);

  return state;
}
