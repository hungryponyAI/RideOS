import { createContext } from "react";
import type { useProfiles } from "./useProfiles";

export type ProfilesContextValue = ReturnType<typeof useProfiles>;

export const ProfilesContext = createContext<ProfilesContextValue | null>(null);
