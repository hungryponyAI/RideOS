import { useContext } from "react";
import { ProfilesContext } from "./ProfileContext";

export function useProfileContext() {
  const value = useContext(ProfilesContext);
  if (!value) throw new Error("useProfileContext must be used within ProfileProvider");
  return value;
}

export function useOptionalProfileContext() {
  return useContext(ProfilesContext);
}
