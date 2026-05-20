import { useCallback, useState } from "react";
import { useOptionalProfileContext } from "../../profiles/useProfileContext";

export type ShiftMode = "manual" | "cassette" | "auto";

export interface AppPreferences {
  ghost_default: boolean;
  warmup_enabled: boolean;
  metric_unit: "metric" | "imperial";
  camera_default: "follow" | "overview";
  shift_mode: ShiftMode;
  auto_cadence_min_rpm: number;
  auto_cadence_max_rpm: number;
}

export interface ShiftSettings {
  mode: ShiftMode;
  auto_cadence_min_rpm: number;
  auto_cadence_max_rpm: number;
}

export function shiftSettingsFromPrefs(prefs: AppPreferences): ShiftSettings {
  return {
    mode: prefs.shift_mode,
    auto_cadence_min_rpm: prefs.auto_cadence_min_rpm,
    auto_cadence_max_rpm: prefs.auto_cadence_max_rpm,
  };
}

const STORAGE_KEY = "rideos-prefs";
const PROFILE_STORAGE_PREFIX = "oudena_profile_prefs";
const DEFAULTS: AppPreferences = {
  ghost_default: true,
  warmup_enabled: false,
  metric_unit: "metric",
  camera_default: "follow",
  shift_mode: "manual",
  auto_cadence_min_rpm: 82,
  auto_cadence_max_rpm: 92,
};

function storageKey(profileId?: string | null): string {
  return profileId ? `${PROFILE_STORAGE_PREFIX}:${profileId}` : STORAGE_KEY;
}

export function loadAppPreferences(profileId?: string | null): AppPreferences {
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    if (raw) {
      const p = JSON.parse(raw) as Partial<AppPreferences>;
      const shiftMode: ShiftMode =
        p.shift_mode === "cassette" ? "cassette" : p.shift_mode === "auto" ? "auto" : "manual";
      const minRpm = typeof p.auto_cadence_min_rpm === "number" ? Math.round(p.auto_cadence_min_rpm) : DEFAULTS.auto_cadence_min_rpm;
      const maxRpm = typeof p.auto_cadence_max_rpm === "number" ? Math.round(p.auto_cadence_max_rpm) : DEFAULTS.auto_cadence_max_rpm;
      return {
        ghost_default: typeof p.ghost_default === "boolean" ? p.ghost_default : DEFAULTS.ghost_default,
        warmup_enabled: typeof p.warmup_enabled === "boolean" ? p.warmup_enabled : DEFAULTS.warmup_enabled,
        metric_unit: p.metric_unit === "imperial" ? "imperial" : "metric",
        camera_default: p.camera_default === "overview" ? "overview" : "follow",
        shift_mode: shiftMode,
        auto_cadence_min_rpm: Math.max(50, Math.min(130, minRpm)),
        auto_cadence_max_rpm: Math.max(50, Math.min(130, maxRpm)),
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
