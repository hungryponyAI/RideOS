import { loadAppPreferences } from "../settings/hooks/useAppSettings";
import type { RideConfig } from "./RideOptions";

export function createDefaultRideConfig(): RideConfig {
  return {
    ghost: loadAppPreferences().ghost_default,
    reverse: false,
    cutoutStartM: null,
    cutoutEndM: null,
    laps: 1,
    warmup: false,
    cooldown: false,
    ergMode: false,
    physicsMode: true,
  };
}
