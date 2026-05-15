import { useCallback, useEffect, useState } from "react";
import { useWS } from "../../../shared/ws/useWS";
import { useWSSubscription } from "../../../shared/ws/useWSSubscription";
import type { RoutePreviewMessage } from "../../../shared/types/route";

export interface RoutePreview {
  lats: number[];
  lons: number[];
}

export function useRoutePreview(routeId: string | null): RoutePreview | null {
  const { sendMessage } = useWS();
  const [preview, setPreview] = useState<RoutePreview | null>(null);

  useEffect(() => {
    setPreview(null);
    if (routeId) sendMessage({ type: "preview_route", route_id: routeId });
  }, [routeId, sendMessage]);

  useWSSubscription<RoutePreviewMessage>(
    "route_preview",
    useCallback(
      (msg) => {
        if (msg.route_id === routeId) setPreview({ lats: msg.lats, lons: msg.lons });
      },
      [routeId],
    ),
  );

  return preview;
}
