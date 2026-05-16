import { useEffect } from "react";

export function useAppVisibility(onHidden: () => void) {
  useEffect(() => {
    function handle() {
      if (document.visibilityState === "hidden") onHidden();
    }
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, [onHidden]);
}
