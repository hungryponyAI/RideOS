import { useCallback, useMemo, useState } from "react";
import { useWSSubscription } from "../../../shared/ws/useWSSubscription";
import type { RouteLibraryEntry, RouteLibraryMessage } from "../../../shared/types/route";

const CACHE_KEY = "rideos_route_library";

function readCache(): RouteLibraryEntry[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as RouteLibraryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeCache(routes: RouteLibraryEntry[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(routes));
  } catch {}
}

export function useRouteLibrary(): RouteLibraryEntry[] {
  const cached = useMemo(() => readCache(), []);
  const [library, setLibrary] = useState<RouteLibraryEntry[]>(cached);

  useWSSubscription<RouteLibraryMessage>("route_library", useCallback((msg) => {
    setLibrary(msg.routes);
    writeCache(msg.routes);
  }, []));

  return library;
}
