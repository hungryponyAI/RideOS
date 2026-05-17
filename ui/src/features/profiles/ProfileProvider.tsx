import type { ReactNode } from "react";
import { ProfilesContext } from "./ProfileContext";
import { useProfiles } from "./useProfiles";

export function ProfileProvider({ children }: { children: ReactNode }) {
  const value = useProfiles();
  return (
    <ProfilesContext.Provider value={value}>
      {children}
    </ProfilesContext.Provider>
  );
}
