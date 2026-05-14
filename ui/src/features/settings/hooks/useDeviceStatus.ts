import { useCallback, useState } from "react";
import { useWSSubscription } from "../../../shared/ws/useWSSubscription";
import type { ClickStatusMessage, KickrStatusMessage } from "../../../shared/types/route";

export function useDeviceStatus() {
  const [clickConnected, setClickConnected] = useState(false);
  const [kickrConnected, setKickrConnected] = useState(false);

  useWSSubscription<ClickStatusMessage>("click_status", useCallback((msg) => {
    setClickConnected(msg.connected);
  }, []));

  useWSSubscription<KickrStatusMessage>("kickr_status", useCallback((msg) => {
    setKickrConnected(msg.connected);
  }, []));

  return { clickConnected, kickrConnected };
}
