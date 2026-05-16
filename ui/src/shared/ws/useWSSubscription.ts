import { useEffect } from "react";
import { useWS } from "./useWS";

export function useWSSubscription<T>(
  type: string,
  onMessage: (msg: T) => void,
): void {
  const { subscribe } = useWS();
  useEffect(
    () => subscribe(type, onMessage as (payload: unknown) => void),
    [subscribe, type, onMessage],
  );
}
