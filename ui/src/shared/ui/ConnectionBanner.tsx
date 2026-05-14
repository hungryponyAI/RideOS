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
        aria-label="Verbindungsstatus: Verbunden"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] shrink-0 animate-pulse" />
        <span className="text-[10px] font-medium text-[var(--success)]">Trainer verbunden</span>
      </div>
    );
  }

  if (status === "connecting" || status === "reconnecting") {
    return (
      <div className="h-7 w-full flex items-center justify-center gap-2 bg-[var(--surface)] border-b border-[var(--border)]" role="status">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse shrink-0" />
        <span className="text-[10px] font-medium text-[var(--warning)]">
          {status === "reconnecting" ? "Verbindung wird wiederhergestellt" : "Verbindung wird aufgebaut"}
        </span>
      </div>
    );
  }

  return (
    <div className="h-7 w-full flex items-center justify-center gap-2 bg-[var(--critical)]/10 border-b border-[var(--critical)]/30" role="alert">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--critical)] shrink-0" />
      <span className="text-[10px] font-medium text-[var(--critical)]">Trainerverbindung unterbrochen</span>
    </div>
  );
});
