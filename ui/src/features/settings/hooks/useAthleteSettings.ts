import { useCallback, useState } from "react";
import { useOptionalProfileContext } from "../../profiles/useProfileContext";

export interface AthleteSettings {
  height_cm: number;
  weight_kg: number;
  ftp_w: number;
}

const STORAGE_KEY = "rideos-athlete";
const PROFILE_STORAGE_PREFIX = "oudena_profile_settings";
const DEFAULTS: AthleteSettings = { height_cm: 180, weight_kg: 75, ftp_w: 200 };

function storageKey(profileId?: string | null): string {
  return profileId ? `${PROFILE_STORAGE_PREFIX}:${profileId}` : STORAGE_KEY;
}

export function loadAthleteSettings(profileId?: string | null): AthleteSettings {
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    if (raw) {
      const p = JSON.parse(raw) as Partial<AthleteSettings>;
      return {
        height_cm: typeof p.height_cm === "number" && p.height_cm > 0 ? p.height_cm : DEFAULTS.height_cm,
        weight_kg: typeof p.weight_kg === "number" && p.weight_kg > 0 ? p.weight_kg : DEFAULTS.weight_kg,
        ftp_w: typeof p.ftp_w === "number" && p.ftp_w > 0 ? p.ftp_w : DEFAULTS.ftp_w,
      };
    }
  } catch { /* fall through */ }
  return { ...DEFAULTS };
}

export function useAthleteSettings(profileId?: string | null) {
  const profileContext = useOptionalProfileContext();
  const resolvedProfileId = profileId ?? profileContext?.activeProfile?.id ?? null;
  const [settings, setSettings] = useState<AthleteSettings>(() => loadAthleteSettings(resolvedProfileId));

  const updateSetting = useCallback((key: keyof AthleteSettings, value: number) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(storageKey(resolvedProfileId), JSON.stringify(next));
      return next;
    });
  }, [resolvedProfileId]);

  return { settings, updateSetting };
}
