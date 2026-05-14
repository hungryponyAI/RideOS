import { memo } from "react";
import type { ConnectionStatus } from "../types/telemetry";

interface Props {
  status: ConnectionStatus;
}

export const ConnectionBanner = memo(function ConnectionBanner({ status }: Props) {
  if (status === "live" || status === "connected") {
    return (
      <div
        className="h-7 w-full flex items-center justify-end px-4 gap-2 bg-[var(--surface)] border-b border-[var(--border)]"
        role="status"
        aria-label="Verbindungsstatus: Live"
      >
        <span className="w-2 h-2 rounded-full bg-[#22C55E] shrink-0 animate-pulse" />
        <span className="text-[10px] font-condensed font-bold uppercase tracking-widest text-[#22C55E]">
          LIVE
        </span>
      </div>
    );
  }

  if (status === "connecting" || status === "reconnecting") {
    return (
      <div className="h-7 w-full flex items-center justify-center gap-2 bg-[#FFF200]" role="status">
        <span className="w-2 h-2 rounded-full bg-black animate-pulse shrink-0" />
        <span className="text-[10px] font-condensed font-bold uppercase tracking-widest text-black">
          VERBINDUNG WIRD AUFGEBAUT
        </span>
      </div>
    );
  }

  return (
    <div className="h-7 w-full flex items-center justify-center gap-2 bg-[#E10600]" role="alert">
      <span className="text-[10px] font-condensed font-bold uppercase tracking-widest text-white">
        VERBINDUNG UNTERBROCHEN
      </span>
    </div>
  );
});
