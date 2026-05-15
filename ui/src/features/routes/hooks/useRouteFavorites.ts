import { useCallback, useState } from "react";

const STORAGE_KEY = "oudena_route_favorites";

function loadFavorites(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return new Set(stored ? (JSON.parse(stored) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(favorites: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
}

export function useRouteFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);

  const toggle = useCallback((routeId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      saveFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((routeId: string) => favorites.has(routeId), [favorites]);

  return { favorites, toggle, isFavorite };
}
