import { useCallback, useState } from "react";
import { useOptionalProfileContext } from "../../profiles/useProfileContext";

export interface AppPreferences {
  ghost_default: boolean;
  warmup_enabled: boolean;
  metric_unit: "metric" | "imperial";
  camera_default: "follow" | "overview";
}

const STORAGE_KEY = "rideos-prefs";
const PROFILE_STORAGE_PREFIX = "oudena_profile_prefs";
const DEFAULTS: AppPreferences = {
  ghost_default: true,
  warmup_enabled: false,
  metric_unit: "metric",
  camera_default: "follow",
};

function storageKey(profileId?: string | null): string {
  return profileId ? `${PROFILE_STORAGE_PREFIX}:${profileId}` : STORAGE_KEY;
}

export function loadAppPreferences(profileId?: string | null): AppPreferences {
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    if (raw) {
      const p = JSON.parse(raw) as Partial<AppPreferences>;
      return {
        ghost_default: typeof p.ghost_default === "boolean" ? p.ghost_default : DEFAULTS.ghost_default,
        warmup_enabled: typeof p.warmup_enabled === "boolean" ? p.warmup_enabled : DEFAULTS.warmup_enabled,
        metric_unit: p.metric_unit === "imperial" ? "imperial" : "metric",
        camera_default: p.camera_default === "overview" ? "overview" : "follow",
      };
    }
  } catch { /* fall through */ }
  return { ...DEFAULTS };
}

export function useAppSettings() {
  const profileContext = useOptionalProfileContext();
  const profileId = profileContext?.activeProfile?.id ?? null;
  const [prefs, setPrefs] = useState<AppPreferences>(() => loadAppPreferences(profileId));

  const updatePref = useCallback(<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(storageKey(profileId), JSON.stringify(next));
      return next;
    });
  }, [profileId]);

  return { prefs, updatePref };
}
