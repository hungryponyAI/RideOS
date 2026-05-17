import { useCallback, useState } from "react";
import { useOptionalProfileContext } from "../../profiles/useProfileContext";

const STORAGE_KEY = "oudena_route_favorites";
const PROFILE_STORAGE_PREFIX = "oudena_favorites";

function storageKey(profileId?: string | null): string {
  return profileId ? `${PROFILE_STORAGE_PREFIX}:${profileId}` : STORAGE_KEY;
}

function loadFavorites(key: string): Set<string> {
  try {
    const stored = localStorage.getItem(key);
    return new Set(stored ? (JSON.parse(stored) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(key: string, favorites: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...favorites]));
}

export function useRouteFavorites() {
  const profileContext = useOptionalProfileContext();
  const key = storageKey(profileContext?.activeProfile?.id ?? null);
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites(key));

  const toggle = useCallback((routeId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      saveFavorites(key, next);
      return next;
    });
  }, [key]);

  const isFavorite = useCallback((routeId: string) => favorites.has(routeId), [favorites]);

  return { favorites, toggle, isFavorite };
}
