import { useCallback, useState } from "react";
import { useWSSubscription } from "../../../shared/ws/useWSSubscription";
import type {
  StravaStatusMessage,
  StravaAuthUrlMessage,
  StravaErrorMessage,
} from "../../../shared/types/route";

export interface StravaStatus {
  connected: boolean;
  athleteName: string | null;
  syncing: boolean;
}

export function useStravaStatus() {
  const [stravaStatus, setStravaStatus] = useState<StravaStatus | null>(null);
  const [stravaAuthUrl, setStravaAuthUrl] = useState<string | null>(null);
  const [stravaError, setStravaError] = useState<string | null>(null);

  useWSSubscription<StravaStatusMessage>("strava_status", useCallback((msg) => {
    setStravaStatus({ connected: msg.connected, athleteName: msg.athlete_name, syncing: msg.syncing });
  }, []));

  useWSSubscription<StravaAuthUrlMessage>("strava_auth_url", useCallback((msg) => {
    setStravaAuthUrl(msg.url);
  }, []));

  useWSSubscription<StravaErrorMessage>("strava_error", useCallback((msg) => {
    setStravaError(msg.message);
  }, []));

  return {
    stravaStatus,
    stravaAuthUrl,
    stravaError,
    clearStravaAuthUrl: useCallback(() => setStravaAuthUrl(null), []),
    clearStravaError: useCallback(() => setStravaError(null), []),
  };
}
