import { useCallback, useState } from "react";
import { useWSSubscription } from "../../../shared/ws/useWSSubscription";
import type { RouteLibraryEntry, RouteLibraryMessage } from "../../../shared/types/route";

export function useRouteLibrary(): RouteLibraryEntry[] {
  const [library, setLibrary] = useState<RouteLibraryEntry[]>([]);
  useWSSubscription<RouteLibraryMessage>("route_library", useCallback((msg) => {
    setLibrary(msg.routes);
  }, []));
  return library;
}
