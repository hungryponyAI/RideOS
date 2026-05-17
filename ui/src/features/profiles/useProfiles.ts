import { useCallback, useMemo, useState } from "react";
import type { OudenaProfile } from "./types";
import { MAX_PROFILES } from "./types";

const PROFILES_KEY = "oudena_profiles";
const ACTIVE_PROFILE_KEY = "oudena_active_profile_id";
const LEGACY_PROFILE_ID = "kristof-local";

const LEGACY_TO_PROFILE_KEYS = [
  ["rideos-athlete", `oudena_profile_settings:${LEGACY_PROFILE_ID}`],
  ["rideos-prefs", `oudena_profile_prefs:${LEGACY_PROFILE_ID}`],
  ["rideos_route_library", `oudena_routes:${LEGACY_PROFILE_ID}`],
  ["rideos_ride_history", `oudena_history:${LEGACY_PROFILE_ID}`],
  ["oudena_route_favorites", `oudena_favorites:${LEGACY_PROFILE_ID}`],
  ["rideos_last_route_id", `oudena_last_route_id:${LEGACY_PROFILE_ID}`],
] as const;

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeProfile(raw: Partial<OudenaProfile>): OudenaProfile | null {
  if (typeof raw.id !== "string" || raw.id.trim() === "") return null;
  if (typeof raw.displayName !== "string" || raw.displayName.trim() === "") return null;
  const timestamp = nowIso();
  return {
    id: raw.id,
    displayName: raw.displayName.trim(),
    iconSeed: typeof raw.iconSeed === "string" && raw.iconSeed.trim() !== "" ? raw.iconSeed : raw.id,
    iconVariant: "route",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : timestamp,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : timestamp,
    cloudId: typeof raw.cloudId === "string" ? raw.cloudId : null,
    syncStatus: raw.syncStatus === "pending" || raw.syncStatus === "synced" ? raw.syncStatus : "local",
  };
}

function readProfiles(): OudenaProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return createKristofProfileFromLegacyData();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const profiles = parsed
      .map(item => normalizeProfile(item as Partial<OudenaProfile>))
      .filter((profile): profile is OudenaProfile => profile !== null)
      .slice(0, MAX_PROFILES);
    return profiles.length > 0 ? profiles : createKristofProfileFromLegacyData();
  } catch {
    return createKristofProfileFromLegacyData();
  }
}

function writeProfiles(profiles: OudenaProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles.slice(0, MAX_PROFILES)));
}

function readActiveProfileId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROFILE_KEY);
  } catch {
    return null;
  }
}

function writeActiveProfileId(profileId: string | null) {
  if (profileId === null) {
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
}

function hasLegacyProfileData(): boolean {
  return LEGACY_TO_PROFILE_KEYS.some(([legacyKey]) => {
    const value = localStorage.getItem(legacyKey);
    return value !== null && value !== "" && value !== "[]" && value !== "{}";
  });
}

function createKristofProfileFromLegacyData(): OudenaProfile[] {
  if (!hasLegacyProfileData()) return [];

  const timestamp = nowIso();
  const profile: OudenaProfile = {
    id: LEGACY_PROFILE_ID,
    displayName: "Kristof",
    iconSeed: "kristof-legacy-route",
    iconVariant: "route",
    createdAt: timestamp,
    updatedAt: timestamp,
    cloudId: null,
    syncStatus: "local",
  };

  LEGACY_TO_PROFILE_KEYS.forEach(([legacyKey, profileKey]) => {
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue !== null && localStorage.getItem(profileKey) === null) {
      localStorage.setItem(profileKey, legacyValue);
    }
  });
  writeProfiles([profile]);

  return [profile];
}

export interface CreateProfileInput {
  displayName: string;
  iconSeed?: string;
}

export function useProfiles() {
  const initialProfiles = useMemo(() => readProfiles(), []);
  const [profiles, setProfiles] = useState<OudenaProfile[]>(initialProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    const stored = readActiveProfileId();
    if (initialProfiles.some(profile => profile.id === stored)) return stored;
    const fallbackId = initialProfiles[0]?.id ?? null;
    if (fallbackId) writeActiveProfileId(fallbackId);
    return fallbackId;
  });

  const activeProfile = useMemo(
    () => profiles.find(profile => profile.id === activeProfileId) ?? null,
    [profiles, activeProfileId],
  );

  const selectProfile = useCallback((profileId: string) => {
    setProfiles(current => {
      if (!current.some(profile => profile.id === profileId)) return current;
      writeActiveProfileId(profileId);
      setActiveProfileId(profileId);
      return current;
    });
  }, []);

  const clearActiveProfile = useCallback(() => {
    writeActiveProfileId(null);
    setActiveProfileId(null);
  }, []);

  const createProfile = useCallback((input: CreateProfileInput): OudenaProfile => {
    const displayName = input.displayName.trim();
    if (!displayName) throw new Error("profile_name_required");
    if (profiles.length >= MAX_PROFILES) throw new Error("profile_limit_reached");
    if (profiles.some(profile => profile.displayName.toLowerCase() === displayName.toLowerCase())) {
      throw new Error("profile_name_duplicate");
    }

    const timestamp = nowIso();
    const id = createId();
    const createdProfile: OudenaProfile = {
      id,
      displayName,
      iconSeed: input.iconSeed?.trim() || `${displayName}-${id}`,
      iconVariant: "route",
      createdAt: timestamp,
      updatedAt: timestamp,
      cloudId: null,
      syncStatus: "local",
    };
    const next = [...profiles, createdProfile];
    writeProfiles(next);
    writeActiveProfileId(createdProfile.id);
    setProfiles(next);
    setActiveProfileId(createdProfile.id);
    return createdProfile;
  }, [profiles]);

  return {
    profiles,
    activeProfile,
    activeProfileId,
    canCreateProfile: profiles.length < MAX_PROFILES,
    createProfile,
    selectProfile,
    clearActiveProfile,
  };
}
