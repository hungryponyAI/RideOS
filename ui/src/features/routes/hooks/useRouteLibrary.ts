import { useCallback, useMemo, useState } from "react";
import { useWSSubscription } from "../../../shared/ws/useWSSubscription";
import type { RouteLibraryEntry, RouteLibraryMessage } from "../../../shared/types/route";
import { useOptionalProfileContext } from "../../profiles/useProfileContext";

const CACHE_KEY = "rideos_route_library";
const PROFILE_CACHE_PREFIX = "oudena_routes";

function cacheKey(profileId?: string | null): string {
  return profileId ? `${PROFILE_CACHE_PREFIX}:${profileId}` : CACHE_KEY;
}

function readCache(key: string): RouteLibraryEntry[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RouteLibraryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeCache(key: string, routes: RouteLibraryEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(routes));
  } catch {
    // Ignore local cache write failures; route library updates still render.
  }
}

export function useRouteLibrary(): RouteLibraryEntry[] {
  const profileContext = useOptionalProfileContext();
  const key = cacheKey(profileContext?.activeProfile?.id ?? null);
  const cached = useMemo(() => readCache(key), [key]);
  const [library, setLibrary] = useState<RouteLibraryEntry[]>(cached);

  useWSSubscription<RouteLibraryMessage>("route_library", useCallback((msg) => {
    setLibrary(msg.routes);
    writeCache(key, msg.routes);
  }, [key]));

  return library;
}
