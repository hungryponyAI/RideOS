export interface OudenaProfile {
  id: string;
  displayName: string;
  iconSeed: string;
  iconVariant: "route";
  createdAt: string;
  updatedAt: string;
  cloudId: string | null;
  syncStatus: "local" | "pending" | "synced";
}

export const MAX_PROFILES = 3;
